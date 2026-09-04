// Integer tick/lot math. Ported from @dreamdex-bot-kit/ec-core (MIT) — the one
// thing you must not get wrong on an 18-decimal venue.
//
// The unified `createOrder` converts a human price with
// `parseUnits(price.toFixed(18), 18)`. `(0.05).toFixed(18)` is
// "0.050000000000000003" — three wei off the tick grid — and the pool rejects it
// with InvalidPrice. Measured on mainnet: of fifteen ordinary probabilities only
// 0.25, 0.5 and 0.75 survive. A 6-decimal venue (testnet) never shows this.
//
// So prices and sizes are converted in TICK and LOT units — small integers,
// where a single Math.round absorbs the float epsilon — and sent through the raw
// trader tier as exact bigints.

/**
 * Snap a human amount to a whole number of grid steps.
 *
 * `stepsPerOne` is small (1000 on an 18-decimal venue with a 1e15 tick), so the
 * float multiply cannot drift by a whole step and Math.round lands on the
 * intended one. Multiplying by 10^18 instead — what the SDK does — is the bug.
 */
export function toSteps(human: number, decimals: number, step: bigint, mode: "round" | "floor"): bigint {
  const one = 10n ** BigInt(decimals);
  const stepsPerOne = Number(one / step);
  const n = human * stepsPerOne;
  const steps = mode === "round" ? Math.round(n) : Math.floor(n + 1e-9);
  return BigInt(Math.max(0, steps)) * step;
}

/** Human amount → raw units (10^decimals), exact for any decimals. */
export function toRawUnits(human: number, decimals: number): bigint {
  const [i, f = ""] = human.toFixed(decimals).split(".");
  return BigInt(i + f.padEnd(decimals, "0"));
}

/** Raw units → human number. */
export function fromRawUnits(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/**
 * Largest size ≤ `human` that is an exact multiple of the lot grid. Returns 0
 * when the request is below one lot — callers must skip, not send.
 */
export function quantizeSize(human: number, decimals: number, lot: bigint): number {
  const lotHuman = Number(lot) / 10 ** decimals;
  if (!(human > 0) || lotHuman <= 0) return 0;
  const lots = Math.floor(human / lotHuman + 1e-9);
  if (lots < 1) return 0;
  for (let n = lots; n >= 1; n--) {
    const size = Number((n * lotHuman).toFixed(decimals));
    if (toRawUnits(size, decimals) % lot === 0n) return size;
  }
  return 0;
}

/** Hold a derived probability inside the open interval. */
export const clampProbability = (p: number, lo = 0.01, hi = 0.99): number =>
  Math.min(hi, Math.max(lo, p));
