import type { VaultReads } from "../lib/vault";
import { usd } from "../lib/fmt";
import { STAKE_SYMBOL } from "../lib/wallet";

export function VaultStats({ reads }: { reads: VaultReads | null }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>The pool</h2>
        <span className={`badge ${reads?.sessionOpen ? "on" : "off"}`}>
          {reads?.sessionOpen && <span className="badge-dot" aria-hidden="true" />}
          {reads ? (reads.sessionOpen ? "bot trading now" : "idle between sessions") : "loading…"}
        </span>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="label">Total pool</div>
          <div className="value">{reads ? usd(reads.totalAssets, reads.assetDecimals) : "—"}</div>
        </div>
        <div className="stat">
          <div className="label">Idle</div>
          <div className="value">{reads ? usd(reads.idleAssets, reads.assetDecimals) : "—"}</div>
        </div>
        <div className="stat">
          <div className="label">With the bot</div>
          <div className="value">{reads ? usd(reads.borrowed, reads.assetDecimals) : "—"}</div>
        </div>
      </div>

      {reads && reads.yourShares > 0n && (
        <div className="stats">
          <div className="stat">
            <div className="label">Your value</div>
            <div className="value">{usd(reads.yourValue, reads.assetDecimals)}</div>
          </div>
          <div className="stat">
            <div className="label">Your {STAKE_SYMBOL} balance</div>
            <div className="value">{usd(reads.yourAssetBalance, reads.assetDecimals)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
