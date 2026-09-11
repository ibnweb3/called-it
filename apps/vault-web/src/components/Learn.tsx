// "How it works" + FAQ for Housepool — plain collapsible sections, no JS.

const STEPS: Array<[string, string]> = [
  ["1 · You deposit", "Put tUSDC in the vault and get HPOOL shares. Your share of the pool is yours — withdraw any time there's idle cash (there always is; borrowing is capped at half the pool)."],
  ["2 · The bot borrows", "Once per trading session the Croupier borrows a slice of the pool and uses it to quote both sides of every rolling BTC/ETH up/down window on DreamDEX — a real price, not a flat 50/50, tightened or widened by how much time is left."],
  ["3 · It settles back", "When the session closes, everything the bot holds is swept back into the vault and the profit or loss is realized. 10% of any profit goes to a prize pool; the rest lifts the share price."],
  ["4 · Your shares move", "Win or lose, the pool's P&L is your P&L, pro-rata. The dashboard shows every past session and where the number came from."],
];

const QA: Array<[string, string]> = [
  ["Is my money safe?", "It's testnet play money. The mechanics are real: a losing session lowers the share price, so you can lose. What can't happen — the bot operator moving funds to itself (the vault only lets it borrow and settle), or a withdrawal being blocked (they're never paused and always come from idle cash). If the bot goes dark, anyone can force-close the session after a deadline and recover the float."],
  ["Can I withdraw whenever?", "Yes, and almost always instantly. Borrowing is capped at 50% of the pool, so at least half is idle at any moment — a normal withdrawal is one transaction, no wait. The rare exception: if your specific cash happens to be out mid-session with the bot, you get everything else right away and the rest becomes withdrawable once it settles — usually a short wait, since it cycles roughly every 30 minutes. Worst case ever, if the bot goes fully dark: anyone, not just us, can force the float back after 26 hours. That's the hard ceiling."],
  ["Where does the yield come from?", "The spread. A market-maker quotes a price to buy a little below fair and sell a little above; over many fills that edge adds up. It also loses money when the market moves against its inventory — that's the risk you're taking on."],
  ["What's the prize pool?", "10% of each profitable session's profit is skimmed to a separate address (capped at 20%). On mainnet it would fund player rewards in the game; on testnet it's just a demo of the split."],
  ["What is the curve?", "The bot's pricing brain. A 15-minute up/down bet is a digital option, and its risk explodes near expiry — so the curve quotes closer to fair and in smaller size as a window empties, and stops quoting entirely in the last stretch. It's a small, unit-tested piece of math (packages/curve)."],
  ["How do I get tUSDC?", "It mints itself — click \"Get test tUSDC\" above, or call faucet(uint256) on the token. You need a little STT for gas from the Somnia faucet."],
];

export function Learn() {
  return (
    <>
      <div className="card">
        <div className="card-head"><h2>How Housepool works</h2></div>
        <div className="steps-list">
          {STEPS.map(([h, body]) => (
            <div key={h} className="step-row">
              <div className="step-h">{h}</div>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>FAQ</h2></div>
        <div className="faq-list">
          {QA.map(([q, a]) => (
            <details key={q} className="faq-item">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
