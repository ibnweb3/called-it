import { useEffect, useState } from "react";
import { Btn, Full, Sticker } from "./kit";
import { Mascot } from "./Mascot";
import { Confetti } from "./Confetti";
import { ShareButton } from "./ShareCard";
import { usd } from "@/lib/format";
import { useApp } from "@/lib/store";

/**
 * The news, full-bleed. A win is the only moment this app is allowed to shout —
 * once, briefly, and then it hands you the next round.
 */
export function ResultScreen() {
  const result = useApp((s) => s.result);
  const settled = useApp((s) => s.settled);
  const profile = useApp((s) => s.profile);
  const broken = useApp((s) => s.brokenStreak);
  const dismiss = useApp((s) => s.dismissResult);
  const claim = useApp((s) => s.claim);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!result) setClaiming(false);
  }, [result]);

  if (!result) return null;

  const won = result.result === "won";
  const voided = result.result === "void";
  const claimable = (profile?.positions ?? []).find((p) => p.marketId === result.marketId)?.claimable ?? 0;

  async function claimIt() {
    setClaiming(true);
    await claim(result!.marketId);
    setClaiming(false);
  }

  return (
    <>
      <Confetti fire={won} />
      <Full label={won ? "You won this round" : voided ? "Round voided" : "You lost this round"}>
        <Sticker className={`stack center ${won ? "pop-in" : "shake"}`} style={{ justifyItems: "center", gap: 14 }}>
          <Mascot mood={won ? "win" : voided ? "void" : "lose"} size={110} />

          <h1 style={{ fontSize: 40 }}>
            {won ? "Called it!" : voided ? "Round voided" : "Missed."}
          </h1>

          <p style={{ fontSize: 18 }}>
            {result.asset} closed{" "}
            <strong>
              {result.roundResult === "VOID" ? "nowhere" : result.roundResult}{" "}
              {result.roundResult === "UP" ? "▲" : result.roundResult === "DOWN" ? "▼" : "∅"}
            </strong>
            . You called {result.side} {result.side === "UP" ? "▲" : "▼"}.
          </p>

          <div
            className="num"
            style={{
              fontSize: 46,
              color: won ? "var(--up-deep)" : voided ? "var(--text-dim)" : "var(--down-deep)",
            }}
          >
            {won ? `+${usd(result.payout)}` : voided ? usd(result.payout) : `−${usd(result.chipUsd)}`}
          </div>

          {won ? (
            <div className="pill pill-gold" style={{ fontSize: 15 }}>
              <span className="flame" aria-hidden="true">
                🔥
              </span>
              Streak {result.streakCurrent}
              {result.streakCurrent >= result.streakBest ? " — best yet" : ""}
            </div>
          ) : voided ? (
            <p className="tiny dim">Nobody called it. Your stake comes back at half a contract each.</p>
          ) : (
            <div className="pill" style={{ fontSize: 15 }}>
              {broken > 0 ? `Streak reset — you were on ${broken}` : "No streak to lose. Next one."}
            </div>
          )}

          <div className="stack" style={{ width: "100%", gap: 10 }}>
            {claimable > 0 && (
              <Btn tone="gold" block onClick={() => void claimIt()} disabled={claiming}>
                {claiming ? "Claiming…" : `Claim ${usd(claimable)}`}
              </Btn>
            )}
            {won && (
              <ShareButton
                label="Share it"
                input={{
                  headline: `Called it. ${result.streakCurrent} in a row.`,
                  detail: `${result.asset} ${result.side === "UP" ? "▲" : "▼"} · ${usd(result.chipUsd)} → ${usd(result.payout)}`,
                  streak: result.streakCurrent,
                  strip: settled.map((s) => s.result),
                  url: window.location.origin,
                }}
              />
            )}
            <Btn tone={won ? "ghost" : "gold"} block onClick={dismiss} autoFocus>
              Go again
            </Btn>
          </div>
        </Sticker>
      </Full>
    </>
  );
}
