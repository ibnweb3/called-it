# Called It & Housepool — a liquidity layer for DreamDEX Event Contracts

**Hackathon:** Somnia × DreamDEX Event Contracts (DoraHacks)
**Repo:** https://github.com/ibnweb3/called-it
**Play:** https://calledit-somnia.pages.dev
**Own the house:** https://calledit-somnia.pages.dev/house
**Demo video:** _<paste link>_

---

## One-liner

**DreamDEX Event Contracts gives anyone a place to create a binary up/down
market. It doesn't give you someone to trade against. Housepool is a
permissionless vault + bot that fixes that — and Called It is the game that
proves it, live.**

---

## The problem — specific to DreamDEX Event Contracts, not prediction markets in general

DreamDEX Event Contracts is the exchange: create a binary "up or down by time
X" market, trade it, get settled by an oracle when it closes. That's the whole
job it does. It's plumbing — a place markets *can* exist. What it doesn't
supply is **someone on the other side of your order.** An exchange nobody is
quoting is an empty room with a sign on the door.

And quoting on Event Contracts specifically is brutal, in a way generic DeFi
liquidity provision isn't:

- **Markets roll over constantly.** A fresh 15-minute BTC window opens every
  15 minutes, forever. There's no "set a price once" — someone has to be there,
  re-pricing, on every single window, all day.
- **Every window has a hard, binary expiry.** The fair price doesn't drift —
  it resolves. In the closing seconds, a small move in the underlying can
  decide the whole outcome, and a market maker still quoting a lazy 50/50 gets
  run over exactly then.

That combination is why almost nobody volunteers to be the house on DreamDEX.
Not "hard in general" — hard *for this specific kind of market*. The result:
open the app, tap a fresh window, and there's nobody there. That's not a
problem with our game. **It's DreamDEX's actual bottleneck** — any team
building on top of Event Contracts hits the identical wall.

## The solution — Housepool

A vault anyone can deposit a stablecoin into, and a bot — **the Croupier** —
that borrows from it to quote **both sides of every rolling BTC/ETH window,
from the first second it opens.**

- Its pricing curve isn't a flat 50/50 — it's built for the specific risk
  shape of an event contract: leans with the market early, pulls size and
  widens the spread as expiry closes in, because that's exactly when a naive
  quote gets punished.
- Depositors own a slice of the pool and ride its real profit and loss.
- Withdrawals come from the un-lent half of the vault and are never frozen —
  no lockups, no company to ask.

**Called It is how you feel it** — a 15-minute tap game where every bet is
filled by Housepool's liquidity. The two aren't separate submissions bolted
together: they're the same trade from two directions. Called It is demand for
DreamDEX's markets; Housepool is the supply that makes those markets tradeable
at all — and it isn't wired to our game specifically. Any app built on
DreamDEX Event Contracts could plug into the same liquidity.

| You want to… | You are… | You use |
|---|---|---|
| **Play** — call the next 15 min | a player | the game PWA (`apps/web`) |
| **Own the house** — earn the edge | the house | the Housepool dashboard (`apps/vault-web`) |

---

## The clever bit: a curve that watches the clock

The Croupier never offers a flat 50/50. A 15-minute BTC bet is a **digital
option**, and its risk explodes as the clock runs down — the same $50 move
that's noise with ten minutes left can decide the whole outcome with ten
seconds left.

- **Early in the window** — Bitcoin could still go anywhere; a real move
  barely nudges the fair odds off 50/50.
- **Final seconds** — if Bitcoin is already up, it's almost certainly
  *finishing* up. A bot still quoting 50/50 here gets robbed. The curve
  shifts its price to match reality, bets smaller, and stops quoting entirely
  in the last stretch.

That timing sense is **what stops sharp players from draining the vault.**
It's the core invention — `packages/curve`, 14 unit tests, pure math, no
chain calls:

1. **Fair probability** — how far the price has moved from the window's
   opening price, versus how far it could still plausibly move before expiry,
   run through a normal CDF.
2. **Size + spread decay** — quote size shrinks and the spread widens on a
   curve as the window empties; quoting stops inside a hard cutoff near
   expiry.

The Croupier runs it as `CROUPIER_FAIR=curve`, blending the model with the
live book 70/30 when a book exists. Observed live: `bid 4.65@0.421 /
ask 4.65@0.520` around a fair of `0.470` — a real two-sided, non-50/50 quote.

