import { config as dotenv } from "dotenv";
import type { Network } from "@called-it/chain";

dotenv();

function str(key: string, fallback?: string): string {
  const v = process.env[key]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing required env ${key}`);
}

function num(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${key}="${raw}" is not a number`);
  return n;
}

const network = str("NETWORK", "testnet").toLowerCase();

export const env = {
  port: num("PORT", 8787),
  network: (network === "mainnet" ? "mainnet" : "testnet") as Network,
  venueId: process.env.VENUE_ID?.trim() as `0x${string}` | undefined,
  databasePath: str("DATABASE_PATH", "./called-it.db"),
  indexerPollMs: num("INDEXER_POLL_MS", 5_000),
  jwtSecret: str("JWT_SECRET", "dev-only-insecure-secret"),
  corsOrigin: str("CORS_ORIGIN", "*"),
  priceFeedUrl: process.env.PRICE_FEED_URL?.trim() || undefined,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
  webAppUrl: process.env.WEB_APP_URL?.trim() || undefined,
} as const;
