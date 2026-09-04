import { create } from "zustand";
import { MODE } from "./env";
import { DemoGateway } from "./demo";
import { LiveGateway } from "./live";
import { PlayerFacingError, type Gateway } from "./gateway";
import type {
  Asset,
  Balances,
  CallReceipt,
  Chip,
  LiveFrame,
  Profile,
  ResultEvent,
  Round,
  SettledRound,
  Side,
  SlipEvent,
  SlipPlan,
  SlipView,
} from "./types";

export type Tab = "play" | "slip" | "streak" | "squad" | "ranks";
export type Toast = { id: number; text: string; tone: "good" | "bad" | "info" };

/** Where a call is between the tap and the news. */
export type CallStage =
  | { kind: "idle" }
  | { kind: "confirm"; side: Side }
  | { kind: "pending"; side: Side }
  | { kind: "placed"; side: Side; receipt: CallReceipt }
  | { kind: "missed"; side: Side }
  | { kind: "error"; message: string; hint?: string };

const PREFS = "calledit.prefs.v1";

interface Prefs {
  accepted: boolean;
  asset: Asset;
  intervalSec: number;
  chip: Chip;
  roomId: string | null;
  roomName: string | null;
  installNudged: boolean;
}

const defaultPrefs: Prefs = {
  accepted: false,
  asset: "BTC",
  intervalSec: MODE === "demo" ? 60 : 900,
  chip: 5,
  roomId: null,
  roomName: null,
  installNudged: false,
};

function readPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...(JSON.parse(localStorage.getItem(PREFS) ?? "{}") as Partial<Prefs>) };
  } catch {
    return defaultPrefs;
  }
}

interface AppState extends Prefs {
  gateway: Gateway;
  address: string;
  mode: "demo" | "live";
  walletConnected: boolean;

  booted: boolean;
  bootError: string | null;
  online: boolean;
  /** server seconds minus local seconds — the countdown is anchored to this. */
  skew: number;

  tab: Tab;
  rounds: Round[];
  settled: SettledRound[];
  profile: Profile | null;
  balances: Balances | null;
  stage: CallStage;
  result: ResultEvent | null;
  /** The streak a loss just ended — kept because the profile refresh clears it. */
  brokenStreak: number;
  toasts: Toast[];

  /** The player's active (or just-finished) run, and what it last did. */
  slip: SlipView | null;
  slipFlash: SlipEvent | null;

  boot(): Promise<void>;
  connectWallet(): Promise<void>;
  disconnectWallet(): Promise<void>;
  setTab(tab: Tab): void;
  accept(): void;
  setAsset(asset: Asset): void;
  setInterval(sec: number): void;
  setChip(chip: Chip): void;
  setRoom(room: { id: string; name: string } | null): void;
  markInstallNudged(): void;

  refreshRounds(): Promise<void>;
  refreshHistory(): Promise<void>;
  refreshProfile(): Promise<void>;
  refreshBalances(): Promise<void>;

  openConfirm(side: Side): void;
  cancelCall(): void;
  commitCall(): Promise<void>;
  claim(marketId: string): Promise<void>;
  claimAll(): Promise<void>;

  armSlip(plan: SlipPlan): Promise<void>;
  cashOutSlip(): Promise<void>;
  refreshSlip(): Promise<void>;
  clearSlipFlash(): void;
  newSlip(): void;

  dismissResult(): void;
  toast(text: string, tone?: Toast["tone"]): void;
}

let toastSeq = 0;
/** StrictMode runs the boot effect twice in dev; one gateway, one subscription. */
let booting = false;
let subscribed = false;

