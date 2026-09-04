import { arrow, price, timeOfDay } from "@/lib/format";
import type { SettledRound } from "@/lib/types";

/**
 * The last ~18 rounds as a row of stickers. It is the tease: the eye reads it
 * as a pattern whether or not there is one. Every pill carries the arrow and a
 * word in its title, so it is never colour alone.
 */
export function SettledStrip({ rounds }: { rounds: SettledRound[] }) {
  if (rounds.length === 0) {
    return (
      <div className="strip" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="strip-pill" style={{ background: "var(--surface-2)", opacity: 0.6 }}>
            ·
          </div>
        ))}
      </div>
    );
  }

  return (
    <ul className="strip" aria-label="Recently settled rounds, newest first">
      {rounds.map((r) => {
        const word = r.result === "VOID" ? "void" : r.result.toLowerCase();
        return (
          <li
            key={r.marketId}
            className={`strip-pill ${r.result === "UP" ? "up" : r.result === "DOWN" ? "down" : ""}`}
            title={`${timeOfDay(r.locksAt)} — closed ${word} (${price(r.openingPrice)} → ${price(r.closingPrice)})`}
          >
            <span aria-hidden="true">{arrow(r.result)}</span>
            <span className="sr-only">{`${timeOfDay(r.locksAt)} ${word}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
