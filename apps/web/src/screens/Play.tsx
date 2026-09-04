import { useEffect } from "react";
import { Bubble, Label, Seg, Skeleton, Sticker } from "@/components/kit";
import { Mascot } from "@/components/Mascot";
import { RoundCard } from "@/components/RoundCard";
import { SettledStrip } from "@/components/SettledStrip";
import { useLivePrice } from "@/hooks/useLivePrice";
import { useNow } from "@/hooks/useNow";
import { MODE } from "@/lib/env";
import { DEMO_INTERVALS } from "@/lib/demo";
import { intervalLabel, usd } from "@/lib/format";
import { activeRound, unclaimed, useApp } from "@/lib/store";
import { INTERVALS, type Asset, type Chip } from "@/lib/types";

const windows = MODE === "demo" ? DEMO_INTERVALS : INTERVALS;

export function Play({ onOpenSquad }: { onOpenSquad: () => void }) {
  const now = useNow();
  const asset = useApp((s) => s.asset);
  const live = useLivePrice(asset);
  const intervalSec = useApp((s) => s.intervalSec);
  const chip = useApp((s) => s.chip);
  const rounds = useApp((s) => s.rounds);
  const settled = useApp((s) => s.settled);
  const profile = useApp((s) => s.profile);
  const balances = useApp((s) => s.balances);
  const roomName = useApp((s) => s.roomName);
  const online = useApp((s) => s.online);
  const round = useApp(activeRound);
  const setAsset = useApp((s) => s.setAsset);
  const setIntervalSec = useApp((s) => s.setInterval);
  const setChip = useApp((s) => s.setChip);
  const openConfirm = useApp((s) => s.openConfirm);
  const refreshRounds = useApp((s) => s.refreshRounds);
  const claimAll = useApp((s) => s.claimAll);

  // The WS carries the round; this is the belt to its braces (SPEC §6, offline).
  useEffect(() => {
    const id = window.setInterval(() => void refreshRounds(), online ? 30_000 : 6_000);
    return () => window.clearInterval(id);
  }, [refreshRounds, online]);

  const purse = unclaimed(profile);
  const position = (profile?.positions ?? []).find(
    (p) => p.marketId === round?.marketId && p.outcome === "pending",
  );
  const streak = profile?.streak.current ?? 0;

  return (
    <div className="screen">
      <div className="row-between">
        <Seg<Asset>
          ariaLabel="Asset"
          value={asset}
          onChange={setAsset}
          options={[
            { value: "BTC", label: "BTC" },
            { value: "ETH", label: "ETH" },
          ]}
        />
        {streak > 0 && (
          <span className="pill pill-gold" title="Current streak">
            <span className="flame" aria-hidden="true">
              🔥
            </span>
            <span className="num">{streak}</span>
          </span>
        )}
      </div>

      <Seg<number>
        scroll
        ariaLabel="Round length"
        value={intervalSec}
        onChange={setIntervalSec}
        options={windows.map((w) => ({ value: w.sec, label: w.label }))}
      />

      {purse.count > 0 && (
        <button className="bubble" style={{ background: "var(--up)", color: "#14100f", textAlign: "left" }} onClick={() => void claimAll()}>
          <strong>{usd(purse.usd)} waiting</strong> from {purse.count} settled round
          {purse.count > 1 ? "s" : ""} — tap to claim.
        </button>
      )}

      {round ? (
        <RoundCard
          round={round}
          now={now}
          chip={chip}
          onChip={(c: Chip) => setChip(c)}
          onCall={openConfirm}
          balanceUsd={balances?.usd ?? null}
          position={position}
          live={live}
        />
      ) : rounds.length === 0 && !online ? (
        <Sticker className="stack center" style={{ justifyItems: "center", gap: 12 }}>
          <Mascot mood="sleep" size={80} />
          <h2 style={{ fontSize: 24 }}>Can't reach the game</h2>
          <p className="dim" style={{ fontSize: 14 }}>
            We'll keep trying. Your streak and any open calls are safe.
          </p>
        </Sticker>
      ) : rounds.length > 0 ? (
        <Sticker className="stack center" style={{ justifyItems: "center", gap: 12 }}>
          <Mascot mood="watching" size={72} />
          <h2 style={{ fontSize: 22 }}>No {intervalLabel(intervalSec)} window open</h2>
          <p className="dim" style={{ fontSize: 14 }}>
            {asset} isn't running that length right now. Try another window.
          </p>
        </Sticker>
      ) : (
        <>
          <Skeleton height={330} />
          <span className="sr-only" role="status">
            Loading the round
          </span>
        </>
      )}

      <div className="settled-block">
        <Label>last {settled.length || 18} rounds</Label>
        <SettledStrip rounds={settled} />
      </div>

      <button className="room-line" onClick={onOpenSquad}>
        <span>
          {roomName ? (
            <>
              Playing in <strong>🏠 {roomName}</strong>
            </>
          ) : (
            "Playing solo"
          )}
        </span>
        <span>switch →</span>
      </button>

      {MODE === "demo" && intervalSec === 60 && (
        <Bubble>
          <strong>1m</strong> is a demo-only practice round. Real venues start at 5m.
        </Bubble>
      )}
    </div>
  );
}
