import { useEffect } from "react";
import { Btn, Sheet, Spinner } from "./kit";
import { Mascot } from "./Mascot";
import { STAKE_SYMBOL } from "@/lib/wallet";
import { askFor, contractsFor, payoutMultiple, price, timeOfDay, usd } from "@/lib/format";
import { activeRound, useApp } from "@/lib/store";

/**
 * Tap → confirm → pending → in. Every step names the money twice: what it costs
 * and what it wins, because a game about calling it should never be vague about
 * either (SPEC §7, "honest").
 */
export function CallFlow({ onFund }: { onFund: () => void }) {
  const stage = useApp((s) => s.stage);
  const mode = useApp((s) => s.mode);
  const chip = useApp((s) => s.chip);
  const roomName = useApp((s) => s.roomName);
  const round = useApp(activeRound);
  const commit = useApp((s) => s.commitCall);
  const cancel = useApp((s) => s.cancelCall);
  const openConfirm = useApp((s) => s.openConfirm);

  // "You're in" is a beat, not a screen — it clears itself.
  useEffect(() => {
    if (stage.kind !== "placed") return;
    const id = window.setTimeout(cancel, 2800);
    return () => window.clearTimeout(id);
  }, [stage, cancel]);

  if (stage.kind === "idle" || !round) return null;

  if (stage.kind === "confirm") {
    const ask = askFor(round.book, stage.side);
    const contracts = contractsFor(chip, ask);
    const mult = payoutMultiple(ask);
    return (
      <Sheet onClose={cancel} labelledBy="confirm-title">
        <div className="stack" style={{ gap: 14 }}>
          <h2 id="confirm-title" style={{ fontSize: 26 }}>
            {round.asset} {stage.side} {stage.side === "UP" ? "▲" : "▼"}
          </h2>
          <p className="dim" style={{ fontSize: 14 }}>
            Closing at {timeOfDay(round.locksAt)}, against {price(round.openingPrice)}.
            {roomName ? ` Playing in ${roomName}.` : ""}
          </p>

          <dl className="stack" style={{ gap: 8 }}>
            <Line term="Chip" value={usd(chip)} />
            <Line term="Price per contract" value={ask ? `${Math.round(ask * 100)}¢` : "—"} />
            <Line term="Contracts" value={contracts ? contracts.toFixed(2) : "—"} />
            <Line
              term="Max win"
              value={contracts ? `${usd(contracts)}${mult ? ` (${mult.toFixed(2)}×)` : ""}` : "—"}
              strong
            />
            <Line term="Max loss" value={usd(chip)} strong />
          </dl>

          <div className="row" style={{ gap: 10 }}>
            <Btn tone="ghost" onClick={cancel} style={{ flex: 1 }}>
              Back
            </Btn>
            <Btn
              tone="gold"
              onClick={() => void commit()}
              style={{ flex: 2 }}
              autoFocus
            >
              Call it
            </Btn>
          </div>
        </div>
      </Sheet>
    );
  }

  if (stage.kind === "pending") {
    return (
      <Sheet onClose={() => undefined} labelledBy="pending-title">
        <div className="stack center" style={{ gap: 14, justifyItems: "center" }}>
          <Mascot mood="watching" size={80} />
          <h2 id="pending-title" style={{ fontSize: 24 }}>
            Sending your call…
          </h2>
          <Spinner label={`${round.asset} ${stage.side}, $${chip}`} />
          <p className="tiny dim">
            {mode === "demo"
              ? "No pop-ups — this is play money."
              : `Confirm it in your wallet. Your first call also approves ${STAKE_SYMBOL}.`}
          </p>
        </div>
      </Sheet>
    );
  }

  if (stage.kind === "placed") {
    const { receipt } = stage;
    return (
      <Sheet onClose={cancel} labelledBy="placed-title">
        <div className="stack center pop-in" style={{ gap: 12, justifyItems: "center" }}>
          <Mascot mood="win" size={84} />
          <h2 id="placed-title" style={{ fontSize: 28 }}>
            You're in.
          </h2>
          <p style={{ fontSize: 17 }}>
            {round.asset} <strong>{receipt.side}</strong> {receipt.side === "UP" ? "▲" : "▼"} ·{" "}
            <span className="num">{usd(receipt.spent)}</span> →{" "}
            <span className="num">{usd(receipt.maxWin)}</span> if it lands.
          </p>
          <Btn tone="gold" block onClick={cancel}>
            Nice
          </Btn>
        </div>
      </Sheet>
    );
  }

  if (stage.kind === "missed") {
    return (
      <Sheet onClose={cancel} labelledBy="missed-title">
        <div className="stack center" style={{ gap: 12, justifyItems: "center" }}>
          <Mascot mood="void" size={78} />
          <h2 id="missed-title" style={{ fontSize: 24 }}>
            Just missed
          </h2>
          <p className="dim" style={{ fontSize: 15 }}>
            The book moved before your call landed. <strong>Nothing was charged.</strong>
          </p>
          <div className="row" style={{ gap: 10, width: "100%" }}>
            <Btn tone="ghost" onClick={cancel} style={{ flex: 1 }}>
              Leave it
            </Btn>
            <Btn tone="gold" onClick={() => openConfirm(stage.side)} style={{ flex: 1 }}>
              Try again
            </Btn>
          </div>
        </div>
      </Sheet>
    );
  }

  const needsFunds = /top up|not enough|gas/i.test(`${stage.message} ${stage.hint ?? ""}`);
  return (
    <Sheet onClose={cancel} labelledBy="error-title">
      <div className="stack center" style={{ gap: 12, justifyItems: "center" }}>
        <Mascot mood="lose" size={78} />
        <h2 id="error-title" style={{ fontSize: 24 }}>
          {stage.message}
        </h2>
        {stage.hint && (
          <p className="dim" style={{ fontSize: 14 }}>
            {stage.hint}
          </p>
        )}
        <div className="row" style={{ gap: 10, width: "100%" }}>
          <Btn tone="ghost" onClick={cancel} style={{ flex: 1 }}>
            Close
          </Btn>
          {needsFunds && (
            <Btn
              tone="gold"
              style={{ flex: 1 }}
              onClick={() => {
                cancel();
                onFund();
              }}
            >
              Top up
            </Btn>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Line({ term, value, strong }: { term: string; value: string; strong?: boolean }) {
  return (
    <div className="row-between" style={{ fontSize: strong ? 16 : 14 }}>
      <dt className="dim">{term}</dt>
      <dd className="num" style={{ fontWeight: strong ? 700 : 600 }}>
        {value}
      </dd>
    </div>
  );
}
