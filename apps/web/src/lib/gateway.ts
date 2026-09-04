import type {
  Asset,
  Balances,
  CallReceipt,
  LeaderRow,
  LiveFrame,
  LivePriceRow,
  Profile,
  Room,
  RoomDetail,
  Round,
  SettledRound,
  Side,
  SlipPlan,
  SlipView,
} from "./types";

/**
 * One door between the screens and the world.
 *
 * `live` runs the real thing: REST + WS against apps/backend, calls signed by
 * the burner and broadcast on chain. `demo` runs a local round engine with play
 * money so the app is playable with nothing else switched on.
 *
 * Screens never ask which one they got — the mode only ever shows up as a
 * badge, never as a branch in a component.
 */
export interface Gateway {
  readonly mode: "demo" | "live";
  readonly address: string;
  /** Whether an external wallet is attached as the player identity/signer. */
  readonly walletConnected: boolean;

  /** Auth (live) or restore saved play state (demo). */
  connect(): Promise<void>;

  /**
   * Attach an injected wallet. Live: this is the signer, so it also auths and
   * opens the socket — required before any call lands. Demo: optional, it just
   * swaps the play identity so your real address shows on the leaderboard.
   */
  connectWallet(): Promise<void>;
  /** Forget the attached wallet. Live: also drops the session (caller reloads). */
  disconnectWallet(): Promise<void>;

  balances(): Promise<Balances>;
  currentRounds(asset: Asset): Promise<Round[]>;
  /** The live underlying. Null whenever the feed is quiet — never an error. */
  price(asset: Asset): Promise<LivePriceRow | null>;
  history(asset: Asset, intervalSec: number, limit?: number): Promise<SettledRound[]>;
  profile(address?: string): Promise<Profile>;
  leaderboard(limit?: number): Promise<LeaderRow[]>;
  setHandle(handle: string): Promise<string>;

  createRoom(name: string): Promise<Room>;
  joinRoom(id: string): Promise<RoomDetail>;
  room(id: string): Promise<RoomDetail>;

  placeCall(args: PlaceArgs): Promise<CallReceipt>;
  claim(marketId: string): Promise<number>;
  claimAll(): Promise<{ rounds: number; usd: number }>;

  // The Slip — a compounding run. Demo only for now; live throws a plain
  // "not yet" so the screen can show a waiting state instead of breaking.
  armSlip(plan: SlipPlan): Promise<SlipView>;
  slip(id: string): Promise<SlipView | null>;
  mySlips(): Promise<SlipView[]>;
  /** Cumulative projected value after each leg, from the live books. */
  slipProjection(plan: SlipPlan): Promise<number[]>;
  /** Live cash-out value of the open leg, net of the haircut. Null if not cashable now. */
  slipQuote(id: string): Promise<number | null>;
  cashOutSlip(id: string): Promise<number>;

  /** Live frames (SPEC §2). Returns an unsubscribe. */
  subscribe(fn: (frame: LiveFrame) => void): () => void;
}

export interface PlaceArgs {
  round: Round;
  side: Side;
  chipUsd: number;
  roomId?: string | null;
}

/** A failure the player can act on, rather than a stack trace. */
export class PlayerFacingError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "PlayerFacingError";
  }
}
