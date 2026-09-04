// The shapes the UI talks in. They mirror apps/backend's REST payloads (SPEC §2)
// and @called-it/chain's return types, redeclared here so the app never has to
// import the chain package just to render a screen.

export type Asset = "BTC" | "ETH";
export type Side = "UP" | "DOWN";
export type RoundStatus = "listed" | "trading" | "locked" | "settling" | "resolved" | "voided";
export type Outcome = "pending" | "won" | "lost" | "void";

export interface Book {
  upBid: number | null;
  upAsk: number | null;
  downBid: number | null;
  downAsk: number | null;
}

export interface Round {
  marketId: string;
  symbol: string;
  asset: Asset;
  intervalSec: number;
  status: RoundStatus;
  opensAt: number;
  locksAt: number;
  openingPrice: number | null;
  upProbability: number | null;
  book: Book;
}

export interface SettledRound {
  marketId: string;
  asset: Asset;
  intervalSec: number;
  locksAt: number;
  result: Side | "VOID";
  openingPrice: number | null;
  closingPrice: number | null;
}

export interface Streak {
  current: number;
  best: number;
  totalCalls: number;
  totalWins: number;
  winRate: number;
  netUsd: number;
  multiplier: number;
}

export interface Badge {
  key: string;
  label: string;
  hit: boolean;
}

export interface PlayerCall {
  marketId: string;
  side: Side;
  chipUsd: number;
  contracts: number;
  spent: number;
  outcome: Outcome;
  payout: number | null;
  placedAt: number;
  roomId: string | null;
  asset?: Asset;
}

export interface Position {
  marketId: string;
  asset: Asset;
  intervalSec: number;
  side: Side;
  contracts: number;
  status: RoundStatus;
  outcome: Outcome;
  claimable: number;
  locksAt: number;
}

export interface Profile {
  address: string;
  handle: string | null;
  telegramLinked: boolean;
  streak: Streak;
  badges: Badge[];
  recentCalls: PlayerCall[];
  positions: Position[];
}

export interface LeaderRow extends Streak {
  rank: number;
  address: string;
  handle: string | null;
}

export interface Room {
  id: string;
  name: string;
}

export interface RoomMember {
  rank: number;
  address: string;
  handle: string | null;
  calls: number;
  wins: number;
  net: number;
  bestStreak: number;
}

export interface RoomDetail extends Room {
  memberCount: number;
  weekStart: number;
  leaderboard: RoomMember[];
}

/** What `placeCall` gives back, plus the "nothing filled" case. */
export interface CallReceipt {
  marketId: string;
  side: Side;
  spent: number;
  contracts: number;
  avgPrice: number;
  maxWin: number;
  txHash?: string;
  missed: boolean;
}

export interface ResultEvent {
  address: string;
  asset: Asset;
  side: Side;
  marketId: string;
  roundResult: Side | "VOID";
  result: "won" | "lost" | "void";
  chipUsd: number;
  payout: number;
  streakCurrent: number;
  streakBest: number;
}

/** Server → client frames on WS /v1/live. */
export type LiveFrame =
  | { t: "hello"; now: number }
  | { t: "tick"; now: number }
  | { t: "round"; round: Round }
  | { t: "locking"; round: Round }
  | { t: "settled"; round: SettledRound }
  | { t: "subscribed"; address: string }
  | { t: "slip"; slip: SlipView; event: SlipEvent }
  | ({ t: "result" } & ResultEvent);

// ---- The Slip: a compounding run of calls ----------------------------------
//
// A slip is an ordered list of legs played one after another in time. Each win
// rolls its whole payout into the next leg, so the stake compounds; one wrong
// call ends the run. The player can cash out the open leg at any point.

export interface SlipLeg {
  asset: Asset;
  side: Side;
}

/** When the run banks automatically. "manual" is reserved for the autopilot. */
export type SlipStop =
  | { kind: "all" }
  | { kind: "multiple"; x: number }
  | { kind: "manual" };

export interface SlipPlan {
  legs: SlipLeg[];
  /** Every leg runs on this cadence; leg k+1 is the next window after leg k locks. */
  intervalSec: number;
  /** Opening stake, in play money — one of CHIPS. */
  stake: number;
  stop: SlipStop;
}

export type SlipStatus = "live" | "matured" | "busted";

export interface SlipLegView {
  index: number;
  asset: Asset;
  side: Side;
  marketId: string | null;
  locksAt: number | null;
  /** Ask paid per contract on entry. */
  entryPrice: number | null;
  contracts: number | null;
  /** USD carried into this leg. */
  stakeIn: number;
  outcome: Outcome;
  /** USD proceeds once this leg settled (0 if it lost). */
  valueOut: number | null;
}

export interface SlipView {
  id: string;
  plan: SlipPlan;
  status: SlipStatus;
  /** Index of the leg in play (or the last leg reached). */
  currentLeg: number;
  legs: SlipLegView[];
  stake: number;
  /** Live mark of the open leg while running; the banked amount once settled. */
  value: number;
  multiple: number;
  /** Credited to the wallet when the run banks or is cashed out. */
  owed: number;
  createdAt: number;
}

export type SlipEvent = "armed" | "advanced" | "void-retry" | "matured" | "busted";

/** Preset stop rules the builder offers. */
export const SLIP_STOPS: Array<{ label: string; stop: SlipStop }> = [
  { label: "Play it all", stop: { kind: "all" } },
  { label: "Bank at 5×", stop: { kind: "multiple", x: 5 } },
  { label: "Bank at 10×", stop: { kind: "multiple", x: 10 } },
];

export const SLIP_MAX_LEGS = 6;

/** The live underlying, for the delta under the line to beat. */
export interface LivePriceRow {
  asset: Asset;
  /** Dollars. */
  price: number;
  /** Observation time, unix ms. */
  at: number;
}

export interface Balances {
  /** tUSDC — the stake. */
  usd: number;
  /** STT — gas. */
  gas: number;
}

export const CHIPS = [1, 5, 25] as const;
export type Chip = (typeof CHIPS)[number];

export const INTERVALS: Array<{ sec: number; label: string }> = [
  { sec: 300, label: "5m" },
  { sec: 900, label: "15m" },
  { sec: 3600, label: "1h" },
  { sec: 14400, label: "4h" },
  { sec: 86400, label: "1d" },
];
