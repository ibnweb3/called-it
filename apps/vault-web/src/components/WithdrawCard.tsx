import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import type { Connection } from "../lib/wallet";
import { STAKE_SYMBOL } from "../lib/wallet";
import type { VaultReads } from "../lib/vault";
import { redeemAll, withdrawAssets } from "../lib/vault";

export function WithdrawCard({
  conn,
  reads,
  onDone,
  onNotify,
}: {
  conn: Connection | null;
  reads: VaultReads | null;
  onDone: () => void;
  onNotify: (kind: "good" | "bad", text: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  if (!conn || !reads || reads.yourShares === 0n) return null;

  const decimals = reads.assetDecimals;
  const maxHuman = formatUnits(reads.yourMaxWithdraw, decimals);
  const capped = reads.yourMaxWithdraw < reads.yourValue; // session open — only idle is withdrawable

  async function onWithdrawAll() {
    if (!conn || !reads) return;
    setBusy(true);
    try {
      await redeemAll(conn.walletClient, conn.address, reads.yourMaxRedeem);
      onNotify("good", "Withdrew your full balance");
      onDone();
    } catch (e) {
      onNotify("bad", (e as Error).message.slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  async function onWithdrawSome() {
    if (!conn || !reads) return;
    const n = Number(amount);
    if (!(n > 0)) return onNotify("bad", "Enter an amount to withdraw");
    setBusy(true);
    try {
      const raw = parseUnits(amount, decimals);
      if (raw > reads.yourMaxWithdraw) throw new Error(`You can withdraw up to ${maxHuman} ${STAKE_SYMBOL} right now`);
      await withdrawAssets(conn.walletClient, conn.address, amount, decimals);
      onNotify("good", `Withdrew ${amount} ${STAKE_SYMBOL}`);
      setAmount("");
      onDone();
    } catch (e) {
      onNotify("bad", (e as Error).message.slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Withdraw</h2>

      <div className="field-row">
        <input
          className="field"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder={`Amount in ${STAKE_SYMBOL}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
        <button className="field-max" onClick={() => setAmount(maxHuman)} disabled={busy}>
          Max
        </button>
      </div>
      <button className="btn ghost" onClick={() => void onWithdrawSome()} disabled={busy}>
        {busy ? "Confirm in your wallet…" : "Withdraw amount"}
      </button>
      <button className="btn down" onClick={() => void onWithdrawAll()} disabled={busy}>
        {busy ? "Confirm in your wallet…" : "Withdraw everything"}
      </button>

      {capped && (
        <p className="tiny dim">
          The bot is trading right now, so only the pool's idle {STAKE_SYMBOL} is withdrawable this
          moment (up to {maxHuman}). The rest is free again once the bot settles.
        </p>
      )}
    </div>
  );
}