export const useApp = create<AppState>((set, get) => ({
  ...readPrefs(),
  gateway: MODE === "demo" ? new DemoGateway() : new LiveGateway(),
  address: "",
  mode: MODE,
  walletConnected: false,

  booted: false,
  bootError: null,
  online: true,
  skew: 0,

  tab: "play",
  rounds: [],
  settled: [],
  profile: null,
  balances: null,
  stage: { kind: "idle" },
  result: null,
  brokenStreak: 0,
  toasts: [],
  slip: null,
  slipFlash: null,

  async boot() {
    const { gateway } = get();
    if (booting) return;
    booting = true;
    try {
      await gateway.connect();
      set({
        address: gateway.address,
        walletConnected: gateway.walletConnected,
        booted: true,
        bootError: null,
        online: true,
      });
      if (!subscribed) {
        gateway.subscribe((frame) => handleFrame(frame, set, get));
        subscribed = true;
      }
      await Promise.all([get().refreshRounds(), get().refreshHistory(), get().refreshProfile(), get().refreshBalances()]);
      const runs = await gateway.mySlips().catch(() => []);
      set({ slip: runs.find((r) => r.status === "live") ?? null });
    } catch (err) {
      booting = false; // so the Connect / Retry button can try again
      set({
        booted: true,
        walletConnected: gateway.walletConnected,
        bootError: err instanceof PlayerFacingError ? err.message : "Could not start the game",
        online: false,
      });
    }
  },

  /**
   * Live: connect the wallet, auth, subscribe — the whole boot, minus the parts
   * that already ran. Demo: attach a real address to the play identity.
   */
  async connectWallet() {
    const { gateway } = get();
    try {
      await gateway.connectWallet();
    } catch (err) {
      const message = err instanceof PlayerFacingError ? err.message : "Couldn't connect your wallet";
      set({ bootError: get().mode === "live" ? message : get().bootError });
      get().toast(message, "bad");
      throw err;
    }
    if (!subscribed) {
      gateway.subscribe((frame) => handleFrame(frame, set, get));
      subscribed = true;
    }
    booting = true; // a wallet is attached now — kill the auto-retry path
    set({
      address: gateway.address,
      walletConnected: gateway.walletConnected,
      booted: true,
      bootError: null,
      online: true,
    });
    await Promise.all([
      get().refreshRounds(),
      get().refreshHistory(),
      get().refreshProfile(),
      get().refreshBalances(),
    ]);
  },

  async disconnectWallet() {
    await get().gateway.disconnectWallet();
    if (get().mode === "live") {
      location.reload();
      return;
    }
    set({ address: get().gateway.address, walletConnected: false });
    void get().refreshProfile();
  },

  setTab: (tab) => set({ tab }),

  accept() {
    set({ accepted: true });
    persist(get());
  },

  setAsset(asset) {
    set({ asset, rounds: [], settled: [] });
    persist(get());
    void get().refreshRounds();
    void get().refreshHistory();
  },

  setInterval(intervalSec) {
    set({ intervalSec, settled: [] });
    persist(get());
    void get().refreshHistory();
  },

  setChip(chip) {
    set({ chip });
    persist(get());
  },

  setRoom(room) {
    set({ roomId: room?.id ?? null, roomName: room?.name ?? null });
    persist(get());
  },

  markInstallNudged() {
    set({ installNudged: true });
    persist(get());
  },

  async refreshRounds() {
    try {
      const rounds = await get().gateway.currentRounds(get().asset);
      set({ rounds, online: true });
    } catch {
      set({ online: false });
    }
  },

  async refreshHistory() {
    try {
      const settled = await get().gateway.history(get().asset, get().intervalSec, 18);
      set({ settled });
    } catch {
      /* the strip is a nice-to-have; never block the round card on it */
    }
  },

  async refreshProfile() {
    // Live with no wallet yet: there is no "you" to fetch — not an outage.
    if (get().mode === "live" && !get().walletConnected) {
      set({ profile: null });
      return;
    }
    try {
      const profile = await get().gateway.profile();
      set({ profile, online: true });
    } catch {
      set({ online: false });
    }
  },

  async refreshBalances() {
    if (get().mode === "live" && !get().walletConnected) {
      set({ balances: { usd: 0, gas: 0 } });
      return;
    }
    try {
      set({ balances: await get().gateway.balances() });
    } catch {
      /* balances gate the chips; a stale read is better than a broken screen */
    }
  },

  openConfirm: (side) => set({ stage: { kind: "confirm", side } }),
  cancelCall: () => set({ stage: { kind: "idle" } }),

  async commitCall() {
    const { stage, gateway, chip, roomId, asset, intervalSec, rounds } = get();
    if (stage.kind !== "confirm") return;
    const side = stage.side;
    const round = rounds.find((r) => r.intervalSec === intervalSec && r.asset === asset);
    if (!round) {
      set({ stage: { kind: "error", message: "No live round right now", hint: "Give it a second." } });
      return;
    }

    set({ stage: { kind: "pending", side } });
    try {
      const receipt = await gateway.placeCall({ round, side, chipUsd: chip, roomId });
      if (receipt.missed) {
        set({ stage: { kind: "missed", side } });
        return;
      }
      set({ stage: { kind: "placed", side, receipt } });
      void get().refreshProfile();
      void get().refreshBalances();
    } catch (err) {
      const e = err as PlayerFacingError;
      set({ stage: { kind: "error", message: e.message ?? "That didn't land", hint: e.hint } });
      void get().refreshRounds();
    }
  },

  async claim(marketId) {
    try {
      const usd = await get().gateway.claim(marketId);
      get().toast(usd > 0 ? `Claimed $${usd.toFixed(2)}` : "Nothing to claim yet", usd > 0 ? "good" : "info");
      await Promise.all([get().refreshProfile(), get().refreshBalances()]);
    } catch (err) {
      get().toast((err as Error).message || "Claim failed", "bad");
    }
  },

  async claimAll() {
    try {
      const { rounds, usd } = await get().gateway.claimAll();
      get().toast(rounds ? `Claimed $${usd.toFixed(2)} from ${rounds} round${rounds > 1 ? "s" : ""}` : "Nothing to claim", rounds ? "good" : "info");
      await Promise.all([get().refreshProfile(), get().refreshBalances()]);
    } catch (err) {
      get().toast((err as Error).message || "Claim failed", "bad");
    }
  },

  async armSlip(plan) {
    try {
      const view = await get().gateway.armSlip(plan);
      set({ slip: view, slipFlash: "armed", tab: "slip" });
      void get().refreshBalances();
    } catch (err) {
      const e = err as PlayerFacingError;
      get().toast(e.message || "Couldn't arm that run", "bad");
      throw err;
    }
  },

  async cashOutSlip() {
    const current = get().slip;
    if (!current || current.status !== "live") return;
    try {
      const usd = await get().gateway.cashOutSlip(current.id);
      get().toast(`Banked $${usd.toFixed(2)}`, "good");
      await get().refreshSlip();
      void get().refreshBalances();
    } catch (err) {
      get().toast((err as Error).message || "Couldn't cash that out", "bad");
    }
  },

  async refreshSlip() {
    const current = get().slip;
    if (!current) return;
    const next = await get().gateway.slip(current.id).catch(() => null);
    if (next) set({ slip: next });
  },

  clearSlipFlash: () => set({ slipFlash: null }),
  newSlip: () => set({ slip: null, slipFlash: null }),

  dismissResult: () => set({ result: null }),

  toast(text, tone = "info") {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3600);
  },
}));

