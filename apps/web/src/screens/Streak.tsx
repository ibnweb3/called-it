import { useState } from "react";
import { Btn, Bubble, Label, Sticker } from "@/components/kit";
import { Mascot } from "@/components/Mascot";
import { ShareButton } from "@/components/ShareCard";
import { WalletSheet } from "@/components/Wallet";
import { ago, arrow, intervalLabel, shortAddr, signedUsd, usd } from "@/lib/format";
import { unclaimed, useApp } from "@/lib/store";
import type { Badge } from "@/lib/types";

const EMOJI: Record<string, string> = {
  streak3: "🎯",
  streak5: "🔥",
  streak10: "👑",
  calls25: "🎟️",
  sharp: "🧠",
  green: "💰",
};

/** Realistic counts fit on one screen; a long history gets a note, not a scroll. */
const MAX_CALLS_SHOWN = 2;
const MAX_POSITIONS_SHOWN = 2;

export function Streak({ walletOpen, onWallet }: { walletOpen: boolean; onWallet: (open: boolean) => void }) {
  const profile = useApp((s) => s.profile);
  const settled = useApp((s) => s.settled);
  const address = useApp((s) => s.address);
  const gateway = useApp((s) => s.gateway);
  const refreshProfile = useApp((s) => s.refreshProfile);
  const claim = useApp((s) => s.claim);
  const claimAll = useApp((s) => s.claimAll);
  const toast = useApp((s) => s.toast);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const s = profile?.streak;
  const purse = unclaimed(profile);
  const positions = profile?.positions ?? [];
  const calls = profile?.recentCalls ?? [];

  async function saveHandle() {
    try {
      await gateway.setHandle(draft.trim());
      setEditing(false);
      await refreshProfile();
      toast("Handle set", "good");
    } catch (err) {
      toast((err as Error).message || "Couldn't set that handle", "bad");
    }
  }

  return (
    <div className="screen">
      <Sticker tilt="l" className="stack" style={{ gap: 5, marginBottom: 2 }}>
        <div className="row-between" style={{ alignItems: "center" }}>
          <div>
            <Label>current streak</Label>
            <div className="row" style={{ gap: 6, alignItems: "baseline" }}>
              <span className="flame" style={{ fontSize: 20 }} aria-hidden="true">
                🔥
              </span>
              <span className="streak-big" style={{ fontSize: 26 }}>
                {s?.current ?? 0}
              </span>
              <span className="tiny dim">best {s?.best ?? 0}</span>
            </div>
          </div>
          <Mascot mood={(s?.current ?? 0) >= 3 ? "win" : "idle"} size={30} />
        </div>

        <div className="row" style={{ gap: 6 }}>
          <Stat label="win rate" value={s ? `${Math.round(s.winRate * 100)}%` : "—"} />
          <Stat label="calls" value={String(s?.totalCalls ?? 0)} />
          <Stat
            label="net"
            value={s ? signedUsd(s.netUsd) : "—"}
            tone={s && s.netUsd > 0 ? "up" : s && s.netUsd < 0 ? "down" : undefined}
          />
        </div>

        {s && s.multiplier > 1 && (
          <Bubble tone="warn">
            <strong>{s.multiplier}× the prize pot</strong> while this streak holds.
          </Bubble>
        )}

        <ShareButton
          small
          label="Share your streak"
          input={{
            headline: s?.current ? `${s.current} in a row.` : "Calling it.",
            detail: `best ${s?.best ?? 0} · ${s?.totalWins ?? 0}/${s?.totalCalls ?? 0} · ${signedUsd(s?.netUsd ?? 0)}`,
            streak: s?.current ?? 0,
            strip: settled.map((r) => r.result),
            url: window.location.origin,
          }}
        />
      </Sticker>

      <div>
        <Label>badges</Label>
        <div className="badges" style={{ marginTop: 4 }}>
          {(profile?.badges ?? placeholderBadges).map((b) => (
            <div key={b.key} className={`badge ${b.hit ? "hit" : ""}`} title={`${b.label}${b.hit ? " — earned" : ""}`}>
              <span className="em" aria-hidden="true">
                {EMOJI[b.key] ?? "⭐"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {positions.length > 0 && (
        <div>
          <div className="row-between">
            <Label>open & unclaimed</Label>
            {purse.count > 0 && (
              <Btn small tone="gold" onClick={() => void claimAll()}>
                Claim all {usd(purse.usd)}
              </Btn>
            )}
          </div>
          <ul className="list" style={{ marginTop: 5 }}>
            {positions.slice(0, MAX_POSITIONS_SHOWN).map((p) => (
              <li key={`${p.marketId}-${p.side}`} className="list-row">
                <span className={`pill ${p.side === "UP" ? "pill-up" : "pill-down"}`}>
                  {arrow(p.side)} {p.side}
                </span>
                <span className="grow tiny">
                  {p.asset} {intervalLabel(p.intervalSec)} ·{" "}
                  <span className="num">{p.contracts.toFixed(2)}</span> ct
                </span>
                {p.claimable > 0 ? (
                  <Btn small tone="gold" onClick={() => void claim(p.marketId)}>
                    Claim {usd(p.claimable)}
                  </Btn>
                ) : (
                  <span className="tiny dim">{p.outcome}</span>
                )}
              </li>
            ))}
          </ul>
          {positions.length > MAX_POSITIONS_SHOWN && (
            <p className="more-note">and {positions.length - MAX_POSITIONS_SHOWN} more — Claim all sweeps them.</p>
          )}
        </div>
      )}

      <div>
        <Label>your calls</Label>
        <ul className="list" style={{ marginTop: 5 }}>
          {calls.length === 0 && <li className="list-row dim">No calls yet. The first one is the hard one.</li>}
          {calls.slice(0, MAX_CALLS_SHOWN).map((c, i) => (
            <li key={`${c.marketId}-${i}`} className="list-row">
              <span className={`pill ${c.side === "UP" ? "pill-up" : "pill-down"}`}>
                {arrow(c.side)} {c.side}
              </span>
              <span className="grow tiny">
                {c.asset ?? ""} {usd(c.chipUsd, 0)} · {ago(c.placedAt)}
                {c.roomId ? " · 🏠" : ""}
              </span>
              <span
                className="num tiny"
                style={{
                  color:
                    c.outcome === "won"
                      ? "var(--up-deep)"
                      : c.outcome === "lost"
                        ? "var(--down-deep)"
                        : "var(--text-dim)",
                }}
              >
                {c.outcome === "won"
                  ? `+${usd(c.payout ?? 0)}`
                  : c.outcome === "lost"
                    ? `−${usd(c.spent)}`
                    : c.outcome === "void"
                      ? "void"
                      : "open"}
              </span>
            </li>
          ))}
        </ul>
        {calls.length > MAX_CALLS_SHOWN && <p className="more-note">and {calls.length - MAX_CALLS_SHOWN} more</p>}
      </div>

      <Sticker flat className="stack" style={{ gap: 6 }}>
        <div className="mini-tiles">
          <button className="mini-tile" onClick={() => { setDraft(profile?.handle ?? ""); setEditing((v) => !v); }}>
            <span className="ico" aria-hidden="true">
              🏷️
            </span>
            <span>handle</span>
            <span className="val">{profile?.handle ?? shortAddr(address)}</span>
          </button>
          <button
            className="mini-tile"
            data-on={profile?.telegramLinked ? "true" : undefined}
            onClick={() => toast("The notify bot lands in Phase 4", "info")}
          >
            <span className="ico" aria-hidden="true">
              📣
            </span>
            <span>telegram</span>
            <span className="val">{profile?.telegramLinked ? "linked" : "link"}</span>
          </button>
          <button className="mini-tile" onClick={() => onWallet(true)}>
            <span className="ico" aria-hidden="true">
              💰
            </span>
            <span>wallet</span>
            <span className="val">open</span>
          </button>
        </div>

        {editing && (
          <div className="row" style={{ gap: 8 }}>
            <input
              className="field grow"
              value={draft}
              maxLength={24}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="2–24 characters"
              autoFocus
            />
            <Btn small tone="gold" onClick={() => void saveHandle()} disabled={draft.trim().length < 2}>
              Save
            </Btn>
          </div>
        )}
      </Sticker>

      {walletOpen && <WalletSheet onClose={() => onWallet(false)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="sticker flat grow" style={{ padding: 5 }}>
      <div className="label">{label}</div>
      <div
        className="num"
        style={{
          fontSize: 13,
          color: tone === "up" ? "var(--up-deep)" : tone === "down" ? "var(--down-deep)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const placeholderBadges: Badge[] = [
  { key: "streak3", label: "On a roll (3)", hit: false },
  { key: "streak5", label: "Hot hand (5)", hit: false },
  { key: "streak10", label: "Called it x10", hit: false },
  { key: "calls25", label: "Regular (25 calls)", hit: false },
  { key: "sharp", label: "Sharp (60%+ over 20)", hit: false },
  { key: "green", label: "In the green", hit: false },
];
