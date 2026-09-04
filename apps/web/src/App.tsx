import { useEffect, useState } from "react";
import { Btn } from "./components/kit";
import { Wordmark } from "./components/Wordmark";
import { CallFlow } from "./components/CallFlow";
import { ResultScreen } from "./components/ResultScreen";
import { WalletSheet } from "./components/Wallet";
import { Onboarding } from "./screens/Onboarding";
import { Play } from "./screens/Play";
import { Ranks } from "./screens/Ranks";
import { Slip } from "./screens/Slip";
import { Squad } from "./screens/Squad";
import { Streak } from "./screens/Streak";
import { IS_TESTNET, MODE, NETWORK } from "./lib/env";
import { usd } from "./lib/format";
import { unclaimed, useApp, type Tab } from "./lib/store";

const TABS: Array<{ id: Tab; icon: string; label: string }> = [
  { id: "play", icon: "🎯", label: "Play" },
  { id: "slip", icon: "🎫", label: "Slip" },
  { id: "streak", icon: "🔥", label: "Streak" },
  { id: "squad", icon: "🏠", label: "Squad" },
  { id: "ranks", icon: "🏆", label: "Ranks" },
];

export default function App() {
  const booted = useApp((s) => s.booted);
  const bootError = useApp((s) => s.bootError);
  const accepted = useApp((s) => s.accepted);
  const mode = useApp((s) => s.mode);
  const walletConnected = useApp((s) => s.walletConnected);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const online = useApp((s) => s.online);
  const profile = useApp((s) => s.profile);
  const balances = useApp((s) => s.balances);
  const runLive = useApp((s) => s.slip?.status === "live");
  const boot = useApp((s) => s.boot);
  const [wallet, setWallet] = useState(false);

  useEffect(() => {
    void boot();
  }, [boot]);

  useInviteLink();
  const install = useInstallPrompt();

  if (!booted) {
    return (
      <div className="app">
        <div className="screen center" style={{ paddingTop: "30vh" }}>
          <h1 className="sr-only">Called It</h1>
          <Wordmark size={110} />
          <p className="dim" style={{ marginTop: 10 }}>
            Dealing you in…
          </p>
        </div>
      </div>
    );
  }

  // Live mode has no "you" without a wallet — send returning players who
  // revoked access (or cleared it) back through Onboarding to reconnect.
  if (!accepted || (mode === "live" && !walletConnected)) return <Onboarding />;

  const purse = unclaimed(profile);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Wordmark size={34} onClick={() => setTab("play")} />
          {IS_TESTNET && (
            <span className="pill" title={`${NETWORK} — play money`}>
              {MODE === "demo" ? "DEMO" : "TESTNET"}
            </span>
          )}
        </div>
        <button className="pill pill-gold wallet-pill" onClick={() => setWallet(true)}>
          <span aria-hidden="true">💰</span>
          <span className="num">{usd(balances?.usd ?? null, 2)}</span>
        </button>
      </header>

      {/* Play · Streak · Squad · Ranks — the whole game lives behind these four */}
      <nav className="navbar" aria-label="Main">
        {TABS.map((t) => (
          <div key={t.id} className="slot">
            <button type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <span className="ico" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </button>
            {t.id === "streak" && purse.count > 0 && (
              <span className="dot" title={`${usd(purse.usd)} unclaimed`} />
            )}
            {t.id === "slip" && runLive && <span className="dot" title="A run is going" />}
          </div>
        ))}
      </nav>

      {!online && (
        <div className="banner toast toast-info" role="status">
          Reconnecting… your streak and open calls are safe.
        </div>
      )}

      {bootError && (
        <div className="banner toast toast-bad" role="alert">
          {bootError}
          <Btn small style={{ marginLeft: 10 }} onClick={() => void boot()}>
            Retry
          </Btn>
        </div>
      )}

      {install.show && (
        <div className="banner bubble">
          <div className="row-between">
            <span>Put Called It on your home screen?</span>
            <Btn small tone="gold" onClick={install.accept}>
              Install
            </Btn>
          </div>
        </div>
      )}

      <main className="stage">
        {/* the empty space beside the box on a wide screen — decorative, so it
            is hidden from the tab order and from assistive tech */}
        <div className="hero" aria-hidden="true">
          <Wordmark className="hero-mark" />
          <p className="hero-tag">
            Call Bitcoin up or down. One tap, fifteen minutes, and a streak worth bragging about.
          </p>
        </div>

        <div className="game-box">
          <div className="game-box-content">
            {tab === "play" && <Play onOpenSquad={() => setTab("squad")} />}
            {tab === "slip" && <Slip />}
            {tab === "streak" && <Streak walletOpen={wallet} onWallet={setWallet} />}
            {tab === "squad" && <Squad />}
            {tab === "ranks" && <Ranks />}
          </div>
        </div>
      </main>

      <footer className="footer-bar">
        <p className="tiny dim">
          {IS_TESTNET ? "Testnet — play money. " : ""}Permitted regions only. Not investment advice. You
          can lose your stake.
        </p>
      </footer>

      <CallFlow onFund={() => setWallet(true)} />
      <ResultScreen />
      {wallet && tab !== "streak" && <WalletSheet onClose={() => setWallet(false)} />}
      <Toasts />
    </div>
  );
}

function Toasts() {
  const toasts = useApp((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Opening /r/<id> drops you into that squad, then tidies the URL. */
function useInviteLink(): void {
  const gateway = useApp((s) => s.gateway);
  const setRoom = useApp((s) => s.setRoom);
  const setTab = useApp((s) => s.setTab);
  const toast = useApp((s) => s.toast);
  const booted = useApp((s) => s.booted);

  useEffect(() => {
    if (!booted) return;
    const match = /^\/r\/([A-Za-z0-9_-]{3,32})$/.exec(window.location.pathname);
    if (!match) return;
    const id = match[1];
    window.history.replaceState({}, "", "/");
    gateway
      .joinRoom(id)
      .then((room) => {
        setRoom({ id: room.id, name: room.name });
        setTab("squad");
        toast(`You're in ${room.name}`, "good");
      })
      .catch(() => toast("That invite link has gone quiet", "bad"));
  }, [booted, gateway, setRoom, setTab, toast]);
}

interface InstallEvent extends Event {
  prompt(): Promise<void>;
}

/** Offer the home-screen prompt once, after the player has actually played. */
function useInstallPrompt() {
  const profile = useApp((s) => s.profile);
  const nudged = useApp((s) => s.installNudged);
  const markNudged = useApp((s) => s.markInstallNudged);
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const played = (profile?.streak.totalCalls ?? 0) >= 1;
  return {
    show: Boolean(event) && played && !nudged,
    accept: () => {
      markNudged();
      void event?.prompt();
      setEvent(null);
    },
  };
}
