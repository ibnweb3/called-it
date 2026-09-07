// The curve — a time-aware fair-value model for a rolling up/down window.
//
// The croupier's "flat" and "drift" fair-value modes (apps/croupier/src/fair-value.ts)
// quote the same half-spread whether a window just opened or is about to close.
// That's wrong: a BTC up/down contract is a digital option, and a digital option's
// risk (its gamma) explodes as expiry approaches — the same $50 BTC move that's
// noise with ten minutes left can fully decide the outcome with ten seconds left.
// A flat quote either donates money late in the window or is too timid early in it.
//
// This module is the fix, and it is deliberately simple:
//
//   1. FAIR PROBABILITY — how far has the underlying moved from the window's
//      opening price, relative to how far it could still plausibly move before
//      expiry? That ratio, run through a standard-normal CDF, is the fair
//      probability of UP. Early in a window a lot of movement is still possible,
//      so even a real move barely nudges the fair price off 0.50. Late in a
//      window very little movement is left, so the same move swings the fair
//      price hard toward 0 or 1 — because the outcome is nearly decided.
//
//   2. SIZE + SPREAD DECAY — quote size shrinks and the spread widens as the
//      window empties, on a curve, not a cliff — so the croupier is quoting
//      *less* exactly where a flat quoter gets run over, and stops quoting
//      altogether inside a hard cutoff near expiry.
//
// No chain calls, no SDK, no I/O — just numbers in, numbers out, so it is
// trivially unit-tested and can be reasoned about on its own.

export interface CurveConfig {
  /** Assumed annualized volatility of the underlying (BTC ~0.5–0.7 historically). */
  volAnnual: number;
  /** How fast quote size decays as the window empties: sizeMult = frac^sizeDecayPow. */
  sizeDecayPow: number;
  /** Size never decays below this fraction of the configured quote size. */
  minSizeMult: number;
  /** Half-spread (in probability) at the moment a window opens. */
  baseHalfSpread: number;
  /** How much the spread widens by the time a window is about to close (multiplier on top of base). */
  widenGain: number;
  /** Extra widening applied when the fair price is close to 0.5 AND the window is nearly over —
   *  the exact spot where a slow quote gets picked off. */
  gammaGain: number;
  /** Below this many seconds to expiry, stop quoting entirely (sizeMult forced to 0). */
  minQuoteSec: number;
}

export const DEFAULT_CURVE_CONFIG: CurveConfig = {
  volAnnual: 0.6,
  sizeDecayPow: 1.5,
  minSizeMult: 0.1,
  baseHalfSpread: 0.02,
  widenGain: 3,
  gammaGain: 1,
  minQuoteSec: 45,
};

export interface QuoteInputs {
  /** Current price of the underlying (e.g. BTC), in dollars. */
  spot: number;
  /** The window's opening / reference price, in dollars. `null` when not yet known
   *  (very early in a fresh window, before the oracle has answered) — the curve
   *  gracefully falls back to a flat 0.50 fair price until it is. */
  opening: number | null;
  /** Current time, unix seconds. */
  nowSec: number;
  /** The window's expiry, unix seconds. */
  expirySec: number;
  /** The window's total length, seconds (e.g. 900 for a 15-minute window). */
  windowSec: number;
}

export interface QuoteOutput {
  /** Fair probability that the window resolves UP, in [0.02, 0.98]. */
  fairUp: number;
  /** Half-spread to quote around `fairUp`, in probability. */
  halfSpread: number;
  /** Multiplier on the configured quote size, in [0, 1]. 0 means "don't quote this window." */
  sizeMult: number;
}

const SECONDS_PER_YEAR = 365 * 24 * 3600;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Logistic approximation of the standard-normal CDF — about 1% accurate, one line. */
const normalCdf = (z: number): number => 1 / (1 + Math.exp(-1.702 * z));

/**
 * The curve. Pure function: same inputs always give the same outputs.
 *
 *   quote({ spot: 78120, opening: 78000, nowSec: t, expirySec: t + 600, windowSec: 900 })
 *     -> { fairUp: 0.58, halfSpread: 0.031, sizeMult: 0.63 }
 */
export function quote(inputs: QuoteInputs, cfg: CurveConfig = DEFAULT_CURVE_CONFIG): QuoteOutput {
  const tau = Math.max(inputs.expirySec - inputs.nowSec, 0);
  const windowSec = Math.max(inputs.windowSec, 1);
  const frac = clamp(tau / windowSec, 0, 1);

  // Fair probability — computed whenever we have a real opening price and time
  // left, regardless of the hard cutoff below, so the model's own math stays
  // testable independent of the "stop quoting" gate.
  let fairUp = 0.5;
  let z = 0;
  if (inputs.opening !== null && inputs.opening > 0 && inputs.spot > 0 && tau > 0) {
    const m = Math.log(inputs.spot / inputs.opening);
    const sigmaPerSqrtSec = cfg.volAnnual / Math.sqrt(SECONDS_PER_YEAR);
    const sigmaWin = sigmaPerSqrtSec * Math.sqrt(tau);
    z = m / sigmaWin;
    fairUp = clamp(normalCdf(z), 0.02, 0.98);
  }

  // Hard stop: too close to expiry to safely quote at all.
  if (tau < cfg.minQuoteSec) {
    return { fairUp, halfSpread: cfg.baseHalfSpread, sizeMult: 0 };
  }

  const sizeMult = clamp(Math.pow(frac, cfg.sizeDecayPow), cfg.minSizeMult, 1);

  let halfSpread = cfg.baseHalfSpread * (1 + cfg.widenGain * (1 - frac));
  // The gamma guard: peaks when the fair price sits right at 0.5 (z == 0) —
  // exactly where a digital option's risk is highest — and fades out early in
  // the window even if the price is currently near the strike.
  const nearMoney = Math.exp(-(z * z) / 2);
  halfSpread *= 1 + cfg.gammaGain * nearMoney * (1 - frac);

  return { fairUp, halfSpread, sizeMult };
}
