import { useEffect, useState } from "react";
import { Btn } from "./components/kit";
import { IntroReel } from "./components/IntroReel";
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
import { hasInjectedWallet } from "./lib/wallet";
import { usd } from "./lib/format";
import { PENDING_ROOM, unclaimed, useApp, type Tab } from "./lib/store";

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
  const mode = useApp((s) => s.mode);
  const accepted = useApp((s) => s.accepted);
  const walletConnected = useApp((s) => s.walletConnected);
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const online = useApp((s) => s.online);
  const profile = useApp((s) => s.profile);
  const balances = useApp((s) => s.balances);
  const runLive = useApp((s) => s.slip?.status === "live");
  const boot = useApp((s) => s.boot);
  const joinPendingRoom = useApp((s) => s.joinPendingRoom);
  const [wallet, setWallet] = useState(false);
  // The chooser (Play / Own the house) is the front door on every load, even
  // for a returning player — they leave it only by picking a side.
  const [entered, setEntered] = useState(false);

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

  // A connected wallet is required to play — in demo too: it's your identity for
  // the leaderboard and your squads. The one exception is a visitor with no
  // injected wallet at all, so a judge on plain mobile Safari isn't dead-ended
  // (Onboarding's step 2 gives them a way through); live mode still needs one.
  const needsWallet = !walletConnected && (mode === "live" || hasInjectedWallet());
  if (!entered || needsWallet) {
    const startAt = needsWallet && accepted ? 2 : 0;
    // onEnter fires from a real click, so any squad-invite join that needs a
    // wallet signature has fresh user activation to prompt against.
    const enter = () => {
      setEntered(true);
      void joinPendingRoom();
    };
    return <Onboarding initialStep={startAt} onEnter={enter} />;
  }

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
        <div className="topbar-right">
          <a className="pill" href="/house" title="Deposit and earn the house's edge">
            <span aria-hidden="true">🏦</span> House
          </a>
          <button className="pill pill-gold wallet-pill" onClick={() => setWallet(true)}>
            <span aria-hidden="true">💰</span>
            <span className="num">{usd(balances?.usd ?? null, 2)}</span>
          </button>
        </div>
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
          <IntroReel />
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

/**
 * Opening /r/<id> stashes the squad id and tidies the URL. The actual join runs
 * on entry (App's `onEnter` → `joinPendingRoom`) so it happens after the wallet
 * is connected and from a real click — a squads backend needs both to sign in.
 */
function useInviteLink(): void {
  useEffect(() => {
    const match = /^\/r\/([A-Za-z0-9_-]{3,32})$/.exec(window.location.pathname);
    if (!match) return;
    // the squad name rides in the hash (never sent to a server) so a link
    // opened on a fresh device shows the real name, not "Squad <id>"
    const name = decodeURIComponent(window.location.hash.replace(/^#/, "")).slice(0, 32) || undefined;
    try {
      sessionStorage.setItem(PENDING_ROOM, JSON.stringify({ id: match[1], name }));
    } catch {
      /* private mode — the invite just won't survive the redirect */
    }
    window.history.replaceState({}, "", "/");
  }, []);
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
