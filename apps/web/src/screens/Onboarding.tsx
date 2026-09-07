import { useEffect, useState } from "react";
import { Btn, Bubble, Label, Sticker, Tape } from "@/components/kit";
import { IntroReel } from "@/components/IntroReel";
import { Learn } from "@/components/Learn";
import { Mascot } from "@/components/Mascot";
import { FAUCET_URL, IS_TESTNET } from "@/lib/env";
import { GAS_SYMBOL, STAKE_SYMBOL, hasInjectedWallet } from "@/lib/wallet";
import { shortAddr, usd } from "@/lib/format";
import { useApp } from "@/lib/store";

/**
 * Three cards: what this is, what it costs you, and connecting the wallet you'll
 * play from. The risk gate is not a dark pattern in reverse — it is the one
 * screen that has to be plain (SPEC §5.1).
 */
export function Onboarding({
  initialStep = 0,
  onEnter,
}: {
  /** 0 = the Play / Own-the-house chooser (the front door); 2 = wallet reconnect. */
  initialStep?: number;
  /** Called when the player has chosen to enter the game. */
  onEnter: () => void;
}) {
  const accepted = useApp((s) => s.accepted);
  const [step, setStep] = useState(initialStep);
  const [agreed, setAgreed] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const mode = useApp((s) => s.mode);
  const address = useApp((s) => s.address);
  const balances = useApp((s) => s.balances);
  const walletConnected = useApp((s) => s.walletConnected);
  const refreshBalances = useApp((s) => s.refreshBalances);
  const connectWallet = useApp((s) => s.connectWallet);
  const disconnectWallet = useApp((s) => s.disconnectWallet);
  const accept = useApp((s) => s.accept);

  useEffect(() => {
    if (step !== 2 || !walletConnected) return;
    const id = window.setInterval(() => void refreshBalances(), 5000);
    return () => window.clearInterval(id);
  }, [step, walletConnected, refreshBalances]);

  async function doConnect() {
    setConnecting(true);
    try {
      await connectWallet();
    } catch {
      /* the store raises a toast */
    } finally {
      setConnecting(false);
    }
  }

  const funded =
    mode === "demo"
      ? (balances?.usd ?? 0) > 0
      : walletConnected && (balances?.usd ?? 0) > 0 && (balances?.gas ?? 0) > 0;

  const noWallet = !hasInjectedWallet();

  return (
    <div className={`app${step === 0 ? " app-chooser" : ""}`}>
      <div className="screen" style={{ paddingTop: step === 0 ? 16 : 26, gap: 18 }}>
        {IS_TESTNET && step !== 0 && <Tape>testnet · play money</Tape>}

        {step === 0 && (
          <div className="stack center" style={{ gap: 14 }}>
            <div className="stack center" style={{ gap: 4 }}>
              <h1 className="sr-only">Called It</h1>
              <IntroReel />
              {IS_TESTNET && <p className="dim tiny">testnet · play money</p>}
            </div>
            <div className="chooser">
              <button
                type="button"
                className="chooser-card sticker"
                onClick={() => (accepted ? onEnter() : setStep(1))}
              >
                <Mascot mood="idle" size={84} />
                <h2>Play</h2>
                <p>Tap UP or DOWN on the next 15 minutes of BTC. One tap, onchain proof.</p>
                <span className="chooser-cta">{accepted ? "Enter the game →" : "Make your first call →"}</span>
              </button>
              <a className="chooser-card sticker" href="/house">
                <span className="chooser-mark" aria-hidden="true">
                  🏠
                </span>
                <h2>Own the house</h2>
                <p>Deposit {STAKE_SYMBOL}. A bot works the pool; you earn the house's edge.</p>
                <span className="chooser-cta chooser-cta-sky">Open Housepool →</span>
              </a>
            </div>
            <Learn />
          </div>
        )}

        {step === 1 && (
          <Sticker className="stack" style={{ gap: 14 }}>
            <h2 style={{ fontSize: 30 }}>Before you tap</h2>
            <ul className="stack" style={{ gap: 10, fontSize: 15 }}>
              <Point emoji="🌍">
                Available in permitted regions only. If event contracts aren't legal where you are,
                this isn't for you.
              </Point>
              <Point emoji="💸">
                Real stakes{IS_TESTNET ? " (testnet money, for now)" : ""}. Call it right and you're
                paid. Call it wrong and the chip is gone — that's the whole loss, never more.
              </Point>
              <Point emoji="🎲">
                Fast up-or-down betting is close to gambling. Play with money you'd be fine losing,
                and take breaks.
              </Point>
              <Point emoji="📉">Not investment advice. Nobody here knows where Bitcoin is going.</Point>
            </ul>

            <label className="row" style={{ gap: 10, fontSize: 15, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ width: 22, height: 22, accentColor: "#8b5cf6" }}
              />
              <span>I've read that, and I'm in a permitted region.</span>
            </label>

            <Btn tone="gold" block disabled={!agreed} onClick={() => setStep(2)}>
              Continue
            </Btn>
          </Sticker>
        )}

        {step === 2 && (
          <Sticker className="stack" style={{ gap: 14 }}>
            <div className="row-between">
              <h2 style={{ fontSize: 28 }}>
                {mode === "demo" ? "You're all set" : "Connect your wallet"}
              </h2>
              <Mascot mood={funded ? "win" : "watching"} size={54} />
            </div>

            {mode === "demo" ? (
              <>
                <Bubble tone="warn">
                  <strong>Demo mode.</strong> You've got {usd(balances?.usd ?? 50)} of play money and a
                  local round engine dealing rounds. Nothing here touches a chain.
                </Bubble>

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
                  <div className="stack" style={{ gap: 6 }}>
                    <Btn small disabled={connecting || noWallet} onClick={() => void doConnect()}>
                      {connecting ? "Check your wallet…" : "Connect a wallet — optional"}
                    </Btn>
                    <p className="tiny dim">
                      Play money either way. Connecting just puts your real address on the leaderboard.
                    </p>
                  </div>
                )}

                <p className="tiny dim">
                  Set <code>NEXT_PUBLIC_MODE=live</code> and point <code>NEXT_PUBLIC_API_URL</code> at the
                  backend to play the real thing.
                </p>
              </>
            ) : walletConnected ? (
              <>
                <p style={{ fontSize: 15 }}>
                  You're connected. Send this address a little {STAKE_SYMBOL} to stake and some{" "}
                  {GAS_SYMBOL} for gas — the faucet does both.
                </p>

                <div>
                  <Label>your wallet</Label>
                  <div className="mono-addr" style={{ marginTop: 5 }}>
                    {address}
                  </div>
                </div>

                <div className="row" style={{ gap: 10 }}>
                  <Balance label={STAKE_SYMBOL} value={usd(balances?.usd ?? 0)} ok={(balances?.usd ?? 0) > 0} />
                  <Balance
                    label={GAS_SYMBOL}
                    value={(balances?.gas ?? 0).toFixed(4)}
                    ok={(balances?.gas ?? 0) > 0}
                  />
                </div>

                <a className="btn btn-sky btn-block" href={FAUCET_URL} target="_blank" rel="noreferrer">
                  Open the faucet ↗
                </a>

                <Btn small tone="ghost" onClick={() => void disconnectWallet()}>
                  Disconnect wallet
                </Btn>
              </>
            ) : (
              <>
                <p style={{ fontSize: 15 }}>
                  Called It runs on {IS_TESTNET ? "Somnia Shannon (testnet)" : "Somnia"}. Connect a
                  wallet — we'll ask it to switch networks — and every call is signed right there, no
                  app-held key.
                </p>

                {noWallet && (
                  <Bubble tone="warn">
                    No browser wallet found. Install{" "}
                    <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                      MetaMask
                    </a>
                    ,{" "}
                    <a href="https://www.okx.com/web3" target="_blank" rel="noreferrer">
                      OKX Wallet
                    </a>{" "}
                    or{" "}
                    <a href="https://rabby.io/" target="_blank" rel="noreferrer">
                      Rabby
                    </a>
                    , then reload.
                  </Bubble>
                )}

                <Btn tone="gold" block disabled={connecting || noWallet} onClick={() => void doConnect()}>
                  {connecting ? "Check your wallet…" : "Connect wallet"}
                </Btn>
              </>
            )}

            <Btn
              tone="gold"
              block
              disabled={!funded}
              onClick={() => {
                accept();
                onEnter();
              }}
            >
              {funded
                ? "Done — let's play"
                : mode === "demo"
                  ? "One sec…"
                  : walletConnected
                    ? "Waiting for funds…"
                    : "Connect a wallet to continue"}
            </Btn>
          </Sticker>
        )}
      </div>
    </div>
  );
}

function Point({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <li className="row" style={{ gap: 10, alignItems: "flex-start" }}>
      <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1.2 }}>
        {emoji}
      </span>
      <span>{children}</span>
    </li>
  );
}

function Balance({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="sticker flat grow" style={{ padding: 12, background: ok ? "var(--up)" : "var(--surface-2)" }}>
      <div className="label" style={{ color: ok ? "#14100f" : undefined }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 20, color: ok ? "#14100f" : undefined }}>
        {value}
      </div>
    </div>
  );
}
