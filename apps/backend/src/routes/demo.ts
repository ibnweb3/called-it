// POST /v1/calls/demo — record a *play-money* call and its outcome.
//
// The full endpoint (routes/calls.ts) re-reads the chain to prove the address
// actually holds the position. There is no chain here: the demo web app runs a
// local round engine, so this endpoint trusts the authed client's report. It
// exists for one reason — so a squad's weekly board and the global streak
// leaderboard are real and shared across everyone in the room, instead of each
// browser keeping its own. Only mounted in SOCIAL_ONLY mode.

import type { FastifyInstance } from "fastify";
import {
  upsertPlayer,
  getRoom,
  joinRoom,
  playerCallForRound,
  recordCall,
  gradeCall,
  getStreak,
  writeStreak,
} from "../db.js";
import { requireAuth } from "../auth.js";

interface Body {
  marketId: string;
  side: "UP" | "DOWN";
  chipUsd: number;
  contracts: number;
  spent: number;
  avgPrice: number;
  outcome: "won" | "lost" | "void";
  payout: number;
  roomId?: string;
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export function registerDemoCallRoutes(app: FastifyInstance): void {
  app.post<{ Body: Body }>(
    "/v1/calls/demo",
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: "object",
          required: ["marketId", "side", "chipUsd", "contracts", "spent", "avgPrice", "outcome", "payout"],
          properties: {
            marketId: { type: "string", minLength: 3, maxLength: 128 },
            side: { type: "string", enum: ["UP", "DOWN"] },
            chipUsd: { type: "number", minimum: 0, maximum: 1e6 },
            contracts: { type: "number", minimum: 0, maximum: 1e9 },
            spent: { type: "number", minimum: 0, maximum: 1e6 },
            avgPrice: { type: "number", minimum: 0, maximum: 1 },
            outcome: { type: "string", enum: ["won", "lost", "void"] },
            payout: { type: "number", minimum: 0, maximum: 1e9 },
            roomId: { type: "string", maxLength: 32 },
          },
        },
      },
    },
    async (req) => {
      const address = req.player!;
      const { marketId, side, chipUsd, contracts, spent, avgPrice, outcome, payout, roomId } = req.body;

      upsertPlayer(address);
      if (roomId && getRoom(roomId)) joinRoom(roomId, address);

      // idempotent: a client that re-reports a settled call must not double-count
      const existing = playerCallForRound(address, marketId);
      if (existing?.outcome) return { ok: true, already: true, callId: existing.id };

      const call = recordCall({
        address,
        market_id: marketId,
        side,
        chip_usd: chipUsd,
        contracts,
        spent,
        avg_price: avgPrice,
        tx_hash: null,
        room_id: roomId ?? null,
      });
      gradeCall(call.id, outcome, round4(payout));

      // same streak rule as streaks.ts::gradeRound
      const s = getStreak(address);
      s.total_calls += 1;
      if (outcome === "won") {
        s.total_wins += 1;
        s.current += 1;
        s.best = Math.max(s.best, s.current);
      } else if (outcome === "lost") {
        s.current = 0;
      }
      s.net_usd = round4(s.net_usd + round4(payout) - spent);
      writeStreak(s);

      return { ok: true, callId: call.id, streak: { current: s.current, best: s.best } };
    },
  );
}
