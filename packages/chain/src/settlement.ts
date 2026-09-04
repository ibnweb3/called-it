// Settlement: the feed of finished rounds (streaks + notifications read this),
// and turning a winning position back into USDso.
//
// Two things people get wrong (ported from @dreamdex-bot-kit/ec-core):
//   1. A settled market pays out only when someone calls redeem. Nobody sweeps
//      for you; the position just sits there.
//   2. `loadMarkets()` cannot find settled markets — the registry sweep skips
//      finalized binaries. Use `listBinaryMarkets({ status: "Finalized" })`.

import { assertTxOk, type CalledItClient } from "./client.js";
import { fromRawUnits } from "./quantize.js";
import { ORACLE_PRICE_DIVISOR } from "./rounds.js";
import type { Asset, MarketId, SettledRound, Side } from "./types.js";

interface FinalRow {
  marketId: string;
  venueId?: string;
  asset?: string;
  intervalSec?: number | string;
  strike?: number | string;
  expiry?: number | string;
}

/**
 * Recently finished rounds on the venue, newest first. This is the source for
 * the UP/DOWN history strip, streak updates, and result notifications.
 */
export async function settledRounds(
  client: CalledItClient,
  opts: { limit?: number; asset?: Asset } = {},
): Promise<SettledRound[]> {
  const { exchange, config } = client;
  const want = Math.max(1, Math.min(200, opts.limit ?? 30));

  const rows = (await exchange.client.listBinaryMarkets({
    venueId: config.venueId,
    status: "Finalized",
    limit: Math.min(200, want * 3),
  })) as FinalRow[];

  const settled = await Promise.all(
    rows
      .filter((r) => String(r.strike ?? "0") === "0")
      .filter((r) => !opts.asset || String(r.asset ?? "").toUpperCase() === opts.asset)
      .map(async (r): Promise<SettledRound | null> => {
        const marketId = r.marketId as MarketId;
        const onchain = await exchange.client.getMarketOnchain(marketId).catch(() => null);
        if (!onchain || !(onchain.isResolved || onchain.isVoided)) return null;

        const resolution = await exchange.client.getMarketResolution(marketId).catch(() => null);
        const result: Side | "VOID" = onchain.isVoided ? "VOID" : onchain.winningOutcome === 0 ? "UP" : "DOWN";

        return {
          marketId,
          asset: String(r.asset ?? "BTC").toUpperCase() as Asset,
          intervalSec: Number(r.intervalSec ?? 0) || 900,
          locksAt: Number(r.expiry ?? onchain.expiry ?? 0),
          openingPrice: numeric(resolution?.openingAnswer?.numericValue),
          closingPrice: numeric(resolution?.closingAnswer?.numericValue),
          result,
        };
      }),
  );

  return settled
    .filter((s): s is SettledRound => s !== null)
    .sort((a, b) => b.locksAt - a.locksAt)
    .slice(0, want);
}

/** Redeem every claimable side the signer holds in one settled round. Returns
 *  the USDso redeemed (0 if nothing was claimable). */
export async function claim(client: CalledItClient, marketId: MarketId): Promise<number> {
  if (!client.canTrade || !client.address) {
    throw new Error("claim needs a signer — create the client with the player's burner key.");
  }
  const { exchange } = client;
  const onchain = await exchange.client.getMarketOnchain(marketId);
  if (!onchain.isResolved && !onchain.isVoided) return 0;

  const held = {
    yes: await exchange.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account: client.address, id: onchain.yesId }),
    no: await exchange.client.getOutcomeBalance({ outcomeToken: onchain.outcomeToken, account: client.address, id: onchain.noId }),
  };

  // Voided → both sides refund at 0.5. Resolved → only the winning side.
  const toClaim: { idx: 0 | 1; amount: bigint }[] = onchain.isVoided
    ? ([0, 1] as const).map((idx) => ({ idx, amount: idx === 0 ? held.yes : held.no })).filter((c) => c.amount > 0n)
    : (() => {
        const winIdx = onchain.winningOutcome === 0 ? 0 : 1;
        const amount = winIdx === 0 ? held.yes : held.no;
        return amount > 0n ? [{ idx: winIdx as 0 | 1, amount }] : [];
      })();

  if (toClaim.length === 0) return 0;

  let redeemed = 0;
  for (const c of toClaim) {
    const res = await exchange.trader.redeem({
      marketId,
      market: onchain.marketAddress,
      outcomeToken: onchain.outcomeToken,
      outcomeIdx: c.idx,
      amount: c.amount,
    });
    assertTxOk(res, `redeem ${marketId} outcome ${c.idx}`);
    // Winner ≈ 1 per contract (minus a settlement fee, zero on dreamDEX); void ≈ 0.5.
    redeemed += fromRawUnits(c.amount, onchain.decimals) * (onchain.isVoided ? 0.5 : 1);
  }
  return Math.round(redeemed * 1e4) / 1e4;
}

/** Sweep the last `scan` settled rounds and claim anything the signer won. */
export async function claimAll(client: CalledItClient, scan = 25): Promise<{ rounds: number; usd: number }> {
  const settled = await settledRounds(client, { limit: scan });
  let rounds = 0;
  let usd = 0;
  for (const s of settled) {
    const got = await claim(client, s.marketId).catch(() => 0);
    if (got > 0) {
      rounds++;
      usd += got;
    }
  }
  return { rounds, usd: Math.round(usd * 1e4) / 1e4 };
}

/** Oracle answers are integer cents — see ORACLE_PRICE_DIVISOR in rounds.ts. */
function numeric(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n / ORACLE_PRICE_DIVISOR : null;
}
