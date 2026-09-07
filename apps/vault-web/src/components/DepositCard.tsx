import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import type { Connection } from "../lib/wallet";
import { STAKE_SYMBOL } from "../lib/wallet";
import type { VaultReads } from "../lib/vault";
import { approveIfNeeded, depositAssets } from "../lib/vault";

export function DepositCard({
  conn,
  reads,
  onConnect,
  onDone,
  onNotify,
}: {
  conn: Connection | null;
  reads: VaultReads | null;
  onConnect: () => void;
  onDone: () => void;
  onNotify: (kind: "good" | "bad", text: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const decimals = reads?.assetDecimals ?? 6;
  const maxHuman = reads ? formatUnits(reads.yourAssetBalance, decimals) : "0";

  async function onDeposit() {
    if (!conn) return onConnect();
    if (!reads) return;
    const n = Number(amount);
    if (!(n > 0)) return onNotify("bad", "Enter an amount to deposit");

    setBusy(true);
    try {
      const raw = parseUnits(amount, decimals);
      if (raw > reads.yourAssetBalance) throw new Error(`You only have ${maxHuman} ${STAKE_SYMBOL}`);

      await approveIfNeeded(conn.walletClient, conn.address, reads.assetAddress, reads.yourAllowance, raw);
      await depositAssets(conn.walletClient, conn.address, amount, decimals);

      onNotify("good", `Deposited ${amount} ${STAKE_SYMBOL}`);
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
      <h2>Deposit</h2>
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
        {conn && (
          <button className="field-max" onClick={() => setAmount(maxHuman)} disabled={busy}>
            Max
          </button>
        )}
      </div>
      <button className="btn" onClick={() => void onDeposit()} disabled={busy}>
        {busy ? "Confirm in your wallet…" : conn ? `Deposit ${STAKE_SYMBOL}` : "Connect wallet"}
      </button>
      <p className="tiny dim">Play money either way. Shares track the pool's own profit and loss.</p>
    </div>
  );
}
