// The live underlying price — what BTC is doing *right now*, as opposed to the
// opening price a round resolves against.
//
// This is decoration, not settlement. It powers the app's "now $77,940 · +$37 ▲"
// line under the line to beat and the croupier's fair-value drift; nothing that
// decides a win ever reads it. So every failure here returns null instead of
// throwing — a missing price should cost a line of text, not a screen.

import type { CalledItClient } from "./client.js";
import type { Asset } from "./types.js";

export interface LivePrice {
  asset: Asset;
  /** Dollars, human units. */
  price: number;
  /** Observation time, unix ms. */
  at: number;
}

/**
 * The latest oracle observation for an asset, or null when the client has no
 * price feed configured (mainnet, until an endpoint exists) or the feed has no
 * observations yet.
 */
export async function livePrice(client: CalledItClient, asset: Asset): Promise<LivePrice | null> {
  if (!client.config.priceFeedUrl) return null;
  try {
    const row = await client.exchange.fetchPrice(asset);
    if (!row || !Number.isFinite(row.price) || row.price <= 0) return null;
    return { asset, price: row.price, at: row.timestamp };
  } catch {
    return null;
  }
}

/** Both assets in one go, for a poller that does not want two round trips. */
export async function livePrices(client: CalledItClient): Promise<LivePrice[]> {
  const rows = await Promise.all((["BTC", "ETH"] as Asset[]).map((a) => livePrice(client, a)));
  return rows.filter((r): r is LivePrice => r !== null);
}
