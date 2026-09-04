import { useEffect } from "react";
import { Btn, Bubble, Label, Sheet } from "./kit";
import { FAUCET_URL } from "@/lib/env";
import { GAS_SYMBOL, STAKE_SYMBOL, watchStakeToken } from "@/lib/wallet";
import { DemoGateway } from "@/lib/demo";
import { shortAddr, usd } from "@/lib/format";
import { useApp } from "@/lib/store";

/**
 * The play wallet (SPEC §4/§5.5). In live mode it's a thin view onto the wallet
 * the player connected — address, balances, a faucet link, disconnect. Calls are
 * signed in that wallet, not here. In demo mode the same drawer manages play
 * money, so there is one place to look either way.
 */
export function WalletSheet({ onClose }: { onClose: () => void }) {
  const mode = useApp((s) => s.mode);
  const address = useApp((s) => s.address);
  const balances = useApp((s) => s.balances);
  const walletConnected = useApp((s) => s.walletConnected);
  const refreshBalances = useApp((s) => s.refreshBalances);
  const connectWallet = useApp((s) => s.connectWallet);
  const disconnectWallet = useApp((s) => s.disconnectWallet);
  const gateway = useApp((s) => s.gateway);
  const toast = useApp((s) => s.toast);

  const demo = mode === "demo";

  useEffect(() => {
    if (demo && !walletConnected) return;
    const id = window.setInterval(() => void refreshBalances(), 8000);
    return () => window.clearInterval(id);
  }, [demo, walletConnected, refreshBalances]);

  return (
    <Sheet onClose={onClose} labelledBy="wallet-title">
      <div className="stack" style={{ gap: 16 }}>
        <h2 id="wallet-title" style={{ fontSize: 26 }}>
          {demo ? "Play wallet" : "Your wallet"}
        </h2>

        <div className="row" style={{ gap: 10 }}>
          <Money label={demo ? "play money" : STAKE_SYMBOL} value={usd(balances?.usd ?? null)} />
          <Money
            label={demo ? "gas" : GAS_SYMBOL}
            value={demo ? "free" : (balances?.gas ?? 0).toFixed(4)}
          />
        </div>

        {demo ? (
          <>
            <Bubble tone="warn">
              <strong>Demo mode.</strong> This is a local round engine with play money — no chain, no
              backend, nothing at stake. Point the app at a backend with
              <code> NEXT_PUBLIC_MODE=live</code> to play for real.
            </Bubble>

            <Btn
              tone="gold"
              block
              onClick={() => {
                (gateway as DemoGateway).topUp(25);
                void refreshBalances();
                toast("Added $25 of play money", "good");
              }}
            >
              Add $25 play money
            </Btn>

            {walletConnected ? (
              <div className="row-between" style={{ fontSize: 14 }}>
                <span className="dim">
                  Playing as <span className="num">{shortAddr(address)}</span>
                </span>
                <Btn small tone="ghost" onClick={() => void disconnectWallet()}>
                  Disconnect
                </Btn>
              </div>
            ) : (
              <Btn small onClick={() => connectWallet().catch(() => undefined)}>
                Connect a wallet
              </Btn>
            )}
          </>
        ) : (
          <>
            <div>
              <Label>connected address</Label>
              <div className="mono-addr" style={{ marginTop: 6 }}>
                {address || "—"}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <Btn
                  small
                  onClick={() => {
                    if (!address) return;
                    void navigator.clipboard?.writeText(address);
                    toast("Address copied", "info");
                  }}
                >
                  Copy
                </Btn>
                <a className="btn btn-sm btn-sky" href={FAUCET_URL} target="_blank" rel="noreferrer">
                  Faucet ↗
                </a>
                <Btn
                  small
                  onClick={() => {
                    void watchStakeToken().catch(() => undefined);
                  }}
                >
                  Add {STAKE_SYMBOL}
                </Btn>
              </div>
            </div>

            <Bubble tone="warn">
              Every call is signed in your wallet. The first call also asks you to approve{" "}
              <strong>{STAKE_SYMBOL}</strong> for the market — two prompts that once, one after.
            </Bubble>

            <Btn tone="ghost" block onClick={() => void disconnectWallet()}>
              Disconnect wallet
            </Btn>
          </>
        )}

        {demo && (
          <Btn
            tone="ghost"
            block
            onClick={() => {
              if (!confirm("Wipe the demo and start over? Your play streak is gone.")) return;
              (gateway as DemoGateway).reset();
              localStorage.removeItem("calledit.jwt");
              location.reload();
            }}
          >
            Reset the demo
          </Btn>
        )}
      </div>
    </Sheet>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="sticker flat grow" style={{ padding: 12 }}>
      <div className="label">{label}</div>
      <div className="num" style={{ fontSize: 22 }}>
        {value}
      </div>
    </div>
  );
}
