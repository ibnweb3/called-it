// Badges are derived, never stored — recompute from the streak row so they can't
// drift. Keep the list short; the game is the streak, badges are seasoning.

import type { StreakRow } from "../db.js";

export interface Badge {
  key: string;
  label: string;
  hit: boolean;
}

export function badgesFor(s: StreakRow): Badge[] {
  const winRate = s.total_calls > 0 ? s.total_wins / s.total_calls : 0;
  return [
    { key: "streak3", label: "On a roll (3)", hit: s.best >= 3 },
    { key: "streak5", label: "Hot hand (5)", hit: s.best >= 5 },
    { key: "streak10", label: "Called it x10", hit: s.best >= 10 },
    { key: "calls25", label: "Regular (25 calls)", hit: s.total_calls >= 25 },
    { key: "sharp", label: "Sharp (60%+ over 20)", hit: s.total_calls >= 20 && winRate >= 0.6 },
    { key: "green", label: "In the green", hit: s.net_usd > 0 && s.total_calls >= 10 },
  ];
}

/** Multiplier the prize pot applies to a win, by current streak length. */
export function streakMultiplier(current: number): number {
  if (current >= 10) return 3;
  if (current >= 5) return 2;
  if (current >= 3) return 1.5;
  return 1;
}
