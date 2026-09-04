import { useEffect, useMemo, useState } from "react";
import { Btn, Bubble, Label, Seg, Sheet, Sticker } from "@/components/kit";
import { Mascot } from "@/components/Mascot";
import { Confetti } from "@/components/Confetti";
import { ShareButton } from "@/components/ShareCard";
import { SlipLadder } from "@/components/SlipLadder";
import { useNow } from "@/hooks/useNow";
import { DEMO_INTERVALS } from "@/lib/demo";
import { arrow, usd } from "@/lib/format";
import { useApp } from "@/lib/store";
import {
  CHIPS,
  SLIP_MAX_LEGS,
  SLIP_STOPS,
  type Asset,
  type Chip,
  type Side,
  type SlipLeg,
  type SlipPlan,
  type SlipView,
} from "@/lib/types";

/** Short windows only — a run should play out while you're watching it. */
const CADENCES = DEMO_INTERVALS.slice(0, 3);

export function Slip() {
  const mode = useApp((s) => s.mode);
  const slip = useApp((s) => s.slip);

  if (mode === "live") return <ComingSoon />;
  if (slip && slip.status === "live") return <Ride slip={slip} />;
  if (slip && (slip.status === "matured" || slip.status === "busted")) return <Ended slip={slip} />;
  return <Builder />;
}

// ---------------------------------------------------------------- builder ----