## Why the vault can't run away with your money

Every rule lives on-chain, in `contracts/src/CalledItFloat.sol` (ERC-4626):

- **Withdrawals are never frozen.** They always come from the un-lent half of
  the vault, so you can always get out. (Normal case: instant, one
  transaction — borrowing is capped at 50% of the pool, so at least half is
  always idle. Rare exception: a short wait — minutes, not days — if your
  specific cash is mid-session. Absolute worst case, if the bot ever goes
  dark: anyone can force the float back after 26 hours, no permission needed.)
- **The bot can only borrow** — capped at both an absolute ceiling and half
  the vault — and **can never send funds to itself.**
- **If the bot goes dark, anyone can hit an emergency button**
  (`forceClose()`) after a deadline and return everyone's money.
- **Config changes sit behind a 24-hour timelock.**
- 20 Foundry tests + a 1000-run fuzz. **Not audited.** Testnet play money —
  but a losing session really does lower the share price. Nothing here is
  simulated.

---

## Full feature breakdown

### The game — Called It (`apps/web`)

- **Tap UP/DOWN** on rolling BTC/ETH windows (5m/15m/1h/4h/1d on the real
  venue; a 1-minute practice window in demo mode)
- **Onchain proof** — every call is a transaction, not a number on a server
- **Streak tracking** — current streak, best streak, a payout multiplier that
  climbs with it, six unlockable badges
- **Squads** — private tables with their own weekly leaderboard; a shareable
  invite link that carries the squad's real name so it opens correctly on any
  device
- **The Slip** — a compounding run: stake a call, roll the payout into the
  next one, cash out the open leg any time or ride it to the end
- **Global Ranks** — best-streak leaderboard across all players
- **Wallet required to play** — your address is your identity for the board
  and squads; a no-wallet escape hatch means a visitor without one still gets
  into the demo instead of hitting a dead end
- **A live BTC/ETH price chart** in place of a static logo — colour-coded
  against your round's own opening line, so you can see whether your call is
  winning in real time
- **A moving video backdrop** behind the whole app, tinted to the palette,
  panels kept fully opaque so nothing is ever hard to read
- **Installable PWA** with an offline app shell
- **Two runtime modes** — demo (a local round engine, play money, no wallet
  or backend needed) and live (real chain reads today; wallet-signed writes
  are wired but not yet exercised from the browser)
- **How it works + FAQ** panels, collapsible, on the landing page itself

### The house — Housepool dashboard (`apps/vault-web`)

- **Live vault reads** — total pool, share price to six decimals, idle vs.
  borrowed, a pulsing "bot trading now" badge
- **Deposit / withdraw / redeem** — real transactions from the browser, no
  backend in the loop
- **A built-in tUSDC faucet card** — mint test funds without leaving the page
- **Real session history** — every past session's P&L and prize cut, pulled
  straight from on-chain logs
- **How it works + FAQ** panels, including a plain-language breakdown of
  exactly when a withdrawal is instant vs. when it has to wait
- The same moving video backdrop and palette as the game — one visual system
  across both apps

### The vault contract (`contracts/src/CalledItFloat.sol`)

- ERC-4626 standard vault with a `_decimalsOffset(6)` inflation-attack guard
- Session-based `borrow()` / `settle()` — operator-gated, never a blank
  cheque
- An **absolute** borrow ceiling and a **ratio** ceiling (50% of the pool),
  whichever is smaller
- 10% of any profitable session's profit routed to a prize pool (hard-capped
  at 20%)
- `forceClose()` — anyone, not just the owner, can recover the float after a
  deadline if the operator goes dark
- 24-hour timelock on every config change
- 20 Foundry tests, a 1000-run fuzz suite, zero known issues — not audited

### The Croupier (`apps/croupier`)

- Borrows the vault's float on a session, quotes, settles, and re-borrows on
  a timer
- Time-aware curve pricing (above), blended with the live book
- Gas-optimised: skips a re-quote unless the price genuinely moved, backs off
  a market after repeated `PostOnlyWouldCross`, respects a daily loss kill
  switch
- Auto-recovers a stale session left open by a previous crash or restart
- **Runs unattended in the cloud** — GitHub Actions, not anyone's laptop; free
  on a public repo, no card required. Self-stops gracefully inside a 6-hour
  window (settling its session first) and a fresh run starts on the next
  cycle, so it survives indefinitely without anyone babysitting it

