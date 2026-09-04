// The Called It domain vocabulary. The game speaks in "rounds", "calls",
// "chips" and "streaks"; this module maps those onto the SDK's binary markets.

export type Address = `0x${string}`;
export type MarketId = `0x${string}`;

export type Asset = "BTC" | "ETH";

/** UP = the market closes at or above its opening price. DOWN = below. */
export type Side = "UP" | "DOWN";

/** On-chain MarketStatus: 0 Listed · 1 Trading · 2 Locked · 3 Settling · 4 Resolved · 5 Voided. */
export type RoundStatus = "listed" | "trading" | "locked" | "settling" | "resolved" | "voided";

/** A live (or recently live) window everyone trades together. */
export interface Round {
  marketId: MarketId;
  /** The tradable YES symbol, e.g. "BTC-0-05AUG26#YES". */
  symbol: string;
  asset: Asset;
  /** Window length in seconds (900 = 15m, 3600 = 1h). */
  intervalSec: number;
  status: RoundStatus;
  /** Unix seconds. `locksAt` is the on-chain expiry; `opensAt = locksAt - intervalSec`. */
  opensAt: number;
  locksAt: number;
  /** The price the close is compared against. Null until the oracle answers. */
  openingPrice: number | null;
  /** Live UP probability implied by the book mid, in (0,1). Null on an empty book. */
  upProbability: number | null;
  /** Best prices you could trade right now, UP terms. */
  book: { upBid: number | null; upAsk: number | null; downBid: number | null; downAsk: number | null };
}

/** The result of placing a call. */
export interface CallReceipt {
  marketId: MarketId;
  side: Side;
  /** Chips actually spent (USDso), after lot snapping. */
  spent: number;
  /** Contracts held after the fill. Each pays 1 USDso if this side wins. */
  contracts: number;
  /** Average price paid per contract, in this side's own probability. */
  avgPrice: number;
  /** Max you can win (contracts × 1) and max you can lose (== spent). */
  maxWin: number;
  txHash?: string;
  /** True when nothing filled (e.g. book emptied between quote and send). */
  missed: boolean;
}

/** A position in one round, from the player's point of view. */
export interface Position {
  marketId: MarketId;
  asset: Asset;
  intervalSec: number;
  side: Side;
  contracts: number;
  status: RoundStatus;
  /** "pending" while trading/locked, then "won" | "lost" | "void". */
  outcome: "pending" | "won" | "lost" | "void";
  /** Claimable USDso once settled and not yet redeemed. */
  claimable: number;
  locksAt: number;
}

/** A finished round and how it landed — the feed streaks and notifications read. */
export interface SettledRound {
  marketId: MarketId;
  asset: Asset;
  intervalSec: number;
  locksAt: number;
  openingPrice: number | null;
  closingPrice: number | null;
  /** "UP" | "DOWN" winner, or "VOID". */
  result: Side | "VOID";
}

export interface ChipOption {
  /** USDso stake. */
  usd: number;
  label: string;
}

export const CHIPS: ChipOption[] = [
  { usd: 1, label: "$1" },
  { usd: 5, label: "$5" },
  { usd: 25, label: "$25" },
];
