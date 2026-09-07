import { useState } from "react";
import type { Connection } from "../lib/wallet";
import { chainConfig, STAKE_SYMBOL } from "../lib/wallet";
import { mintTestTUSDC } from "../lib/faucet";

const DEFAULT_AMOUNT = "500";

export function FaucetCard({
  conn,
  onConnect,
  onDone,
  onNotify,
}: {
  conn: Connection | null;
  onConnect: () => void;
  onDone: () => void;
  onNotify: (kind: "good" | "bad", text: string) => void;
}) {
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [busy, setBusy] = useState(false);

  const tusdc = chainConfig.addresses.collateral;

  async function onMint() {
    if (!conn) return onConnect();
    if (!tusdc) return onNotify("bad", "No tUSDC address configured for this network");
    const n = Number(amount);
    if (!(n > 0)) return onNotify("bad", "Enter an amount to mint");

    setBusy(true);
    try {
      await mintTestTUSDC(conn.walletClient, conn.address, tusdc, amount, chainConfig.decimals);
      onNotify("good", `Minted ${amount} ${STAKE_SYMBOL} to your wallet`);
      onDone();
    } catch (e) {
      onNotify("bad", (e as Error).message.slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>Get test {STAKE_SYMBOL}</h2>
        <span className="badge off">no waiting</span>
      </div>
      <p className="tiny dim">
        {STAKE_SYMBOL} on testnet mints itself — anyone can claim it, no website or captcha. You still
        need a little STT for gas; get that from{" "}
        <a href="https://testnet.somnia.network" target="_blank" rel="noreferrer">
          the Somnia faucet
        </a>
        .
      </p>
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
      </div>
      <button className="btn ghost" onClick={() => void onMint()} disabled={busy}>
        {busy ? "Confirm in your wallet…" : conn ? `Mint ${amount || "0"} ${STAKE_SYMBOL}` : "Connect wallet"}
      </button>
    </div>
  );
}
