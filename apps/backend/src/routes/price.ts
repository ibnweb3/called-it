// The live underlying price, for the app's "now $77,940 · +$37 ▲" line under a
// round's line to beat (SPEC §9).
//
// Deliberately never an error: an unconfigured feed or a quiet oracle returns
// 200 with `price: null` so the client drops one line of text rather than
// showing a failure. Nothing about settlement reads this.

import type { FastifyInstance } from "fastify";
import { livePrice } from "@called-it/chain";
import { chain } from "../chain.js";
import { memo } from "../lib/cache.js";

export function registerPriceRoutes(app: FastifyInstance): void {
  app.get<{ Params: { asset: string } }>("/v1/price/:asset", async (req, reply) => {
    const asset = req.params.asset?.toUpperCase();
    if (asset !== "BTC" && asset !== "ETH") {
      return reply.code(400).send({ error: "asset must be BTC or ETH" });
    }
    // The oracle updates far faster than a player can read it; 3s matches the
    // rounds cache and keeps a busy lobby off the feed.
    const row = await memo(`price:${asset}`, 3_000, () => livePrice(chain, asset));
    return { asset, price: row?.price ?? null, at: row?.at ?? null };
  });
}
