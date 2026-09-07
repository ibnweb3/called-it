import { useCallback, useEffect, useRef, useState } from "react";
import {
  connect as walletConnect,
  restore as walletRestore,
  forget as walletForget,
  hasInjectedWallet,
  STAKE_SYMBOL,
  WalletError,
  type Connection,
} from "./lib/wallet";
import { readVault, readRecentSessions, type VaultReads, type SessionRow } from "./lib/vault";
import { VAULT_ADDRESS, IS_TESTNET, FAUCET_URL } from "./lib/env";
import { shortAddr } from "./lib/fmt";
import { VaultStats } from "./components/VaultStats";
import { DepositCard } from "./components/DepositCard";
import { WithdrawCard } from "./components/WithdrawCard";
import { SessionList } from "./components/SessionList";
import { FaucetCard } from "./components/FaucetCard";

const POLL_MS = 8000;

type Toast = { kind: "good" | "bad"; text: string };

export default function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reads, setReads] = useState<VaultReads | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    setToast({ kind, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const refresh = useCallback(async () => {
    if (!VAULT_ADDRESS) return; // no vault deployed yet — the faucet card still works without one
    // Independent, so the pool stats render immediately even while the (slower,
    // block-paged) session scan is still running.
    readVault(conn?.address)
      .then(setReads)
      .catch((e) => notify("bad", (e as Error).message));
    readRecentSessions(8)
      .then(setSessions)
      .catch(() => {
        /* session history is best-effort — a slow/again RPC shouldn't blank the page */
      });
  }, [conn, notify]);

  // silent reconnect on load, then start polling regardless of connection state
  useEffect(() => {
    void walletRestore().then((c) => c && setConn(c));
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  async function onConnect() {
    setConnecting(true);
    try {
      const c = await walletConnect();
      setConn(c);
    } catch (e) {
      notify("bad", e instanceof WalletError ? e.message : "Couldn't connect");
    } finally {
      setConnecting(false);
    }
  }

  function onDisconnect() {
    walletForget();
    setConn(null);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🏠
          </span>
          <div>
            <h1>Housepool</h1>
            <div className="tag">{IS_TESTNET ? "testnet · play money" : ""}</div>
          </div>
        </div>
        {conn ? (
          <button className="wallet-pill connected" onClick={onDisconnect} title="Disconnect">
            {shortAddr(conn.address)}
          </button>
        ) : (
          <button className="wallet-pill" onClick={() => void onConnect()} disabled={connecting}>
            {connecting ? "Connecting…" : hasInjectedWallet() ? "Connect wallet" : "No wallet found"}
          </button>
        )}
      </header>

      <p className="hero-tag">
        Deposit <strong>{STAKE_SYMBOL}</strong>. A bot quotes both sides of every rolling BTC/ETH window
        on DreamDEX with the pool's money and sweeps its profit or loss back — your share of the pool
        moves with it. Withdraw anytime.
      </p>

      {IS_TESTNET && (
        <FaucetCard conn={conn} onConnect={() => void onConnect()} onDone={refresh} onNotify={notify} />
      )}

      {!VAULT_ADDRESS ? (
        <div className="card">
          <h2>Vault not deployed yet</h2>
          <p className="dim tiny">
            Once contracts/script/Deploy.s.sol has run, set VITE_VAULT_ADDRESS in apps/vault-web/.env to
            the printed address and reload — deposits, withdrawals, and the bot's session history will
            show up here.
          </p>
        </div>
      ) : (
        <>
          <VaultStats reads={reads} />
          <DepositCard conn={conn} reads={reads} onConnect={() => void onConnect()} onDone={refresh} onNotify={notify} />
          <WithdrawCard conn={conn} reads={reads} onDone={refresh} onNotify={notify} />
          <div className="card">
            <div className="card-head">
              <h2>Recent bot sessions</h2>
            </div>
            <SessionList sessions={sessions} assetDecimals={reads?.assetDecimals ?? 6} />
          </div>
        </>
      )}

      {IS_TESTNET && (
        <p className="footer">
          Testnet. Play money. <a href={FAUCET_URL} target="_blank" rel="noreferrer">Get test STT →</a>
        </p>
      )}

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
