import { useEffect, useRef, useState } from "react";
import { clock, timeOfDay } from "@/lib/format";

/**
 * The hero. Big tabular digits on a torn ticket, and the last stretch turns
 * pink and pulses. The digits themselves are not a live region — announcing
 * every second would be unusable — so a separate polite region calls out the
 * milestones instead.
 */
export function Countdown({
  locksAt,
  now,
  intervalSec,
}: {
  locksAt: number;
  now: number;
  intervalSec: number;
}) {
  const left = Math.max(0, locksAt - now);
  const warnAt = Math.min(60, Math.max(10, Math.floor(intervalSec / 4)));
  const urgent = left <= warnAt && left > 0;
  const [called, setCalled] = useState("");
  const announced = useRef<number | null>(null);

  useEffect(() => {
    for (const mark of [60, 30, 10]) {
      if (left <= mark && announced.current !== mark && left > mark - 5) {
        announced.current = mark;
        setCalled(`${mark} seconds left`);
        return;
      }
    }
    if (left === 0 && announced.current !== 0) {
      announced.current = 0;
      setCalled("Round locked");
    }
  }, [left]);

  const text = clock(left);
  const [mins, secs] = text.includes(":") ? [text.slice(0, text.lastIndexOf(":")), text.slice(text.lastIndexOf(":") + 1)] : [text, ""];

  return (
    <div className={`ticket ${urgent ? "urgent" : ""}`}>
      <div className="label" style={{ color: "#3b2f17" }}>
        {left === 0 ? "locked" : "closes in"}
      </div>
      <span className="countdown">
        {mins}
        <span className="sep">:</span>
        {secs}
      </span>
      <div className="tiny" style={{ color: "#3b2f17", opacity: 0.85 }}>
        at {timeOfDay(locksAt)}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {called}
      </span>
    </div>
  );
}
