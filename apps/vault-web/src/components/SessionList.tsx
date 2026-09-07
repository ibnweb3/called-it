import type { SessionRow } from "../lib/vault";
import { usd, shortAddr } from "../lib/fmt";
import { chainConfig } from "../lib/wallet";

const EXPLORER =
  chainConfig.network === "mainnet" ? "https://explorer.somnia.network" : "https://shannon-explorer.somnia.network";

export function SessionList({ sessions, assetDecimals }: { sessions: SessionRow[]; assetDecimals: number }) {
  if (sessions.length === 0) {
    return <p className="empty-note">No settled sessions yet — the bot's first run will show up here.</p>;
  }

  return (
    <div className="sessions">
      {sessions.map((s) => {
        const pnl = s.returned - s.principal;
        const up = pnl >= 0n;
        return (
          <div className="session-row" key={s.txHash}>
            <div>
              <div>
                {usd(s.principal, assetDecimals)} borrowed → {usd(s.returned, assetDecimals)} returned
              </div>
              <div className="meta">
                block {s.blockNumber.toString()} ·{" "}
                <a href={`${EXPLORER}/tx/${s.txHash}`} target="_blank" rel="noreferrer">
                  {shortAddr(s.txHash)}
                </a>
                {s.prizePaid > 0n && <> · prize {usd(s.prizePaid, assetDecimals)}</>}
              </div>
            </div>
            <div className={`pnl ${up ? "up" : "down"}`}>
              {up ? "+" : ""}
              {usd(pnl, assetDecimals)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
