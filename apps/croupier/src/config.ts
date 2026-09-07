// Croupier knobs. Everything DreamDEX (network, venue, key, tick/lot) comes from
// the repo-root .env via @dreamdex-bot-kit/ec-core; only the croupier's own
// behaviour lives here.
//
// loadEnv() must run before the process.env reads below — this module is the
// first thing index.ts imports, so calling it here (rather than waiting for
// main() to call loadConfig()) guarantees .env is loaded before ANY module in
// this app reads process.env, including float.ts's module-level loadFloat().

import { envNum, loadEnv } from "@dreamdex-bot-kit/ec-core";

loadEnv();

export const CFG = {
  /** Which underlying to make a market on. Called It v1 runs BTC only. */
  underlying: (process.env.EC_UNDERLYING ?? "BTC").toUpperCase(),

  /** Requote cadence. A fresh window still gets its first quote on the next
   *  pass; this only sets how often we RE-check a market we're already in.
   *  On-chain latency makes a full pass ~20-30s anyway, so going below that
   *  just burns gas re-posting quotes that barely moved. */
  refreshMs: envNum("CROUPIER_REFRESH_MS", 15_000),

  /** Half-spread in probability. 0.02 = quote 0.48 / 0.52 around a 0.50 fair. */
  halfSpread: envNum("CROUPIER_SPREAD", 0.02),

  /** Don't cancel + re-post a resting quote unless the fair (or the curve's
   *  half-spread) has moved at least this much. Default = one half-spread:
   *  a smaller move isn't worth two cancels + two places in gas. */
  requoteFairMove: envNum("CROUPIER_REQUOTE_FAIR", 0.02),

  /** ...or unless the target size changed by at least this fraction. */
  requoteSizeFrac: envNum("CROUPIER_REQUOTE_SIZE_FRAC", 0.25),

  /** After this many consecutive PostOnlyWouldCross rejections on one market,
   *  stop hammering it — another maker already has it covered. */
  crossBackoffAfter: envNum("CROUPIER_CROSS_BACKOFF_AFTER", 3),

  /** How long to leave a crossed-out market alone before trying again (ms). */
  crossBackoffMs: envNum("CROUPIER_CROSS_BACKOFF_MS", 120_000),

  /** Only quote rolling windows this short or shorter (seconds). The far-out
   *  daily/weekly windows barely move and aren't the product's target —
   *  quoting them is mostly wasted gas. 0 = no limit. */
  maxWindowSec: envNum("CROUPIER_MAX_WINDOW_SEC", 7_200),

  /** Contracts per side per quote. */
  quoteSize: envNum("CROUPIER_QUOTE_SIZE", 25),

  /** Net inventory (UP − DOWN) past which the croupier quotes only the unwinding side. */
  maxInventory: envNum("CROUPIER_MAX_INVENTORY", 100),

  /** Fair-value mode: "flat" = anchor 0.50, "drift" = 0.50 + k·return (needs a
   *  price feed), "curve" = @called-it/curve's time-aware model (also needs
   *  a price feed — see fair-value.ts). */
  fairMode: (process.env.CROUPIER_FAIR ?? "flat").toLowerCase() as "flat" | "drift" | "curve",

  /** How hard the drift anchor leans on the underlying's short-term return. */
  driftSensitivity: envNum("CROUPIER_DRIFT_SENSITIVITY", 8),

  /** The anchor is clamped to this band, so the croupier never quotes a runaway probability. */
  anchorLo: envNum("CROUPIER_ANCHOR_LO", 0.4),
  anchorHi: envNum("CROUPIER_ANCHOR_HI", 0.6),

  /** "curve" mode: assumed annualized volatility of the underlying. */
  curveVolAnnual: envNum("CURVE_VOL_ANNUAL", 0.6),
  /** "curve" mode: how fast quote size decays as a window empties (sizeMult = frac^this). */
  curveSizeDecayPow: envNum("CURVE_SIZE_DECAY_POW", 1.5),
  /** "curve" mode: how much the spread widens by the time a window is about to close. */
  curveWidenGain: envNum("CURVE_WIDEN_GAIN", 3),
  /** "curve" mode: stop quoting a window inside this many seconds of expiry. */
  curveMinQuoteSec: envNum("CURVE_MIN_QUOTE_SEC", 45),

  /** Kill switch: pause + flatten if realized USDso drops more than this from the
   *  daily baseline. A conservative proxy — it ignores open positions and
   *  unclaimed winnings, so it trips early rather than late. */
  maxDayLoss: envNum("CROUPIER_MAX_DAY_LOSS", 50),

  /** Optional webhook (Slack/Discord/Telegram) for pause + daily-summary alerts. */
  alertWebhook: process.env.CROUPIER_ALERT_WEBHOOK ?? "",

  /** Extra ceiling on how much the croupier borrows from the Float vault
   *  (tUSDC, plain units) — consumed by float.ts. 0 = no extra ceiling, just
   *  the vault's own maxBorrow / borrow-ratio caps. */
  floatTarget: envNum("CROUPIER_FLOAT_TARGET", 0),

  /** How often the croupier settles + re-borrows from the Float vault while
   *  running (ms), so the share price moves live instead of only at shutdown.
   *  0 disables periodic cycling — borrow once at start, settle once at stop. */
  floatCycleMs: envNum("CROUPIER_FLOAT_CYCLE_MS", 300_000),
} as const;
