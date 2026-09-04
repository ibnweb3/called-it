// Croupier knobs. Everything DreamDEX (network, venue, key, tick/lot) comes from
// the repo-root .env via @dreamdex-bot-kit/ec-core; only the croupier's own
// behaviour lives here.

import { envNum } from "@dreamdex-bot-kit/ec-core";

export const CFG = {
  /** Which underlying to make a market on. Called It v1 runs BTC only. */
  underlying: (process.env.EC_UNDERLYING ?? "BTC").toUpperCase(),

  /** Requote cadence. Low, so a fresh window is quoted within seconds of opening. */
  refreshMs: envNum("CROUPIER_REFRESH_MS", 4_000),

  /** Half-spread in probability. 0.02 = quote 0.48 / 0.52 around a 0.50 fair. */
  halfSpread: envNum("CROUPIER_SPREAD", 0.02),

  /** Contracts per side per quote. */
  quoteSize: envNum("CROUPIER_QUOTE_SIZE", 25),

  /** Net inventory (UP − DOWN) past which the croupier quotes only the unwinding side. */
  maxInventory: envNum("CROUPIER_MAX_INVENTORY", 100),

  /** Fair-value mode: "flat" = anchor 0.50, "drift" = 0.50 + k·return (needs a price feed). */
  fairMode: (process.env.CROUPIER_FAIR ?? "flat").toLowerCase() as "flat" | "drift",

  /** How hard the drift anchor leans on the underlying's short-term return. */
  driftSensitivity: envNum("CROUPIER_DRIFT_SENSITIVITY", 8),

  /** The anchor is clamped to this band, so the croupier never quotes a runaway probability. */
  anchorLo: envNum("CROUPIER_ANCHOR_LO", 0.4),
  anchorHi: envNum("CROUPIER_ANCHOR_HI", 0.6),

  /** Kill switch: pause + flatten if realized USDso drops more than this from the
   *  daily baseline. A conservative proxy — it ignores open positions and
   *  unclaimed winnings, so it trips early rather than late. */
  maxDayLoss: envNum("CROUPIER_MAX_DAY_LOSS", 50),

  /** Optional webhook (Slack/Discord/Telegram) for pause + daily-summary alerts. */
  alertWebhook: process.env.CROUPIER_ALERT_WEBHOOK ?? "",
} as const;
