// The indexer loop. Polls the venue for live rounds and recent settlements,
// keeps the `rounds` table current, and fires events on the transitions the
// rest of the app cares about: a new round, a round about to lock, a round
// settled (→ grade every call on it).
//
// The chain is the source of truth; a crash just means we re-derive on restart.

import { chain, currentRounds, settledRounds } from "./chain.js";
import { upsertRound, getRound, setRoundResult, type RoundRow } from "./db.js";
import { bus } from "./events.js";
import { gradeRound } from "./streaks.js";
import { env } from "./env.js";

const LOCK_WARN_SEC = 60; // fire "round:locking" this long before lock

const lockWarned = new Set<string>();
const settledSeen = new Set<string>();

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;

export function startIndexer(): void {
  if (running) return;
  running = true;
  void tick();
}

export function stopIndexer(): void {
  running = false;
  if (timer) clearTimeout(timer);
}

async function tick(): Promise<void> {
  if (!running) return;
  try {
    await pollLive();
    await pollSettled();
  } catch (err) {
    console.error(`[indexer] cycle error: ${(err as Error).message}`);
  }
  if (running) timer = setTimeout(() => void tick(), env.indexerPollMs);
}

async function pollLive(): Promise<void> {
  const rounds = await currentRounds(chain);
  const nowSec = Math.floor(Date.now() / 1000);

  for (const r of rounds) {
    const prev = getRound(r.marketId);
    const row: Omit<RoundRow, "first_seen" | "settled_at"> = {
      market_id: r.marketId,
      asset: r.asset,
      interval_sec: r.intervalSec,
      opens_at: r.opensAt,
      locks_at: r.locksAt,
      status: r.status,
      opening_price: r.openingPrice,
      closing_price: null,
      result: null,
    };
    upsertRound(row);
    const saved = getRound(r.marketId)!;

    if (!prev) bus.emitT("round:new", saved);
    else if (prev.status !== saved.status) bus.emitT("round:update", saved);

    const secsLeft = r.locksAt - nowSec;
    if (secsLeft > 0 && secsLeft <= LOCK_WARN_SEC && !lockWarned.has(r.marketId)) {
      lockWarned.add(r.marketId);
      bus.emitT("round:locking", { round: saved });
    }
  }
}

async function pollSettled(): Promise<void> {
  const settled = await settledRounds(chain, { limit: 40 });

  for (const s of settled) {
    if (settledSeen.has(s.marketId)) continue;

    // make sure the row exists (a settlement we missed while the round was live)
    if (!getRound(s.marketId)) {
      upsertRound({
        market_id: s.marketId,
        asset: s.asset,
        interval_sec: s.intervalSec,
        opens_at: s.locksAt - s.intervalSec,
        locks_at: s.locksAt,
        status: "resolved",
        opening_price: s.openingPrice,
        closing_price: s.closingPrice,
        result: s.result,
      });
    } else {
      setRoundResult(s.marketId, s.result, s.closingPrice);
    }

    const round = getRound(s.marketId)!;
    settledSeen.add(s.marketId);
    lockWarned.delete(s.marketId);

    gradeRound(round); // grades calls, updates streaks, emits call:graded
    bus.emitT("round:settled", { round: { ...round, result: s.result } });
  }

  // keep the in-memory sets from growing without bound
  if (settledSeen.size > 500) trim(settledSeen, 300);
  if (lockWarned.size > 500) trim(lockWarned, 300);
}

function trim(set: Set<string>, keep: number): void {
  const arr = [...set];
  set.clear();
  for (const v of arr.slice(-keep)) set.add(v);
}
