// The demo gateway: a whole game in one file, on play money.
//
// It deals rounds on real wall-clock boundaries, walks a price, lets the book
// drift the way a market-maker's would, settles on the close, and keeps the
// streak. Nothing here talks to a chain or a server — it exists so the app is
// playable, demoable and designable before the backend is deployed, and so the
// empty / lost / void / warming-up states can actually be seen.
//
// Demo-only liberties, all deliberate and all visible in the UI as DEMO:
//   - a 1-minute practice window, so a round resolves while you are watching
//   - a handful of house players on the leaderboard
//   - roughly 1 in 25 rounds voids, to exercise the refund path

import type {
  Asset,
  Balances,
  Badge,
  CallReceipt,
  LeaderRow,
  LiveFrame,
  LivePriceRow,
  Outcome,
  PlayerCall,
  Position,
  Profile,
  Room,
  RoomDetail,
  Round,
  SettledRound,
  Side,
  SlipEvent,
  SlipPlan,
  SlipView,
  Streak,
} from "./types";
import { INTERVALS, SLIP_MAX_LEGS } from "./types";
import { PlayerFacingError, type Gateway, type PlaceArgs } from "./gateway";
import { connect as connectInjected, forget as forgetWallet } from "./wallet";

const STORE = "calledit.demo.v1";
const START_BALANCE = 50;

/** The Slip's house cut, mirrored from THE-SLIP spec: a light roll fee that
 *  compounds with the player, a heavier haircut on an instant cash-out. */
const SLIP_ROLL_FEE = 0.004;
const SLIP_CASHOUT_FEE = 0.015;

/** Demo adds a practice window on the front — real venues start at 5m. */
export const DEMO_PRACTICE_SEC = 60;
export const DEMO_INTERVALS = [{ sec: DEMO_PRACTICE_SEC, label: "1m" }, ...INTERVALS];

const BASE_PRICE: Record<Asset, number> = { BTC: 78120.55, ETH: 2460.75 };
const VOL: Record<Asset, number> = { BTC: 26, ETH: 1.1 };

const HOUSE: Array<{ address: string; handle: string; best: number; current: number; calls: number; wins: number; net: number }> = [
  { address: "0xC0FFEE0000000000000000000000000000000001", handle: "croupier", best: 11, current: 2, calls: 240, wins: 129, net: 84.2 },
  { address: "0xC0FFEE0000000000000000000000000000000002", handle: "moonpig", best: 9, current: 9, calls: 61, wins: 38, net: 41.5 },
  { address: "0xC0FFEE0000000000000000000000000000000003", handle: "tapdancer", best: 7, current: 0, calls: 118, wins: 62, net: 12.9 },
  { address: "0xC0FFEE0000000000000000000000000000000004", handle: "half_a_bit", best: 6, current: 3, calls: 44, wins: 25, net: 8.4 },
  { address: "0xC0FFEE0000000000000000000000000000000005", handle: "downonly", best: 5, current: 1, calls: 96, wins: 44, net: -6.1 },
  { address: "0xC0FFEE0000000000000000000000000000000006", handle: "nine_lives", best: 4, current: 4, calls: 22, wins: 13, net: 3.2 },
];

interface DemoCall {
  id: string;
  marketId: string;
  asset: Asset;
  intervalSec: number;
  side: Side;
  chipUsd: number;
  contracts: number;
  spent: number;
  avgPrice: number;
  placedAt: number;
  locksAt: number;
  outcome: Outcome;
  payout: number | null;
  claimed: boolean;
  roomId: string | null;
}

interface DemoSlipLeg {
  asset: Asset;
  side: Side;
  marketId: string | null;
  locksAt: number | null;
  entryPrice: number | null;
  contracts: number | null;
  stakeIn: number;
  outcome: Outcome;
  valueOut: number | null;
}

interface DemoSlip {
  id: string;
  plan: SlipPlan;
  status: "live" | "matured" | "busted";
  currentLeg: number;
  legs: DemoSlipLeg[];
  stake: number;
  owed: number;
  createdAt: number;
}

interface DemoState {
  address: string;
  /** True once the player attached a real wallet — `address` is then theirs. */
  connected?: boolean;
  handle: string | null;
  balance: number;
  calls: DemoCall[];
  rooms: Array<{ id: string; name: string; joinedAt: number }>;
  slips: DemoSlip[];
}

const now = () => Math.floor(Date.now() / 1000);

