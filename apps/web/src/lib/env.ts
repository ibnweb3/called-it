// Vite is configured with envPrefix ["VITE_", "NEXT_PUBLIC_"] so the same
// .env the rest of the monorepo writes (SPEC §1) works here unchanged.

const raw = import.meta.env as Record<string, string | undefined>;

function pick(name: string, fallback: string): string {
  return raw[`VITE_${name}`] ?? raw[`NEXT_PUBLIC_${name}`] ?? fallback;
}

export const API_URL = pick("API_URL", "http://localhost:8787").replace(/\/$/, "");
export const NETWORK = pick("NETWORK", "testnet") as "testnet" | "mainnet";
export const FAUCET_URL = pick("FAUCET_URL", "https://testnet.somnia.network/");

/**
 * Squads backend for demo mode. When set, the demo app auths the connected
 * wallet against this URL and routes squads + the global leaderboard through it,
 * so an invite link works across devices and everyone in a room shares one
 * board. Unset → squads stay local to the browser (single-device). Ignored in
 * live mode, which talks to API_URL for everything.
 */
export const SQUADS_URL = pick("SQUADS_URL", "").replace(/\/$/, "");

/**
 * demo — a local round engine deals and settles rounds; no backend, no chain,
 *        no funding. The app is fully playable on its own. Connecting a wallet
 *        is optional here — it just sets your on-leaderboard identity.
 * live — REST + WS against API_URL, calls signed in the player's connected
 *        wallet on chain.
 */
export const MODE = (pick("MODE", "demo") === "live" ? "live" : "demo") as "demo" | "live";

export const IS_TESTNET = NETWORK !== "mainnet";
