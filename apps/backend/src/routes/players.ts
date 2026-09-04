import type { FastifyInstance } from "fastify";
import { isAddress, getAddress } from "viem";
import { positions } from "@called-it/chain";
import { chain } from "../chain.js";
import {
  upsertPlayer,
  getPlayer,
  getStreak,
  callsForPlayer,
  linkTelegram,
  setHandle,
  topStreaks,
  type StreakRow,
} from "../db.js";
import { badgesFor, streakMultiplier } from "../lib/badges.js";
import { memo } from "../lib/cache.js";
import { requireAuth } from "../auth.js";

export function registerPlayerRoutes(app: FastifyInstance): void {
  // Public profile: streak, badges, recent calls, and live positions from chain.
  app.get<{ Params: { address: string } }>("/v1/players/:address", async (req, reply) => {
    if (!isAddress(req.params.address)) return reply.code(400).send({ error: "bad address" });
    const address = req.params.address.toLowerCase();
    upsertPlayer(address);

    const streak = getStreak(address);
    const player = getPlayer(address)!;

    const livePositions = await memo(`pos:${address}`, 12_000, () =>
      positions(chain, getAddress(address)).catch(() => []),
    );

    return {
      address: getAddress(address),
      handle: player.handle,
      telegramLinked: Boolean(player.tg_chat_id),
      streak: streakView(streak),
      badges: badgesFor(streak),
      recentCalls: callsForPlayer(address, 30).map((c) => ({
        marketId: c.market_id,
        side: c.side,
        chipUsd: c.chip_usd,
        contracts: c.contracts,
        spent: c.spent,
        outcome: c.outcome,
        payout: c.payout,
        placedAt: c.placed_at,
        roomId: c.room_id,
      })),
      positions: livePositions,
    };
  });

  // Link a Telegram chat to the authed address (called by the bot's /start deep
  // link, which passes a one-time code the web app minted — see telegram.ts).
  app.post<{ Body: { chatId: string; notifyRounds?: boolean } }>(
    "/v1/players/me/telegram",
    { preHandler: requireAuth },
    async (req) => {
      upsertPlayer(req.player!);
      linkTelegram(req.player!, String(req.body.chatId), req.body.notifyRounds ?? true);
      return { ok: true };
    },
  );

  app.post<{ Body: { handle: string } }>(
    "/v1/players/me/handle",
    { preHandler: requireAuth },
    async (req, reply) => {
      const handle = String(req.body.handle ?? "").trim().slice(0, 24);
      if (handle.length < 2) return reply.code(400).send({ error: "handle too short" });
      upsertPlayer(req.player!);
      setHandle(req.player!, handle);
      return { ok: true, handle };
    },
  );

  // Global streak leaderboard (best streak, then net USD).
  app.get<{ Querystring: { limit?: string } }>("/v1/leaderboard", async (req) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const rows = topStreaks(limit);
    return {
      leaderboard: rows.map((r, i) => ({
        rank: i + 1,
        address: getAddress(r.address),
        handle: r.handle,
        ...streakView(r),
      })),
    };
  });
}

function streakView(s: StreakRow) {
  return {
    current: s.current,
    best: s.best,
    totalCalls: s.total_calls,
    totalWins: s.total_wins,
    winRate: s.total_calls > 0 ? Math.round((s.total_wins / s.total_calls) * 100) / 100 : 0,
    netUsd: s.net_usd,
    multiplier: streakMultiplier(s.current),
  };
}