function handleFrame(
  frame: LiveFrame,
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
): void {
  const local = Math.floor(Date.now() / 1000);
  switch (frame.t) {
    case "hello":
    case "tick":
      set({ skew: frame.now - local, online: true });
      break;

    case "round":
    case "locking": {
      const round = frame.round;
      if (round.asset !== get().asset) return;
      const rest = get().rounds.filter((r) => r.marketId !== round.marketId && r.intervalSec !== round.intervalSec);
      set({ rounds: [...rest, round] });
      break;
    }

    case "settled": {
      const row = frame.round;
      if (row.asset === get().asset && row.intervalSec === get().intervalSec) {
        set({ settled: [row, ...get().settled.filter((s) => s.marketId !== row.marketId)].slice(0, 18) });
      }
      void get().refreshProfile();
      break;
    }

    case "result":
      set({
        result: frame,
        brokenStreak: get().profile?.streak.current ?? 0,
        stage: { kind: "idle" },
      });
      void get().refreshProfile();
      void get().refreshBalances();
      break;

    case "slip": {
      const current = get().slip;
      if (current && current.id !== frame.slip.id) return;
      set({ slip: frame.slip, slipFlash: frame.event });
      if (frame.event === "matured" || frame.event === "busted") {
        void get().refreshBalances();
        void get().refreshProfile();
      }
      break;
    }

    default:
      break;
  }
}

function persist(state: AppState): void {
  const prefs: Prefs = {
    accepted: state.accepted,
    asset: state.asset,
    intervalSec: state.intervalSec,
    chip: state.chip,
    roomId: state.roomId,
    roomName: state.roomName,
    installNudged: state.installNudged,
  };
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs));
  } catch {
    /* private mode — preferences just do not stick */
  }
}

/** The round the Play screen is actually about. */
export function activeRound(state: AppState): Round | undefined {
  return state.rounds.find((r) => r.asset === state.asset && r.intervalSec === state.intervalSec);
}

/** Settled-but-unclaimed money, for the nav dot and the Claim all button. */
export function unclaimed(profile: Profile | null): { count: number; usd: number } {
  const rows = (profile?.positions ?? []).filter((p) => p.claimable > 0);
  return { count: rows.length, usd: rows.reduce((sum, p) => sum + p.claimable, 0) };
}
