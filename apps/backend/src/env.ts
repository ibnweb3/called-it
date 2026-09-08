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

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key]?.trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes";
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
  /**
   * Social-only mode: serve auth + squads + leaderboard for the demo-mode web
   * app, and skip everything that needs a live chain — the indexer, the round /
   * price / live-WS routes. This is how the hosted backend backs cross-device
   * squads without needing reliable RPC access or a running croupier. Implies
   * the demo-call endpoint (play-money calls recorded without an on-chain
   * position check).
   */
  socialOnly: bool("SOCIAL_ONLY", false),
} as const;