### The pricing curve (`packages/curve`)

- A pure-math, dependency-free model of a digital option's fair value against
  time-to-expiry
- 14 unit tests covering the boundary cases (no book, no opening price, the
  final-seconds cutoff, monotonicity)

### The backend — optional, built, not currently hosted (`apps/backend`)

- A `SOCIAL_ONLY` mode that serves wallet-signature auth, real cross-device
  squads, and a shared global leaderboard, with zero dependency on a live
  chain feed
- Ships with a tested Dockerfile and a deploy guide (Koyeb / Oracle Cloud
  Always Free / Fly.io) — currently dormant so it costs nothing and changes
  no behaviour until a host is attached

### Infrastructure

- **Cloudflare Pages** — one project, one origin: the game at `/`, Housepool
  at `/house`
- **GitHub Actions** — the Croupier's unattended cloud host (above)
- Every private key lives only in a platform's own secret store — never
  committed, never written to a file, never seen in a chat message

---

## Live on Somnia Shannon testnet (chain `50312`)

| | |
|---|---|
| **Play** | https://calledit-somnia.pages.dev |
| **Own the house** | https://calledit-somnia.pages.dev/house |
| Housepool vault (`CalledItFloat` · `HPOOL`) | [`0x10D2Dd3864Eb090Eb89599795c59de228C528DDf`](https://shannon-explorer.somnia.network/address/0x10D2Dd3864Eb090Eb89599795c59de228C528DDf) |
| Deposit token (tUSDC, 6dp) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` — public `faucet(uint256)`, mint your own |

Every vault operation — deposit, borrow, settle, prize cut, redeem — is
verified on-chain. The Croupier runs live, unattended, against the shared
testnet venue: it borrows the float, posts curve-priced two-sided quotes, and
its **session-by-session P&L** — wins, losses, and the house's cut — shows up
on the dashboard in real time.

## What's verified vs. what's owed

**Verified on testnet**

- Vault deployed — deposit / borrow / settle / prize / redeem all exercised
  on-chain
- Croupier live in the cloud — borrows the float, curve-priced two-sided
  quotes, auto-recovers a stale session, backs off contested markets, runs
  unattended on GitHub Actions
- `packages/curve` — 14 unit tests pass
- Housepool dashboard — reads live vault state, per-session P&L history,
  deposit / withdraw / redeem from the browser
- Game PWA — playable end-to-end in demo mode; live testnet **reads**
  verified through the backend (rounds, books, settlements, price feed)

**Owed**

- A player's live on-chain bet landing *from the browser* (connect-wallet
  flow is wired; the write path is unexercised)
- Perp hedge for the house's residual directional exposure (`apps/croupier` —
  math + logging first)
- NAV-over-time chart on the dashboard

## Roadmap

- **Perp hedge** — net the house's leftover BTC exposure across all open
  windows, offset it with one order on Shannon's live BTC perp market.
- **DreamDEX maker rebates** — the venue pays makers who quote tight; it's
  off on testnet, on for mainnet, and it's pure upside to the share price.
- **Session keys** (EIP-7702) — a player signs once per session, not once per
  tap.
- Mainnet.

## Stack

- **Contracts** — Solidity, Foundry, OpenZeppelin ERC-4626
  (`_decimalsOffset(6)` inflation guard)
- **Bot** — TypeScript, `@somnia-chain/markets-sdk`, forked from
  `dreamdex-bot-kit`'s `ec-maker`; viem for the vault calls; runs on GitHub
  Actions
- **Curve** — pure TypeScript, vitest
- **Dashboard** — Vite + React + viem, no SDK (talks to the vault + tUSDC
  directly)
- **Game** — Vite + React PWA, `@somnia-chain/markets-sdk`, zustand, service
  worker
- **Backend** — Node indexer + REST/WS, optional `SOCIAL_ONLY` mode, holds no
  key
- **Hosting** — Cloudflare Pages (both apps) + GitHub Actions (the bot)

## Team & license

Solo build — **ibnweb3**, with Claude Code.
MIT. Retained `dreamdex-bot-kit` code (`packages/ec-core`, the `ec-maker` fork
under `apps/croupier`) is © DreamDEX S.A., used under MIT. See `NOTICE`.
