// Swapped in for `@called-it/chain` when the app is built with
// CHAIN_IN_BROWSER=0 — i.e. when the markets SDK turns out not to bundle for a
// browser (SPEC §3). Reads still come from the backend; only writes are gone,
// and they say so out loud instead of failing at build time.

const UNAVAILABLE =
  "On-chain calls are switched off in this build (CHAIN_IN_BROWSER=0). See SPEC §3 — Fallback A (Web Worker) or B (backend broadcast).";

export function resolveConfig(): never {
  throw new Error(UNAVAILABLE);
}

export function createClient(): never {
  throw new Error(UNAVAILABLE);
}

export function placeCall(): never {
  throw new Error(UNAVAILABLE);
}

export function claim(): never {
  throw new Error(UNAVAILABLE);
}

export function claimAll(): never {
  throw new Error(UNAVAILABLE);
}
