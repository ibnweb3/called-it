// Grading a settled round: for every call on it, decide won/lost/void, update the
// player's streak, and announce the result.
//
// Streak rule: a win extends the current streak, a loss resets it to 0, a void
// leaves it untouched (the round didn't really happen). `best` only ever grows.

import {
  callsForRound,
  gradeCall,
  getStreak,
  writeStreak,
  markRoundSettled,
  type RoundRow,
} from "./db.js";
import { bus } from "./events.js";

export function gradeRound(round: RoundRow): void {
  const result = round.result as "UP" | "DOWN" | "VOID" | null;
  if (!result) return;

  markRoundSettled(round.market_id, result, round.closing_price);

  for (const call of callsForRound(round.market_id)) {
    if (call.outcome) continue; // already graded

    let outcome: "won" | "lost" | "void";
    let payout: number;
    if (result === "VOID") {
      outcome = "void";
      payout = round4(call.contracts * 0.5);
    } else if (call.side === result) {
      outcome = "won";
      payout = round4(call.contracts); // 1 USDso per winning contract
    } else {
      outcome = "lost";
      payout = 0;
    }
    gradeCall(call.id, outcome, payout);

    const s = getStreak(call.address);
    s.total_calls += 1;
    if (outcome === "won") {
      s.total_wins += 1;
      s.current += 1;
      s.best = Math.max(s.best, s.current);
    } else if (outcome === "lost") {
      s.current = 0;
    }
    s.net_usd = round4(s.net_usd + payout - call.spent);
    writeStreak(s);

    bus.emitT("call:graded", {
      address: call.address,
      call: { ...call, outcome, payout },
      asset: round.asset,
      roundResult: result,
      result: outcome,
      payout,
      streakCurrent: s.current,
      streakBest: s.best,
    });
  }
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
