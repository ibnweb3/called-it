// Fair value: where the croupier centres its two-sided quote.
//
// v1 ("flat"): the anchor is 0.50. When the book has both sides we lean toward
// its mid; when it's empty (a fresh window) we quote 0.48 / 0.52 cold. That
// alone fixes "the market is empty" — every window is two-sided from second one.
//
// v1.1 ("drift"): the anchor becomes 0.50 + k·r, where r is the underlying's
// return over a short lookback, clamped to a tight band. Needs a price feed
// (bundled on testnet; PRICE_FEED_URL on mainnet). This is where the croupier
// starts to actually earn its spread instead of just donating liquidity.
//
// v1.2 ("curve"): fair value comes from @called-it/curve — a time-aware model
// that leans on the underlying's move away from the window's own opening price,
// scaled by how much room is left to move before expiry. Size shrinks and the
// spread widens as a window empties, instead of quoting the same flat spread
// from open to close. See packages/curve/src/index.ts for the model itself;
// this file only blends its output with the book, same as the other two modes.

import type { EcContext } from "@dreamdex-bot-kit/ec-core";
import { quote as curveQuote, DEFAULT_CURVE_CONFIG, type CurveConfig, type QuoteInputs, type QuoteOutput } from "@called-it/curve";
import { CFG } from "./config.js";

type Book = { bids: [number, number][]; asks: [number, number][] };

/** Rolling underlying-price samples, keyed by asset, for a windowed return. */
export class SpotMomentum {
  private samples: { at: number; price: number }[] = [];
  constructor(private readonly windowMs = 60_000, private readonly maxAgeMs = 120_000) {}

  record(price: number, at = Date.now()): void {
    if (!(price > 0)) return;
    const last = this.samples[this.samples.length - 1];
    if (last && last.at === at) return;
    this.samples.push({ at, price });
    const cutoff = at - this.windowMs * 3;
    while (this.samples.length && this.samples[0]!.at < cutoff) this.samples.shift();
  }

  /** The most recently recorded price, or null if nothing has been sampled yet. */
  latest(): number | null {
    const last = this.samples[this.samples.length - 1];
    return last ? last.price : null;
  }

  /** Fractional return over the lookback window, or null while warming up / stale. */
  return(now = Date.now()): number | null {
    if (this.samples.length < 2) return null;
    const latest = this.samples[this.samples.length - 1]!;
    if (now - latest.at > this.maxAgeMs) return null;
    const target = latest.at - this.windowMs;
    if (this.samples[0]!.at > target) return null;
    let lag = this.samples[0]!;
    for (const s of this.samples) {
      if (s.at <= target) lag = s;
      else break;
    }
    return lag.price > 0 ? (latest.price - lag.price) / lag.price : null;
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Poll the underlying spot into `mom`. Safe no-op when no price feed is set. */
export async function pollSpot(ctx: EcContext, asset: string, mom: SpotMomentum): Promise<void> {
  if (CFG.fairMode !== "drift" && CFG.fairMode !== "curve") return;
  try {
    const px = await ctx.exchange.fetchPrice(asset);
    if (px?.price) mom.record(px.price, px.timestamp ?? Date.now());
  } catch {
    /* feed not configured or unreachable — flat mode still works */
  }
}

/** The anchor probability for UP, before the half-spread is applied. */
export function anchorUp(mom: SpotMomentum): number {
  if (CFG.fairMode !== "drift") return 0.5;
  const r = mom.return();
  if (r === null) return 0.5;
  return clamp(0.5 + CFG.driftSensitivity * r, CFG.anchorLo, CFG.anchorHi);
}

/** Fair UP probability: the anchor, pulled toward the book mid when one exists. */
export function fairUp(book: Book, mom: SpotMomentum): number {
  const anchor = anchorUp(mom);
  const bid = book.bids[0]?.[0];
  const ask = book.asks[0]?.[0];
  if (bid !== undefined && ask !== undefined) {
    const mid = (bid + ask) / 2;
    return clamp(0.6 * anchor + 0.4 * mid, 0.05, 0.95);
  }
  return anchor;
}

// "curve" mode's own config, built from CFG once. `baseHalfSpread` deliberately
// reuses CROUPIER_SPREAD (CFG.halfSpread) rather than introducing a second
// spread knob — it's the same concept, just the starting point the curve widens
// from as a window empties.
export const CURVE_CFG: CurveConfig = {
  ...DEFAULT_CURVE_CONFIG,
  volAnnual: CFG.curveVolAnnual,
  sizeDecayPow: CFG.curveSizeDecayPow,
  baseHalfSpread: CFG.halfSpread,
  widenGain: CFG.curveWidenGain,
  minQuoteSec: CFG.curveMinQuoteSec,
};

/**
 * Fair UP probability for "curve" mode: the model's own fair price, pulled
 * toward the book mid when one exists (30% weight — the model leads, but an
 * informed book still gets a say). halfSpread/sizeMult pass through unchanged;
 * they already encode the model's own view of how much to quote and how wide.
 */
export function fairQuote(book: Book, inputs: QuoteInputs): QuoteOutput {
  const model = curveQuote(inputs, CURVE_CFG);
  const bid = book.bids[0]?.[0];
  const ask = book.asks[0]?.[0];
  if (bid !== undefined && ask !== undefined) {
    const mid = (bid + ask) / 2;
    return { ...model, fairUp: clamp(0.7 * model.fairUp + 0.3 * mid, 0.05, 0.95) };
  }
  return model;
}
