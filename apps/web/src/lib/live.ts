// The live gateway: REST + WS against apps/backend, writes signed in the
// player's connected wallet and broadcast on chain (SPEC §2, §3).
//
// The write path is the only part that needs the SDK in the browser. It is
// loaded lazily, on the first call, so a bundling problem shows up as one honest
// message on one button instead of a white screen on boot.

import { API_URL } from "./env";
import {
  connect,
  ensureSomnia,
  fetchBalances,
  forget,
  restore,
  signLogin,
  type Connection,
} from "./wallet";
import { PlayerFacingError, type Gateway, type PlaceArgs } from "./gateway";
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
  SlipPlan,
  SlipView,
} from "./types";

const JWT_STORE = "calledit.jwt";

export class LiveGateway implements Gateway {
  readonly mode = "live" as const;

  private conn: Connection | null = null;
  private token: string | null;
  private socket: WebSocket | null = null;
  private listeners = new Set<(f: LiveFrame) => void>();
  private retry = 0;
  private closed = false;
  private chain: Promise<ChainBridge> | null = null;

  constructor() {
    this.token = localStorage.getItem(JWT_STORE);
  }

  get address(): string {
    return this.conn?.address ?? "";
  }

  get walletConnected(): boolean {
    return this.conn !== null;
  }

  /**
   * Boot path: reconnect *silently* if the wallet still authorizes us. Never
   * prompts — a wallet pop-up before the player has even seen the app is wrong.
   * If there's nothing to restore the app shows the connect button (Onboarding).
   */
  async connect(): Promise<void> {
    const restored = await restore();
    if (!restored) return;
    this.conn = restored;
    await this.auth();
    if (!this.socket) this.openSocket();
  }

  /** Button path: prompt, auth, open the socket — the deliberate connect. */
  async connectWallet(): Promise<void> {
    this.conn ??= await connect();
    this.closed = false;
    await this.auth();
    if (!this.socket) this.openSocket();
  }

  async disconnectWallet(): Promise<void> {
    forget();
    this.token = null;
    localStorage.removeItem(JWT_STORE);
    this.conn = null;
    this.chain = null;
    this.close();
  }

  // -------------------------------------------------------------- plumbing --