function fakeAddress(): string {
  const hex = "0123456789abcdef";
  let a = "0x";
  for (let i = 0; i < 40; i++) a += hex[Math.floor(Math.random() * 16)];
  return a;
}

/** A stable pseudo-id per round, so reloading does not deal a different market. */
function marketIdFor(asset: Asset, intervalSec: number, locksAt: number): string {
  let h = 2166136261;
  for (const ch of `${asset}|${intervalSec}|${locksAt}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `0x${h.toString(16).padStart(8, "0").repeat(5)}`;
}

/** Deterministic 0..1 from a seed — used so a round's fate is fixed at deal. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ((h >>> 8) % 100000) / 100000;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export class DemoGateway implements Gateway {
  readonly mode = "demo" as const;

  private state: DemoState;
  private listeners = new Set<(f: LiveFrame) => void>();
  private rounds = new Map<string, Round>();
  private settled: SettledRound[] = [];
  private prices: Record<Asset, number> = { ...BASE_PRICE };
  private lockAnnounced = new Set<string>();
  private timer: number | null = null;
  private lastTick = 0;
  private started = false;

  constructor() {
    this.state = load() ?? {
      address: fakeAddress(),
      handle: null,
      balance: START_BALANCE,
      calls: [],
      rooms: [],
      slips: [],
    };
  }

  get address(): string {
    return this.state.address;
  }

  get walletConnected(): boolean {
    return this.state.connected ?? false;
  }

  /** Optional in demo: attach a real wallet so your address is the one on the
   *  board. Still play money — no network switch, no signing. */
  async connectWallet(): Promise<void> {
    const conn = await connectInjected({ switchChain: false });
    this.state.address = conn.address;
    this.state.connected = true;
    this.save();
    this.emit({ t: "tick", now: now() });
  }

  async disconnectWallet(): Promise<void> {
    forgetWallet();
    this.state.address = fakeAddress();
    this.state.connected = false;
    this.save();
    this.emit({ t: "tick", now: now() });
  }

  /** Idempotent: React StrictMode boots the app twice in development. */
  async connect(): Promise<void> {
    if (this.started) return;
    this.started = true;
    for (const asset of ["BTC", "ETH"] as Asset[]) {
      for (const iv of DEMO_INTERVALS) this.deal(asset, iv.sec);
    }
    this.backfillHistory();
    this.start();
  }

  // ------------------------------------------------------------ the engine --

  private start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  private key(asset: Asset, intervalSec: number): string {
    return `${asset}|${intervalSec}`;
  }

  /** Rounds land on wall-clock boundaries, the way the venue's do. */
  private deal(asset: Asset, intervalSec: number): Round {
    const t = now();
    const locksAt = Math.ceil((t + 1) / intervalSec) * intervalSec;
    const opensAt = locksAt - intervalSec;
    const round: Round = {
      marketId: marketIdFor(asset, intervalSec, locksAt),
      symbol: `${asset}-0-DEMO-${intervalSec}/tUSDC#YES`,
      asset,
      intervalSec,
      status: "trading",
      opensAt,
      locksAt,
      openingPrice: round2(this.prices[asset]),
      upProbability: clamp(0.5 + (seeded(`p${asset}${locksAt}`) - 0.5) * 0.5, 0.2, 0.8),
      book: { upBid: null, upAsk: null, downBid: null, downAsk: null },
    };
    this.quote(round);
    this.rounds.set(this.key(asset, intervalSec), round);
    return round;
  }

  /** The Croupier's job: two-sided, near 50/50, with a small edge in the spread. */
  private quote(round: Round): void {
    const p = round.upProbability ?? 0.5;
    const edge = 0.02;
    round.book = {
      upBid: round2(clamp(p - edge, 0.01, 0.99)),
      upAsk: round2(clamp(p + edge, 0.01, 0.99)),
      downBid: round2(clamp(1 - p - edge, 0.01, 0.99)),
      downAsk: round2(clamp(1 - p + edge, 0.01, 0.99)),
    };
  }

  private tick(): void {
    const t = now();

    // price walk
    for (const asset of ["BTC", "ETH"] as Asset[]) {
      this.prices[asset] = round2(this.prices[asset] + (Math.random() - 0.5) * VOL[asset]);
    }

    for (const [key, round] of [...this.rounds]) {
      const [asset, ivStr] = key.split("|");
      const intervalSec = Number(ivStr);

      if (t >= round.locksAt) {
        this.settle(round);
        const next = this.deal(asset as Asset, intervalSec);
        this.emit({ t: "round", round: next });
        continue;
      }

      const warn = Math.min(60, Math.max(10, Math.floor(round.intervalSec / 4)));
      if (round.locksAt - t <= warn && !this.lockAnnounced.has(round.marketId)) {
        this.lockAnnounced.add(round.marketId);
        this.emit({ t: "locking", round });
      }

      // the book breathes — drift the implied probability toward where the
      // price has actually moved since the open
      if (t % 3 === 0) {
        const drift = round.openingPrice ? (this.prices[asset as Asset] - round.openingPrice) / (VOL[asset as Asset] * 40) : 0;
        round.upProbability = clamp((round.upProbability ?? 0.5) * 0.94 + (0.5 + clamp(drift, -0.3, 0.3)) * 0.06, 0.08, 0.92);
        this.quote(round);
        this.emit({ t: "round", round: { ...round } });
      }
    }

    this.rollSlips();

    if (t - this.lastTick >= 15) {
      this.lastTick = t;
      this.emit({ t: "tick", now: t });
    }
  }

  private settle(round: Round): void {
    const closing = round2(this.prices[round.asset]);
    const opening = round.openingPrice ?? closing;
    // ~1 in 25 rounds voids, so the refund path is reachable in a demo
    const voided = seeded(`v${round.marketId}`) > 0.96;
    const result: Side | "VOID" = voided ? "VOID" : closing >= opening ? "UP" : "DOWN";

    const row: SettledRound = {
      marketId: round.marketId,
      asset: round.asset,
      intervalSec: round.intervalSec,
      locksAt: round.locksAt,
      result,
      openingPrice: opening,
      closingPrice: closing,
    };
    this.settled.unshift(row);
    this.settled = this.settled.slice(0, 300);
    this.emit({ t: "settled", round: row });

    for (const call of this.state.calls) {
      if (call.marketId !== round.marketId || call.outcome !== "pending") continue;
      call.outcome = result === "VOID" ? "void" : call.side === result ? "won" : "lost";
      call.payout =
        call.outcome === "won" ? round2(call.contracts) : call.outcome === "void" ? round2(call.contracts * 0.5) : 0;
      const streak = this.streak();
      this.emit({
        t: "result",
        address: this.state.address,
        asset: call.asset,
        side: call.side,
        marketId: call.marketId,
        roundResult: result,
        result: call.outcome as "won" | "lost" | "void",
        chipUsd: call.chipUsd,
        payout: call.payout ?? 0,
        streakCurrent: streak.current,
        streakBest: streak.best,
      });
    }
    this.save();
  }

  /** A settled strip on first load, so the pattern is there to read. */
  private backfillHistory(): void {
    const t = now();
    for (const asset of ["BTC", "ETH"] as Asset[]) {
      for (const iv of DEMO_INTERVALS) {
        let price = BASE_PRICE[asset];
        for (let i = 18; i >= 1; i--) {
          const locksAt = Math.floor(t / iv.sec) * iv.sec - i * iv.sec;
          const id = marketIdFor(asset, iv.sec, locksAt);
          const opening = round2(price);
          price = round2(price + (seeded(`h${id}`) - 0.5) * VOL[asset] * 6);
          const voided = seeded(`v${id}`) > 0.96;
          this.settled.push({
            marketId: id,
            asset,
            intervalSec: iv.sec,
            locksAt,
            result: voided ? "VOID" : price >= opening ? "UP" : "DOWN",
            openingPrice: opening,
            closingPrice: round2(price),
          });
        }
      }
    }
    this.settled.sort((a, b) => b.locksAt - a.locksAt);
  }

  private emit(frame: LiveFrame): void {
    for (const fn of this.listeners) fn(frame);
  }

  // ------------------------------------------------------------- the reads --

  async balances(): Promise<Balances> {
    return { usd: round2(this.state.balance), gas: 1 };
  }

  /** The walk the engine is running — the same number the rounds settle on. */
  async price(asset: Asset): Promise<LivePriceRow | null> {
    return { asset, price: this.prices[asset], at: Date.now() };
  }

  async currentRounds(asset: Asset): Promise<Round[]> {
    return [...this.rounds.values()].filter((r) => r.asset === asset).map((r) => ({ ...r }));
  }

  async history(asset: Asset, intervalSec: number, limit = 20): Promise<SettledRound[]> {
    const seen = new Set<string>();
    const rows: SettledRound[] = [];
    for (const r of this.settled) {
      if (r.asset !== asset || r.intervalSec !== intervalSec || seen.has(r.marketId)) continue;
      seen.add(r.marketId);
      rows.push(r);
      if (rows.length === limit) break;
    }
    return rows;
  }

  async profile(): Promise<Profile> {
    const streak = this.streak();
    return {
      address: this.state.address,
      handle: this.state.handle,
      telegramLinked: false,
      streak,
      badges: badgesFor(streak),
      recentCalls: this.state.calls
        .slice()
        .reverse()
        .slice(0, 30)
        .map<PlayerCall>((c) => ({
          marketId: c.marketId,
          side: c.side,
          chipUsd: c.chipUsd,
          contracts: c.contracts,
          spent: c.spent,
          outcome: c.outcome,
          payout: c.payout,
          placedAt: c.placedAt,
          roomId: c.roomId,
          asset: c.asset,
        })),
      positions: this.positions(),
    };
  }

  private positions(): Position[] {
    return this.state.calls
      .filter((c) => c.outcome === "pending" || (!c.claimed && (c.payout ?? 0) > 0))
      .map<Position>((c) => ({
        marketId: c.marketId,
        asset: c.asset,
        intervalSec: c.intervalSec,
        side: c.side,
        contracts: c.contracts,
        status: c.outcome === "pending" ? "trading" : "resolved",
        outcome: c.outcome,
        claimable: c.claimed ? 0 : (c.payout ?? 0),
        locksAt: c.locksAt,
      }));
  }

  private streak(): Streak {
    const graded = this.state.calls.filter((c) => c.outcome === "won" || c.outcome === "lost");
    let current = 0;
    let best = 0;
    let run = 0;
    for (const c of graded) {
      if (c.outcome === "won") {
        run += 1;
        best = Math.max(best, run);
      } else run = 0;
    }
    current = run;
    const wins = graded.filter((c) => c.outcome === "won").length;
    const net = this.state.calls.reduce((sum, c) => sum + ((c.payout ?? 0) - c.spent), 0);
    return {
      current,
      best,
      totalCalls: graded.length,
      totalWins: wins,
      winRate: graded.length ? Math.round((wins / graded.length) * 100) / 100 : 0,
      netUsd: round2(net),
      multiplier: current >= 10 ? 3 : current >= 5 ? 2 : current >= 3 ? 1.5 : 1,
    };
  }

  async leaderboard(limit = 25): Promise<LeaderRow[]> {
    const me = this.streak();
    const rows = [
      ...HOUSE.map((h) => ({
        address: h.address,
        handle: h.handle,
        current: h.current,
        best: h.best,
        totalCalls: h.calls,
        totalWins: h.wins,
        winRate: Math.round((h.wins / h.calls) * 100) / 100,
        netUsd: h.net,
        multiplier: h.current >= 10 ? 3 : h.current >= 5 ? 2 : h.current >= 3 ? 1.5 : 1,
      })),
      { address: this.state.address, handle: this.state.handle, ...me },
    ];
    rows.sort((a, b) => b.best - a.best || b.netUsd - a.netUsd);
    return rows.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
  }

  async setHandle(handle: string): Promise<string> {
    this.state.handle = handle.slice(0, 24);
    this.save();
    return this.state.handle;
  }

  // ------------------------------------------------------------- the rooms --

  async createRoom(name: string): Promise<Room> {
    const id = Math.random().toString(36).slice(2, 8);
    this.state.rooms.push({ id, name: name.slice(0, 32), joinedAt: now() });
    this.save();
    return { id, name };
  }

  async joinRoom(id: string): Promise<RoomDetail> {
    if (!this.state.rooms.some((r) => r.id === id)) {
      this.state.rooms.push({ id, name: `Squad ${id}`, joinedAt: now() });
      this.save();
    }
    return this.room(id);
  }

  async room(id: string): Promise<RoomDetail> {
    const room = this.state.rooms.find((r) => r.id === id);
    if (!room) throw new PlayerFacingError("That squad has gone quiet", "No room with that link.");
    const me = this.streak();
    const members = [
      ...HOUSE.slice(0, 4).map((h) => ({
        address: h.address,
        handle: h.handle,
        calls: Math.round(h.calls / 6),
        wins: Math.round(h.wins / 6),
        net: round2(h.net / 6),
        bestStreak: Math.max(1, h.best - 2),
      })),
      {
        address: this.state.address,
        handle: this.state.handle,
        calls: me.totalCalls,
        wins: me.totalWins,
        net: me.netUsd,
        bestStreak: me.best,
      },
    ];
    members.sort((a, b) => b.net - a.net);
    return {
      id: room.id,
      name: room.name,
      memberCount: members.length,
      weekStart: now() - 3 * 86400,
      leaderboard: members.map((m, i) => ({ rank: i + 1, ...m })),
    };
  }

  get rooms(): Array<{ id: string; name: string }> {
    return this.state.rooms.map((r) => ({ id: r.id, name: r.name }));
  }

  // ------------------------------------------------------------ the writes --

  async placeCall({ round, side, chipUsd, roomId }: PlaceArgs): Promise<CallReceipt> {
    const live = this.rounds.get(this.key(round.asset, round.intervalSec));
    if (!live || live.marketId !== round.marketId || now() >= live.locksAt) {
      throw new PlayerFacingError("That window just closed", "Here is the next one.");
    }
    if (this.state.balance < chipUsd) {
      throw new PlayerFacingError("Not enough play money", "Reset the demo wallet from Wallet.");
    }

    const ask = side === "UP" ? live.book.upAsk : live.book.downAsk;
    if (!ask) throw new PlayerFacingError("Nobody is quoting that side", "Give the Croupier a second.");

    await sleep(650); // a real broadcast takes a beat; the pending state is real

    // the book moves; sometimes a call lands on nothing. 1 in 20.
    if (Math.random() < 0.05) {
      return { marketId: round.marketId, side, spent: 0, contracts: 0, avgPrice: 0, maxWin: 0, missed: true };
    }

    const contracts = round2(chipUsd / ask);
    this.state.balance = round2(this.state.balance - chipUsd);
    this.state.calls.push({
      id: Math.random().toString(36).slice(2),
      marketId: round.marketId,
      asset: round.asset,
      intervalSec: round.intervalSec,
      side,
      chipUsd,
      contracts,
      spent: chipUsd,
      avgPrice: ask,
      placedAt: now(),
      locksAt: live.locksAt,
      outcome: "pending",
      payout: null,
      claimed: false,
      roomId: roomId ?? null,
    });
    this.save();

    return {
      marketId: round.marketId,
      side,
      spent: chipUsd,
      contracts,
      avgPrice: ask,
      maxWin: contracts,
      txHash: `0xdemo${Math.random().toString(16).slice(2, 10)}`,
      missed: false,
    };
  }

  async claim(marketId: string): Promise<number> {
    let total = 0;
    for (const c of this.state.calls) {
      if (c.marketId === marketId && !c.claimed && (c.payout ?? 0) > 0) {
        total += c.payout ?? 0;
        c.claimed = true;
      }
    }
    this.state.balance = round2(this.state.balance + total);
    this.save();
    return round2(total);
  }

  async claimAll(): Promise<{ rounds: number; usd: number }> {
    const ids = [...new Set(this.state.calls.filter((c) => !c.claimed && (c.payout ?? 0) > 0).map((c) => c.marketId))];
    let usd = 0;
    for (const id of ids) usd += await this.claim(id);
    return { rounds: ids.length, usd: round2(usd) };
  }

  // -------------------------------------------------------------- the slips --
  //
  // A slip rides the same round engine as a single call: each leg is a real
  // demo round, entered by the "house" (no miss, no confirm), and graded when
  // that round settles in `settle()`. A win rolls its whole payout into the
  // next leg; a loss ends the run; the player can cash the open leg any tick.

  async armSlip(plan: SlipPlan): Promise<SlipView> {
    const legs = plan.legs.slice(0, SLIP_MAX_LEGS);
    if (legs.length < 2) throw new PlayerFacingError("A slip needs at least two legs", "Add another call.");
    if (this.state.balance < plan.stake) {
      throw new PlayerFacingError("Not enough play money", "Reset the demo wallet from Wallet.");
    }
    if (this.state.slips.some((s) => s.status === "live")) {
      throw new PlayerFacingError("You already have a run going", "Finish or cash it out first.");
    }

    const slip: DemoSlip = {
      id: `slip_${Math.random().toString(36).slice(2, 9)}`,
      plan: { ...plan, legs },
      status: "live",
      currentLeg: 0,
      stake: plan.stake,
      owed: 0,
      createdAt: now(),
      legs: legs.map((l) => ({
        asset: l.asset,
        side: l.side,
        marketId: null,
        locksAt: null,
        entryPrice: null,
        contracts: null,
        stakeIn: 0,
        outcome: "pending" as Outcome,
        valueOut: null,
      })),
    };

    this.state.balance = round2(this.state.balance - plan.stake);
    this.enterSlipLeg(slip, 0, plan.stake);
    this.state.slips.unshift(slip);
    this.state.slips = this.state.slips.slice(0, 20);
    this.save();
    this.emitSlip(slip, "armed");
    return this.slipView(slip);
  }

  async slip(id: string): Promise<SlipView | null> {
    const s = this.state.slips.find((x) => x.id === id);
    return s ? this.slipView(s) : null;
  }

  async mySlips(): Promise<SlipView[]> {
    return this.state.slips.map((s) => this.slipView(s));
  }

  async slipProjection(plan: SlipPlan): Promise<number[]> {
    let value = plan.stake;
    const out: number[] = [];
    plan.legs.slice(0, SLIP_MAX_LEGS).forEach((leg, i) => {
      // Leg 1 is priced off the live book; later legs are future windows we
      // can't see yet, so assume a fair ~50/50 entry rather than over-project.
      const round = this.rounds.get(this.key(leg.asset, plan.intervalSec));
      const ask = i === 0 && round ? (leg.side === "UP" ? round.book.upAsk : round.book.downAsk) : 0.52;
      const mult = (1 / (ask && ask > 0.02 && ask < 0.98 ? ask : 0.52)) * (1 - SLIP_ROLL_FEE);
      value = round2(value * mult);
      out.push(value);
    });
    return out;
  }

  async slipQuote(id: string): Promise<number | null> {
    const s = this.state.slips.find((x) => x.id === id);
    if (!s || s.status !== "live") return null;
    return this.openLegMark(s, SLIP_CASHOUT_FEE);
  }

  async cashOutSlip(id: string): Promise<number> {
    const s = this.state.slips.find((x) => x.id === id);
    if (!s || s.status !== "live") throw new PlayerFacingError("That run has already ended");
    const value = this.openLegMark(s, SLIP_CASHOUT_FEE);
    if (value === null) throw new PlayerFacingError("Can't cash out right now", "The leg is locking — hold on.");

    const leg = s.legs[s.currentLeg];
    leg.valueOut = value;
    s.status = "matured";
    s.owed = value;
    this.state.balance = round2(this.state.balance + value);
    this.save();
    this.emitSlip(s, "matured");
    return value;
  }

  /** Enter leg `i` into the currently live demo round for its asset + cadence. */
  private enterSlipLeg(slip: DemoSlip, i: number, stakeIn: number): void {
    const leg = slip.legs[i];
    // The tick loop replaces any expired round before rollSlips runs, so
    // whatever is in the map here is live; only cold-start needs a deal.
    let round = this.rounds.get(this.key(leg.asset, slip.plan.intervalSec));
    if (!round) round = this.deal(leg.asset, slip.plan.intervalSec);

    const ask = leg.side === "UP" ? round.book.upAsk : round.book.downAsk;
    const price = ask && ask > 0.02 && ask < 0.98 ? ask : 0.52;
    leg.marketId = round.marketId;
    leg.locksAt = round.locksAt;
    leg.entryPrice = price;
    leg.contracts = round2(stakeIn / price);
    leg.stakeIn = round2(stakeIn);
    leg.outcome = "pending";
    leg.valueOut = null;
    slip.currentLeg = i;
  }

  /** Current value of the open leg, net of `fee`. Null while it is locking. */
  private openLegMark(slip: DemoSlip, fee: number): number | null {
    const leg = slip.legs[slip.currentLeg];
    if (!leg.contracts) return null;
    const round = this.rounds.get(this.key(leg.asset, slip.plan.intervalSec));
    if (!round || round.marketId !== leg.marketId) return null;
    if (round.status !== "trading" || now() >= round.locksAt) return null;
    const bid = leg.side === "UP" ? round.book.upBid : round.book.downBid;
    const px = bid && bid > 0 ? bid : (leg.entryPrice ?? 0.5);
    return round2(leg.contracts * px * (1 - fee));
  }

  /** Grade every live slip whose current leg has settled. Runs each tick. */
  private rollSlips(): void {
    let dirty = false;
    for (const slip of this.state.slips) {
      if (slip.status !== "live") continue;
      const leg = slip.legs[slip.currentLeg];
      if (!leg.marketId || leg.outcome !== "pending") continue;

      const done = this.settled.find((r) => r.marketId === leg.marketId);
      if (!done) continue;
      dirty = true;

      if (done.result === "VOID") {
        // The leg didn't really happen — re-enter the same call next window.
        this.enterSlipLeg(slip, slip.currentLeg, leg.stakeIn);
        this.emitSlip(slip, "void-retry");
        continue;
      }

      if (leg.side !== done.result) {
        leg.outcome = "lost";
        leg.valueOut = 0;
        slip.status = "busted";
        slip.owed = 0;
        this.emitSlip(slip, "busted");
        continue;
      }

      // won — each contract pays $1, minus the roll fee
      leg.outcome = "won";
      const proceeds = round2((leg.contracts ?? 0) * (1 - SLIP_ROLL_FEE));
      leg.valueOut = proceeds;

      const isLast = slip.currentLeg >= slip.plan.legs.length - 1;
      const banked =
        slip.plan.stop.kind === "multiple" && proceeds >= slip.plan.stop.x * slip.stake;

      if (isLast || banked) {
        slip.status = "matured";
        slip.owed = proceeds;
        this.state.balance = round2(this.state.balance + proceeds);
        this.emitSlip(slip, "matured");
      } else {
        this.enterSlipLeg(slip, slip.currentLeg + 1, proceeds);
        this.emitSlip(slip, "advanced");
      }
    }
    if (dirty) this.save();
  }

  private emitSlip(slip: DemoSlip, event: SlipEvent): void {
    this.emit({ t: "slip", slip: this.slipView(slip), event });
  }

  private slipView(s: DemoSlip): SlipView {
    const value =
      s.status === "live" ? (this.openLegMark(s, 0) ?? s.legs[s.currentLeg].stakeIn ?? s.stake) : s.owed;
    return {
      id: s.id,
      plan: s.plan,
      status: s.status,
      currentLeg: s.currentLeg,
      stake: s.stake,
      value: round2(value),
      multiple: round2(value / s.stake),
      owed: s.owed,
      createdAt: s.createdAt,
      legs: s.legs.map((l, i) => ({
        index: i,
        asset: l.asset,
        side: l.side,
        marketId: l.marketId,
        locksAt: l.locksAt,
        entryPrice: l.entryPrice,
        contracts: l.contracts,
        stakeIn: l.stakeIn,
        outcome: l.outcome,
        valueOut: l.valueOut,
      })),
    };
  }

  subscribe(fn: (frame: LiveFrame) => void): () => void {
    this.listeners.add(fn);
    fn({ t: "hello", now: now() });
    return () => this.listeners.delete(fn);
  }

  /** Wipe the play state — the demo's version of "start over". */
  reset(): void {
    localStorage.removeItem(STORE);
    forgetWallet();
    this.state = { address: fakeAddress(), connected: false, handle: null, balance: START_BALANCE, calls: [], rooms: [], slips: [] };
    this.save();
  }

  topUp(amount = 25): number {
    this.state.balance = round2(this.state.balance + amount);
    this.save();
    return this.state.balance;
  }

  private save(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.state));
    } catch {
      /* private mode — the game still runs, it just forgets */
    }
  }
}

function load(): DemoState | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoState;
    if (!parsed?.address) return null;
    parsed.rooms ??= [];
    parsed.calls ??= [];
    parsed.slips ??= [];
    return parsed;
  } catch {
    return null;
  }
}

/** Same rules as apps/backend/src/lib/badges.ts — derived, never stored. */
export function badgesFor(s: Streak): Badge[] {
  return [
    { key: "streak3", label: "On a roll", hit: s.best >= 3 },
    { key: "streak5", label: "Hot hand", hit: s.best >= 5 },
    { key: "streak10", label: "Called it x10", hit: s.best >= 10 },
    { key: "calls25", label: "Regular", hit: s.totalCalls >= 25 },
    { key: "sharp", label: "Sharp", hit: s.totalCalls >= 20 && s.winRate >= 0.6 },
    { key: "green", label: "In the green", hit: s.netUsd > 0 && s.totalCalls >= 10 },
  ];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
