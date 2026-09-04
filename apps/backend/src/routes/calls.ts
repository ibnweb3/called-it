// Recording a call. The burner wallet already placed and broadcast the bet in
// the browser; this endpoint just registers it so streaks, rooms and
// notifications know about it. Trust comes from re-reading the chain: we confirm
// the address actually holds the position before writing the row.

import type { FastifyInstance } from "fastify";
import { isAddress, getAddress } from "viem";
import { verifyPosition } from "../chain.js";
import { recordCall, upsertPlayer, getRoom, joinRoom, getRound } from "../db.js";
import { requireAuth } from "../auth.js";
import { invalidate } from "../lib/cache.js";
import { bus } from "../events.js";

interface Body {
  marketId: `0x${string}`;
  side: "UP" | "DOWN";
  chipUsd: number;
  contracts: number;
  spent: number;
  avgPrice: number;
  txHash?: string;
  roomId?: string;
}

export function registerCallRoutes(app: FastifyInstance): void {
  app.post<{ Body: Body }>(
    "/v1/calls",
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: "object",
          required: ["marketId", "side", "chipUsd", "contracts", "spent", "avgPrice"],
          properties: {
            marketId: { type: "string" },
            side: { type: "string", enum: ["UP", "DOWN"] },
            chipUsd: { type: "number", minimum: 0 },
            contracts: { type: "number", minimum: 0 },
            spent: { type: "number", minimum: 0 },
            avgPrice: { type: "number", minimum: 0, maximum: 1 },
            txHash: { type: "string" },
            roomId: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const address = req.player!;
      const { marketId, side, chipUsd, contracts, spent, avgPrice, txHash, roomId } = req.body;

      if (!isAddress(marketId)) return reply.code(400).send({ error: "bad marketId" });

      const round = getRound(marketId);
      if (round && round.result) return reply.code(409).send({ error: "round already settled" });

      // the trust check: you can't register a position you don't hold
      const { ok, held } = await verifyPosition(marketId, getAddress(address), side, contracts);
      if (!ok) {
        return reply.code(409).send({ error: "position not found on chain", held });
      }

      upsertPlayer(address);
      if (roomId && getRoom(roomId)) joinRoom(roomId, address);

      const call = recordCall({
        address,
        market_id: marketId,
        side,
        chip_usd: chipUsd,
        contracts,
        spent,
        avg_price: avgPrice,
        tx_hash: txHash ?? null,
        room_id: roomId ?? null,
      });

      invalidate(`pos:${address}`);
      const row = getRound(marketId);
      if (row) bus.emitT("round:update", row);

      return { ok: true, callId: call.id };
    },
  );
}