  private async auth(): Promise<string> {
    if (!this.conn) throw new PlayerFacingError("Connect your wallet to play");
    const issuedAt = Date.now();
    const signature = await signLogin(this.conn, issuedAt);
    const res = await fetch(`${API_URL}/v1/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: this.conn.address, issuedAt, signature }),
    });
    if (!res.ok) throw new PlayerFacingError("Could not reach the game server", await safeText(res));
    const { token } = (await res.json()) as { token: string };
    this.token = token;
    localStorage.setItem(JWT_STORE, token);
    return token;
  }

  private async req<T>(path: string, init: RequestInit = {}, authed = false, retried = false): Promise<T> {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body) headers["content-type"] = "application/json";
    if (authed) {
      if (!this.token) await this.auth();
      headers.authorization = `Bearer ${this.token}`;
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, { ...init, headers });
    } catch {
      throw new PlayerFacingError("You're offline", "We'll pick up where you left off.");
    }

    if (res.status === 401 && authed && !retried) {
      await this.auth();
      return this.req<T>(path, init, authed, true);
    }
    if (!res.ok) {
      const body = await safeJson(res);
      const err = new PlayerFacingError(body?.error ?? `Request failed (${res.status})`);
      (err as PlayerFacingError & { status?: number; body?: unknown }).status = res.status;
      (err as PlayerFacingError & { status?: number; body?: unknown }).body = body;
      throw err;
    }
    return (await res.json()) as T;
  }

  // ----------------------------------------------------------------- reads --

  balances(): Promise<Balances> {
    if (!this.conn) return Promise.resolve({ usd: 0, gas: 0 });
    return fetchBalances(this.conn.address);
  }

  async currentRounds(asset: Asset): Promise<Round[]> {
    const { rounds } = await this.req<{ rounds: Round[] }>(`/v1/rounds/current?asset=${asset}`);
    return rounds;
  }

  async price(asset: Asset): Promise<LivePriceRow | null> {
    try {
      const row = await this.req<{ asset: Asset; price: number | null; at: number | null }>(
        `/v1/price/${asset}`,
      );
      return row.price === null ? null : { asset, price: row.price, at: row.at ?? Date.now() };
    } catch {
      // A quiet oracle costs one line of text, never a screen.
      return null;
    }
  }

  async history(asset: Asset, intervalSec: number, limit = 20): Promise<SettledRound[]> {
    // The endpoint is per-asset; the interval filter is ours.
    const { rounds } = await this.req<{ rounds: SettledRound[] }>(
      `/v1/rounds/history?asset=${asset}&limit=100`,
    );
    return rounds.filter((r) => r.intervalSec === intervalSec).slice(0, limit);
  }

  profile(address?: string): Promise<Profile> {
    const a = address ?? this.conn?.address;
    if (!a) return Promise.reject(new PlayerFacingError("Connect your wallet to play"));
    return this.req<Profile>(`/v1/players/${a}`);
  }

  async leaderboard(limit = 25): Promise<LeaderRow[]> {
    const { leaderboard } = await this.req<{ leaderboard: LeaderRow[] }>(`/v1/leaderboard?limit=${limit}`);
    return leaderboard;
  }

  async setHandle(handle: string): Promise<string> {
    const res = await this.req<{ handle: string }>(
      "/v1/players/me/handle",
      { method: "POST", body: JSON.stringify({ handle }) },
      true,
    );
    return res.handle;
  }

  // ----------------------------------------------------------------- rooms --

  createRoom(name: string): Promise<Room> {
    return this.req<Room>("/v1/rooms", { method: "POST", body: JSON.stringify({ name }) }, true);
  }

  async joinRoom(id: string): Promise<RoomDetail> {
    await this.req(`/v1/rooms/${id}/join`, { method: "POST" }, true);
    return this.room(id);
  }

  room(id: string): Promise<RoomDetail> {
    return this.req<RoomDetail>(`/v1/rooms/${id}`);
  }

  // ---------------------------------------------------------------- writes --

  /** Lazy so a browser-bundling failure lands on the button, not on boot. The
   *  wallet is nudged onto Somnia here — the first write is where it matters. */
  private async bridge(): Promise<ChainBridge> {
    if (!this.conn) throw new PlayerFacingError("Connect your wallet to play");
    await ensureSomnia();
    this.chain ??= import("./chain").then((m) => m.load(this.conn!.walletClient));
    return this.chain;
  }

  async placeCall({ round, side, chipUsd, roomId }: PlaceArgs): Promise<CallReceipt> {
    const chain = await this.bridge();
    const receipt = await chain.placeCall(round, side, chipUsd);
    if (receipt.missed) return receipt;

    // Register it so streaks, rooms and notifications know. The backend re-reads
    // the chain, so a moment of indexer lag reads as 409 — retry once (SPEC §3).
    const body = JSON.stringify({
      marketId: receipt.marketId,
      side: receipt.side,
      chipUsd,
      contracts: receipt.contracts,
      spent: receipt.spent,
      avgPrice: receipt.avgPrice,
      txHash: receipt.txHash,
      ...(roomId ? { roomId } : {}),
    });
    try {
      await this.req("/v1/calls", { method: "POST", body }, true);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = (err as { body?: { error?: string } }).body?.error ?? "";
      if (status === 409 && message.includes("position not found")) {
        await sleep(2000);
        await this.req("/v1/calls", { method: "POST", body }, true);
      } else if (status !== 409) {
        throw err;
      }
      // A 409 "already settled" means the bet is on chain but the round is done;
      // the position and its payout are still the player's. Nothing to undo.
    }
    return receipt;
  }

  async claim(marketId: string): Promise<number> {
    const chain = await this.bridge();
    return chain.claim(marketId);
  }

  async claimAll(): Promise<{ rounds: number; usd: number }> {
    const chain = await this.bridge();
    return chain.claimAll();
  }

  // ---------------------------------------------------------------- slips ---
  // The Slip is demo-only for now (THE-SLIP spec, build steps 3–5 land the
  // SlipVault + executor). Live mode says so plainly rather than half-working.

  private static slipsSoon(): PlayerFacingError {
    return new PlayerFacingError(
      "Runs aren't live yet",
      "The Slip is playable in demo mode today — live mode is next.",
    );
  }

  armSlip(_plan: SlipPlan): Promise<SlipView> {
    return Promise.reject(LiveGateway.slipsSoon());
  }
  slip(_id: string): Promise<SlipView | null> {
    return Promise.resolve(null);
  }
  mySlips(): Promise<SlipView[]> {
    return Promise.resolve([]);
  }
  slipProjection(_plan: SlipPlan): Promise<number[]> {
    return Promise.resolve([]);
  }
  slipQuote(_id: string): Promise<number | null> {
    return Promise.resolve(null);
  }
  cashOutSlip(_id: string): Promise<number> {
    return Promise.reject(LiveGateway.slipsSoon());
  }

  // ------------------------------------------------------------------- ws ---

  subscribe(fn: (frame: LiveFrame) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(frame: LiveFrame): void {
    for (const fn of this.listeners) fn(frame);
  }

  private openSocket(): void {
    if (this.closed) return;
    const url = `${API_URL.replace(/^http/, "ws")}/v1/live`;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.retry = 0;
      if (this.conn) socket.send(JSON.stringify({ subscribe: { address: this.conn.address } }));
    };
    socket.onmessage = (ev) => {
      try {
        this.emit(normalizeFrame(JSON.parse(ev.data as string)));
      } catch {
        /* malformed frame — the countdown keeps running off locksAt */
      }
    };
    socket.onclose = () => this.scheduleReconnect();
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.socket = null;
    this.emit({ t: "tick", now: Math.floor(Date.now() / 1000) });
    const wait = Math.min(15_000, 800 * 2 ** this.retry++);
    setTimeout(() => this.openSocket(), wait);
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.closed = true;
    this.socket?.close();
  }
}

export interface ChainBridge {
  placeCall(round: Round, side: "UP" | "DOWN", chipUsd: number): Promise<CallReceipt>;
  claim(marketId: string): Promise<number>;
  claimAll(): Promise<{ rounds: number; usd: number }>;
}

/** WS RoundRows arrive snake_case (SPEC §2); the app speaks camelCase. */
function normalizeFrame(raw: Record<string, unknown>): LiveFrame {
  const frame = { ...raw } as Record<string, unknown>;
  if (frame.round && typeof frame.round === "object") {
    const r = frame.round as Record<string, unknown>;
    frame.round = {
      ...r,
      marketId: r.marketId ?? r.market_id,
      intervalSec: r.intervalSec ?? r.interval_sec,
      locksAt: r.locksAt ?? r.locks_at,
      opensAt: r.opensAt ?? r.opens_at,
      openingPrice: r.openingPrice ?? r.opening_price ?? null,
      closingPrice: r.closingPrice ?? r.closing_price ?? null,
      upProbability: r.upProbability ?? r.up_probability ?? null,
      book: r.book ?? { upBid: null, upAsk: null, downBid: null, downAsk: null },
    };
  }
  return frame as unknown as LiveFrame;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
