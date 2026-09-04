import type { Book, Side } from "./types";

/** $8.90 — money the player can win or lose is never rounded away. */
export function usd(n: number | null | undefined, dp = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

/** +$8.90 / -$5.00 — for P&L, where the sign is the point. */
export function signedUsd(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

/** 77,903.45 — the line to beat. */
export function price(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return "—";
  return `${Math.round(p * 100)}%`;
}

/** 07:12 — or 1:04:11 once there is an hour on the clock. */
export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** 14:45 — the wall-clock moment the window shuts. */
export function timeOfDay(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ago(unixSec: number): string {
  const d = Math.floor(Date.now() / 1000) - unixSec;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function who(handle: string | null, address: string): string {
  return handle || shortAddr(address);
}

export function intervalLabel(sec: number): string {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  return `${Math.round(sec / 60)}m`;
}

/**
 * What one contract costs on a side, taken from the ask. `null` when nobody is
 * quoting — that is the "warming up" state, not a zero.
 */
export function askFor(book: Book, side: Side): number | null {
  const a = side === "UP" ? book.upAsk : book.downAsk;
  return a && a > 0 && a < 1 ? a : null;
}

/** A $5 chip at $0.56 buys 8.93 contracts, each of which pays $1. */
export function contractsFor(chipUsd: number, ask: number | null): number | null {
  if (!ask) return null;
  return chipUsd / ask;
}

/** "pays 1.79x" — the multiple, which reads faster than a probability. */
export function payoutMultiple(ask: number | null): number | null {
  if (!ask) return null;
  return 1 / ask;
}

export function sideWord(side: Side): string {
  return side === "UP" ? "UP" : "DOWN";
}

export function arrow(side: Side | "VOID"): string {
  return side === "UP" ? "▲" : side === "DOWN" ? "▼" : "∅";
}
