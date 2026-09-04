import { arrow, clock, usd } from "@/lib/format";
import type { SlipView } from "@/lib/types";

/**
 * The run as a stack of rungs. Won rungs fill green and show what the stake grew
 * to; the rung in play is lit and carries the countdown; rungs not yet reached
 * sit dim. The whole point of the screen is right here — how far you've climbed,
 * and how much is on the table if you stop now.
 */
export function SlipLadder({ slip, now }: { slip: SlipView; now: number }) {
  return (
    <ul className="ladder" aria-label="Your run, rung by rung">
      {slip.legs.map((leg) => {
        const isHere = leg.index === slip.currentLeg && leg.outcome === "pending" && slip.status === "live";
        const cls =
          leg.outcome === "won"
            ? "won"
            : leg.outcome === "lost"
              ? "lost"
              : leg.outcome === "void"
                ? "void"
                : isHere
                  ? "here"
                  : "future";

        const left = leg.locksAt ? Math.max(0, leg.locksAt - now) : 0;

        return (
          <li key={leg.index} className={`rung ${cls}`}>
            <div className="rung-label">
              <span className="rung-n">Leg {leg.index + 1}</span>
              <span className="rung-call">
                {leg.asset} <span aria-hidden="true">{arrow(leg.side)}</span> {leg.side}
              </span>
            </div>

            <div className="rung-val">
              {leg.outcome === "won" ? (
                <>
                  {usd(leg.valueOut)}
                  <span className="rung-x">{(leg.valueOut! / slip.stake).toFixed(2)}×</span>
                </>
              ) : leg.outcome === "lost" ? (
                "called wrong"
              ) : leg.outcome === "void" ? (
                "void — replayed"
              ) : isHere ? (
                <>
                  {usd(slip.value)}
                  <span className="rung-clock">{clock(left)}</span>
                </>
              ) : (
                <span className="rung-soon">to come</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
