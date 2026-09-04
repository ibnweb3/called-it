import type { FastifyInstance } from "fastify";
import { chain, currentRounds } from "../chain.js";
import { roundHistory } from "../db.js";
import { memo } from "../lib/cache.js";

export function registerRoundRoutes(app: FastifyInstance): void {
  // The live window(s) a player can call right now.
  app.get<{ Querystring: { asset?: string } }>("/v1/rounds/current", async (req) => {
    const asset = normAsset(req.query.asset);
    const rounds = await memo(`rounds:current:${asset ?? "all"}`, 3_000, () =>
      currentRounds(chain, asset),
    );
    return { rounds };
  });

  // The settled UP/DOWN strip.
  app.get<{ Querystring: { asset?: string; limit?: string } }>("/v1/rounds/history", async (req) => {
    const asset = normAsset(req.query.asset);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const rows = roundHistory(asset, limit).map((r) => ({
      marketId: r.market_id,
      asset: r.asset,
      intervalSec: r.interval_sec,
      locksAt: r.locks_at,
      result: r.result,
      openingPrice: r.opening_price,
      closingPrice: r.closing_price,
    }));
    return { rounds: rows };
  });
}

function normAsset(a?: string): "BTC" | "ETH" | undefined {
  const up = a?.toUpperCase();
  return up === "BTC" || up === "ETH" ? up : undefined;
}