function Builder() {
  const armSlip = useApp((s) => s.armSlip);
  const balances = useApp((s) => s.balances);
  const gateway = useApp((s) => s.gateway);

  const [asset, setAsset] = useState<Asset>("BTC");
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [intervalSec, setIntervalSec] = useState(CADENCES[0].sec);
  const [stake, setStake] = useState<Chip>(5);
  const [stopIdx, setStopIdx] = useState(0);
  const [projection, setProjection] = useState<number[]>([]);
  const [arming, setArming] = useState(false);

  const plan: SlipPlan = useMemo(
    () => ({ legs, intervalSec, stake, stop: SLIP_STOPS[stopIdx].stop }),
    [legs, intervalSec, stake, stopIdx],
  );

  useEffect(() => {
    if (legs.length < 1) {
      setProjection([]);
      return;
    }
    let alive = true;
    void gateway.slipProjection(plan).then((p) => alive && setProjection(p));
    return () => {
      alive = false;
    };
  }, [gateway, plan, legs.length]);

  const purse = balances?.usd ?? 0;
  const canArm = legs.length >= 2 && purse >= stake && !arming;
  const top = projection.length ? projection[projection.length - 1] : null;

  function addLeg(side: Side) {
    if (legs.length >= SLIP_MAX_LEGS) return;
    setLegs((l) => [...l, { asset, side }]);
  }

  async function arm() {
    setArming(true);
    try {
      await armSlip(plan);
    } catch {
      /* the store raised a toast */
    } finally {
      setArming(false);
    }
  }

  return (
    <div className="screen">
      <Sticker className="stack" style={{ gap: 10 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div>
            <Label>build a run</Label>
            <h2 style={{ fontSize: 20 }}>Stack your calls</h2>
          </div>
          <Mascot mood="idle" size={38} />
        </div>
        <p className="dim tiny">
          Each call rolls its whole win into the next. Get them all and the stake keeps
          multiplying. Miss one and the run is over — but you can cash out any time.
        </p>
      </Sticker>

      <Sticker flat className="stack" style={{ gap: 10 }}>
        <div className="row-between">
          <Seg<Asset>
            ariaLabel="Asset for this leg"
            value={asset}
            onChange={setAsset}
            options={[
              { value: "BTC", label: "BTC" },
              { value: "ETH", label: "ETH" },
            ]}
          />
          <span className="tiny dim num">
            {legs.length}/{SLIP_MAX_LEGS} legs
          </span>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button
            type="button"
            className="btn btn-up btn-block"
            disabled={legs.length >= SLIP_MAX_LEGS}
            onClick={() => addLeg("UP")}
          >
            + {asset} ▲ UP
          </button>
          <button
            type="button"
            className="btn btn-down btn-block"
            disabled={legs.length >= SLIP_MAX_LEGS}
            onClick={() => addLeg("DOWN")}
          >
            + {asset} ▼ DOWN
          </button>
        </div>

        {legs.length > 0 ? (
          <ul className="slip-legs" aria-label="Legs in this run">
            {legs.map((leg, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={`slip-leg-chip ${leg.side === "UP" ? "up" : "down"}`}
                  onClick={() => setLegs((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Remove leg ${i + 1}, ${leg.asset} ${leg.side}`}
                >
                  <span className="slip-leg-n">{i + 1}</span>
                  {leg.asset} <span aria-hidden="true">{arrow(leg.side)}</span>
                  <span aria-hidden="true" className="slip-leg-x">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tiny dim">Add at least two calls to make a run.</p>
        )}
      </Sticker>

      <Sticker flat className="stack" style={{ gap: 10 }}>
        <div>
          <Label>window</Label>
          <Seg<number>
            scroll
            ariaLabel="Window length"
            value={intervalSec}
            onChange={setIntervalSec}
            options={CADENCES.map((c) => ({ value: c.sec, label: c.label }))}
          />
        </div>

        <div>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <Label>opening stake</Label>
            <span className="tiny dim num">{usd(purse)} to play</span>
          </div>
          <div className="chips">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={c === stake}
                disabled={purse < c}
                onClick={() => setStake(c)}
              >
                ${c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>bank when</Label>
          <Seg<number>
            ariaLabel="When to bank the run"
            value={stopIdx}
            onChange={setStopIdx}
            options={SLIP_STOPS.map((s, i) => ({ value: i, label: s.label }))}
          />
        </div>
      </Sticker>

      {legs.length >= 1 && (
        <Sticker flat className="stack" style={{ gap: 6 }}>
          <Label>if every call lands</Label>
          <div className="slip-proj">
            <span className="num">{usd(stake)}</span>
            {projection.map((v, i) => (
              <span key={i} className="slip-proj-step">
                <span aria-hidden="true">→</span> <span className="num">{usd(v)}</span>
              </span>
            ))}
          </div>
          {top !== null && (
            <p className="tiny dim">
              {(top / stake).toFixed(1)}× on {usd(stake)} — a projection from the books right now, not
              a promise.
            </p>
          )}
        </Sticker>
      )}

      <Btn tone="gold" block disabled={!canArm} onClick={() => void arm()}>
        {arming
          ? "Arming…"
          : legs.length < 2
            ? "Add two calls to start"
            : purse < stake
              ? "Not enough play money"
              : `Arm the run — ${usd(stake)}`}
      </Btn>

      <Bubble>
        <strong>Demo.</strong> Legs run on {CADENCES[0].label} practice windows so the whole run
        plays out in a few minutes. Play money — nothing at stake.
      </Bubble>
    </div>
  );
}

// ------------------------------------------------------------------- ride ----

function Ride({ slip }: { slip: SlipView }) {
  const now = useNow();
  const gateway = useApp((s) => s.gateway);
  const refreshSlip = useApp((s) => s.refreshSlip);
  const cashOutSlip = useApp((s) => s.cashOutSlip);
  const flash = useApp((s) => s.slipFlash);
  const clearFlash = useApp((s) => s.clearSlipFlash);
  const toast = useApp((s) => s.toast);

  const [quote, setQuote] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);

  // If the leg settles (or rolls on) while the sheet is open, its numbers are
  // stale — drop it and let the player decide again on the new rung.
  useEffect(() => setConfirm(false), [slip.currentLeg, slip.status]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void refreshSlip();
      void gateway.slipQuote(slip.id).then((q) => alive && setQuote(q));
    };
    read();
    const id = window.setInterval(read, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [gateway, slip.id, refreshSlip]);

  useEffect(() => {
    if (!flash) return;
    if (flash === "advanced") toast("Called it — rolling into the next leg", "good");
    if (flash === "void-retry") toast("That leg voided — replaying it", "info");
    clearFlash();
  }, [flash, toast, clearFlash]);

  const leg = slip.legs[slip.currentLeg];
  const legsWon = slip.legs.filter((l) => l.outcome === "won").length;
  const left = leg.locksAt ? Math.max(0, leg.locksAt - now) : 0;

  return (
    <div className="screen">
      <Sticker className="stack" style={{ gap: 8 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div>
            <Label>the run · leg {slip.currentLeg + 1} of {slip.plan.legs.length}</Label>
            <div className="row" style={{ gap: 8, alignItems: "baseline" }}>
              <span className="num" style={{ fontSize: 30 }}>
                {usd(slip.value)}
              </span>
              <span className="pill pill-gold num">{slip.multiple.toFixed(2)}×</span>
            </div>
            <p className="tiny dim">
              from {usd(slip.stake)} · {legsWon} call{legsWon === 1 ? "" : "s"} landed
            </p>
          </div>
          <Mascot mood={left <= 10 ? "nervous" : "watching"} size={44} />
        </div>
      </Sticker>

      <SlipLadder slip={slip} now={now} />

      {quote !== null ? (
        <Btn tone="gold" block onClick={() => setConfirm(true)}>
          Cash out {usd(quote)} now
        </Btn>
      ) : (
        <Btn tone="ghost" block disabled>
          {left === 0 ? "Leg settling…" : "Leg locking — hold on"}
        </Btn>
      )}

      <Bubble>
        <strong>Let it ride.</strong> Do nothing and the win rolls straight into leg{" "}
        {Math.min(slip.currentLeg + 2, slip.plan.legs.length)}. One wrong call ends the run.
      </Bubble>

      {confirm && quote !== null && (
        <Sheet onClose={() => setConfirm(false)} labelledBy="cash-title">
          <div className="stack center" style={{ gap: 14, justifyItems: "center" }}>
            <Mascot mood="idle" size={64} />
            <h2 id="cash-title" style={{ fontSize: 24 }}>
              Bank {usd(quote)}?
            </h2>
            <p className="dim tiny">
              The run ends here — {usd(quote)} to your wallet now, instead of riding on{" "}
              {slip.plan.legs.length - slip.currentLeg} more call
              {slip.plan.legs.length - slip.currentLeg === 1 ? "" : "s"}.
            </p>
            <div className="row" style={{ gap: 10, width: "100%" }}>
              <Btn tone="ghost" style={{ flex: 1 }} onClick={() => setConfirm(false)}>
                Keep going
              </Btn>
              <Btn
                tone="gold"
                style={{ flex: 1 }}
                onClick={() => {
                  setConfirm(false);
                  void cashOutSlip();
                }}
              >
                Bank it
              </Btn>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- endings ----

function Ended({ slip }: { slip: SlipView }) {
  const now = useNow();
  const newSlip = useApp((s) => s.newSlip);
  const legsWon = slip.legs.filter((l) => l.outcome === "won").length;
  const climbedTo = [...slip.legs].reverse().find((l) => l.outcome === "won")?.valueOut ?? null;

  // A banked run that beat the stake is a win; cashing out underwater is just
  // cutting a run short — same screen, quieter, no confetti.
  if (slip.status === "matured") {
    const up = slip.owed >= slip.stake;
    return (
      <>
        <Confetti fire={up} />
        <div className="screen">
          <Sticker className="stack center pop-in" style={{ gap: 12, justifyItems: "center" }}>
            <Mascot mood={up ? "win" : "idle"} size={96} />
            <h1 style={{ fontSize: 34 }}>{up ? "Banked it!" : "Cashed out"}</h1>
            <div
              className="num"
              style={{ fontSize: 40, color: up ? "var(--up-deep)" : "var(--text-dim)" }}
            >
              {usd(slip.owed)}
            </div>
            <p style={{ fontSize: 16 }}>
              {legsWon > 0
                ? `${legsWon} call${legsWon === 1 ? "" : "s"} landed · ${slip.multiple.toFixed(2)}× on ${usd(slip.stake)}`
                : `Took ${usd(slip.owed)} off the table before it settled`}
            </p>
          </Sticker>

          <SlipLadder slip={slip} now={now} />

          {up && (
            <ShareButton
              label="Share the run"
              input={{
                headline: `Banked a ${slip.multiple.toFixed(1)}× run`,
                detail: `${legsWon} leg${legsWon === 1 ? "" : "s"} · ${usd(slip.stake)} → ${usd(slip.owed)}`,
                streak: legsWon,
                strip: slip.legs.map((l) => (l.outcome === "won" ? l.side : "VOID")),
                url: window.location.origin,
              }}
            />
          )}
          <Btn tone="gold" block onClick={newSlip}>
            {up ? "Run it back" : "New run"}
          </Btn>
        </div>
      </>
    );
  }

  return (
    <div className="screen">
      <Sticker className="stack center shake" style={{ gap: 12, justifyItems: "center" }}>
        <Mascot mood="lose" size={92} />
        <h1 style={{ fontSize: 32 }}>Run over</h1>
        <p style={{ fontSize: 16 }}>
          Leg {slip.currentLeg + 1} called wrong.
          {climbedTo !== null ? ` You'd climbed to ${usd(climbedTo)}.` : ""}
        </p>
        <p className="tiny dim">The stake was the whole loss — {usd(slip.stake)}, nothing more.</p>
      </Sticker>

      <SlipLadder slip={slip} now={now} />

      <Btn tone="gold" block onClick={newSlip}>
        New run
      </Btn>
    </div>
  );
}

// -------------------------------------------------------------- live wait ----

function ComingSoon() {
  return (
    <div className="screen">
      <Sticker className="stack center" style={{ gap: 12, justifyItems: "center" }}>
        <Mascot mood="sleep" size={84} />
        <h2 style={{ fontSize: 22 }}>Runs land in demo first</h2>
        <p className="dim" style={{ fontSize: 14, maxWidth: 280 }}>
          The Slip — stacking calls into one compounding run — is playable in demo mode today.
          Wiring it to real windows on chain is the next build.
        </p>
      </Sticker>
    </div>
  );
}
