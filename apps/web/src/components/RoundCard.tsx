import { Countdown } from "./Countdown";
import { Bubble, Sticker } from "./kit";
import { Mascot, type Mood } from "./Mascot";
import {
  askFor,
  contractsFor,
  intervalLabel,
  payoutMultiple,
  price,
  timeOfDay,
  usd,
} from "@/lib/format";
import { CHIPS, type Chip, type LivePriceRow, type Position, type Round, type Side } from "@/lib/types";

export function RoundCard({
  round,
  now,
  chip,
  onChip,
  onCall,
  balanceUsd,
  position,
  live,
  disabled,
}: {
  round: Round;
  now: number;
  chip: Chip;
  onChip: (c: Chip) => void;
  onCall: (side: Side) => void;
  balanceUsd: number | null;
  position?: Position;
  /** The live underlying, when the feed has something to say. */
  live?: LivePriceRow | null;
  disabled?: boolean;
}) {
  const left = Math.max(0, round.locksAt - now);
  const warnAt = Math.min(60, Math.max(10, Math.floor(round.intervalSec / 4)));
  const upAsk = askFor(round.book, "UP");
  const downAsk = askFor(round.book, "DOWN");
  const noBook = !upAsk && !downAsk;
  const tooLate = left < 30 && round.intervalSec > 120;
  const closed = left === 0 || round.status !== "trading";

  const mood: Mood = closed ? "sleep" : left <= warnAt ? "nervous" : position ? "watching" : "idle";
  const p = round.upProbability ?? 0.5;

  return (
    <Sticker className="stack round-card">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="label">{intervalLabel(round.intervalSec)} window</div>
          <h2 style={{ fontSize: 12.5, marginTop: 1, lineHeight: 1.15 }}>
            Will {round.asset} be up or down at {timeOfDay(round.locksAt)}?
          </h2>
        </div>
        <Mascot mood={mood} size={26} />
      </div>

      <Countdown locksAt={round.locksAt} now={now} intervalSec={round.intervalSec} />

      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="label">line to beat</div>
          {/* the live delta rides the same line as the price — "$78,120.55 · +$37 ▲" */}
          <div className="row" style={{ gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
            <span className="num" style={{ fontSize: 13 }}>
              {price(round.openingPrice)}
            </span>
            <LiveDelta live={live} openingPrice={round.openingPrice} />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="label">max win</div>
          <div className="num" style={{ fontSize: 13 }}>
            {usd(bestWin(chip, upAsk, downAsk))}
          </div>
        </div>
      </div>

      <OddsMeter up={p} upAsk={upAsk} downAsk={downAsk} />

      <div>
        <div className="row-between" style={{ marginBottom: 4 }}>
          <span className="label">your chip</span>
          {balanceUsd !== null && (
            <span className="tiny dim num">{usd(balanceUsd)} to play</span>
          )}
        </div>
        <div className="chips">
          {CHIPS.map((c) => {
            const short = balanceUsd !== null && balanceUsd < c;
            return (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={c === chip}
                disabled={short}
                onClick={() => onChip(c)}
                title={short ? "Not enough to play this chip" : `Play a $${c} chip`}
              >
                ${c}
              </button>
            );
          })}
        </div>
      </div>

      {noBook ? (
        <Bubble tone="warn">
          <strong>Warming up…</strong> the book is thin this second. The Croupier quotes both
          sides every round — give it a moment.
        </Bubble>
      ) : (
        <div className="row" style={{ gap: 12, alignItems: "stretch" }}>
          <CallButton
            side="UP"
            ask={upAsk}
            chip={chip}
            disabled={disabled || closed || tooLate || !upAsk}
            onCall={onCall}
          />
          <CallButton
            side="DOWN"
            ask={downAsk}
            chip={chip}
            disabled={disabled || closed || tooLate || !downAsk}
            onCall={onCall}
          />
        </div>
      )}

      {closed && <Bubble>This window is shut. The next one is being dealt…</Bubble>}
      {!closed && tooLate && (
        <Bubble tone="warn">Under 30 seconds — too tight to fill. Sit this one out.</Bubble>
      )}

      {position && <YourCall position={position} />}
    </Sticker>
  );
}

/**
 * The sticker with the stretch. On hover the word pulls itself apart, the whole
 * button peels up off the card, and the arrow leans the way it points; pressing
 * it snaps back down into its own shadow (styles/app.css, `.btn-call`).
 *
 * The arrow and the word always travel together, so the direction never rests
 * on colour alone. What it pays lives one place — the odds-meter caption right
 * above — rather than repeated on every button; a third stacked line was the
 * single biggest thing keeping this button tall, and the number is still
 * spoken for a screen reader via `aria-label`.
 */
function CallButton({
  side,
  ask,
  chip,
  disabled,
  onCall,
}: {
  side: Side;
  ask: number | null;
  chip: Chip;
  disabled?: boolean;
  onCall: (s: Side) => void;
}) {
  const win = contractsFor(chip, ask);
  return (
    <button
      type="button"
      className={`btn btn-call ${side === "UP" ? "btn-up" : "btn-down"}`}
      disabled={disabled}
      onClick={() => onCall(side)}
      aria-label={`Call ${side} with a $${chip} chip${win ? `, pays ${usd(win)} if it lands` : ", no quote on that side"}`}
    >
      <span className="arrow" aria-hidden="true">
        {side === "UP" ? "▲" : "▼"}
      </span>
      <span className="word">{side}</span>
    </button>
  );
}

/**
 * "· +$37 ▲" beside the price — where the underlying actually is against the
 * line the round resolves on. It rides the same line as the price rather than
 * a line of its own, renders nothing at all when the feed is quiet (SPEC §9),
 * and carries direction in the sign and the arrow, not just the colour.
 */
function LiveDelta({ live, openingPrice }: { live?: LivePriceRow | null; openingPrice: number | null }) {
  if (!live) return null;

  if (openingPrice === null) {
    return <span className="tiny dim num">now {price(live.price)}</span>;
  }

  const delta = live.price - openingPrice;
  // Below a cent it is noise, not a move — say "level" rather than "+$0.00".
  const flat = Math.abs(delta) < 0.005;
  const up = delta > 0;

  return (
    <span
      className="tiny num"
      style={{ color: flat ? "var(--text-dim)" : up ? "var(--up-deep)" : "var(--down-deep)" }}
      title={`Live ${live.asset} price against this round's opening price`}
    >
      ·{" "}
      {flat ? (
        "level"
      ) : (
        <>
          {up ? "+" : "−"}
          {usd(Math.abs(delta))} <span aria-hidden="true">{up ? "▲" : "▼"}</span>
          <span className="sr-only">{up ? "above" : "below"} the line</span>
        </>
      )}
    </span>
  );
}

/** Both sides at once — the shape of the coin flip, not a chart. */
function OddsMeter({ up, upAsk, downAsk }: { up: number; upAsk: number | null; downAsk: number | null }) {
  const upPct = Math.round(up * 100);
  const upMult = payoutMultiple(upAsk);
  const downMult = payoutMultiple(downAsk);
  return (
    <div>
      <div className="meter" role="img" aria-label={`Market says up ${upPct} percent, down ${100 - upPct} percent`}>
        <span className="m-up" style={{ flexBasis: `${Math.max(18, Math.min(82, upPct))}%` }}>
          ▲ {upPct}%
        </span>
        <span className="m-down" style={{ flexBasis: `${Math.max(18, Math.min(82, 100 - upPct))}%` }}>
          {100 - upPct}% ▼
        </span>
      </div>
      <div className="row-between tiny dim" style={{ marginTop: 3, fontSize: 11 }}>
        <span>UP pays {upMult ? `${upMult.toFixed(2)}×` : "—"}</span>
        <span>DOWN pays {downMult ? `${downMult.toFixed(2)}×` : "—"}</span>
      </div>
    </div>
  );
}

function YourCall({ position }: { position: Position }) {
  return (
    <div
      className="bubble"
      style={{ background: position.side === "UP" ? "var(--up)" : "var(--down)", color: "#14100f" }}
    >
      <strong>
        You called {position.side} {position.side === "UP" ? "▲" : "▼"}
      </strong>{" "}
      · <span className="num">{position.contracts.toFixed(2)}</span> contracts · max win{" "}
      <span className="num">{usd(position.contracts)}</span>
    </div>
  );
}

function bestWin(chip: Chip, upAsk: number | null, downAsk: number | null): number | null {
  const a = contractsFor(chip, upAsk);
  const b = contractsFor(chip, downAsk);
  if (a === null && b === null) return null;
  return Math.max(a ?? 0, b ?? 0);
}
