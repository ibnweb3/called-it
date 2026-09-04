// One shared read-only client into DreamDEX event contracts. The backend never
// signs — burner wallets sign bets in the browser. This client reads rounds,
// books, settlements and outcome balances.

import {
  createClient,
  resolveConfig,
  currentRounds,
  settledRounds,
  type CalledItClient,
} from "@called-it/chain";
import { env } from "./env.js";

export const config = resolveConfig(env.network, {
  ...(env.venueId ? { venueId: env.venueId } : {}),
  ...(env.priceFeedUrl ? { priceFeedUrl: env.priceFeedUrl } : {}),
});

export const chain: CalledItClient = createClient(config);

export { currentRounds, settledRounds };

/**
 * Confirm `address` actually holds `contracts` (or more) of `side` in `marketId`.
 * This is how the backend trusts a "I placed a call" report without holding keys:
 * you can't register a position you don't own.
 */
export async function verifyPosition(
  marketId: `0x${string}`,
  address: `0x${string}`,
  side: "UP" | "DOWN",
  contracts: number,
): Promise<{ ok: boolean; held: number }> {
  const oc = await chain.exchange.client.getMarketOnchain(marketId).catch(() => null);
  if (!oc) return { ok: false, held: 0 };
  const id = side === "UP" ? oc.yesId : oc.noId;
  const raw = await chain.exchange.client.getOutcomeBalance({
    outcomeToken: oc.outcomeToken,
    account: address,
    id,
  });
  const held = Number(raw) / 10 ** oc.decimals;
  // small tolerance for rounding in the client's contract math
  return { ok: held + 1e-6 >= contracts && contracts > 0, held };
}
