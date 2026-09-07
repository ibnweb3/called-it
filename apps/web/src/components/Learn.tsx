// "How it works" + FAQ for the game — collapsed by default, no JS.

import type { ReactNode } from "react";

const STEPS: Array<[string, string]> = [
  ["1 · Pick a window", "BTC or ETH, and how long — 15 minutes is the classic. A fresh window opens on a rolling schedule; you're calling where the price lands when it closes vs. where it opened."],
  ["2 · Tap UP or DOWN", "One tap places your bet on chain. Green means up, red means down — always with the arrow and the word, never colour alone."],
  ["3 · Wait it out", "The countdown runs. Line up a streak, pull in your squad, watch the book."],
  ["4 · Get paid", "Call it right and the payout lands in your wallet when the window settles. Call it wrong and you lose the one chip you staked — never more."],
];

const QA: Array<[string, string]> = [
  ["Who am I betting against?", "The house — and the house is Housepool, a vault anyone can deposit into. The quote you hit is put up by a bot trading the pool's money. There's no casino on the other side; it's other people's liquidity."],
  ["How much can I lose?", "Exactly the chip you stake on a call, and nothing beyond it. There's no leverage, no liquidation, no negative balance. Fast up/down betting is close to gambling — play with money you'd be fine losing, and take breaks."],
  ["Is this real money?", "On testnet it's play money (tUSDC) that mints itself from a faucet. The flow, the chain, the settlement are all real — only the token isn't."],
  ["Do I need a wallet?", "To play for real, yes — an injected wallet (MetaMask, OKX, Rabby) on Somnia. The app never holds your key; every call is signed in your wallet. Demo mode runs with no wallet at all."],
  ["What's \"onchain proof\"?", "Every call is a transaction. Your wins, your streak, your record — all verifiable on Somnia, not a number on our server."],
  ["Can I be the house instead?", "Yes — that's the \"Own the house\" side. Deposit into Housepool and you earn (or eat) the spread the bot makes across every window, instead of betting on any single one."],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="learn">
      <summary>{title}</summary>
      <div className="learn-body">{children}</div>
    </details>
  );
}

export function Learn() {
  return (
    <div className="learn-wrap">
      <Section title="How it works">
        {STEPS.map(([h, body]) => (
          <div key={h} className="learn-step">
            <div className="learn-step-h">{h}</div>
            <p>{body}</p>
          </div>
        ))}
      </Section>
      <Section title="FAQ">
        {QA.map(([q, a]) => (
          <details key={q} className="faq-q">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </Section>
    </div>
  );
}
