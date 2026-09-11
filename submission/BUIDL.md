# Called It — a Bitcoin guessing game where anyone can own the house

**Hackathon:** Somnia × DreamDEX Event Contracts (DoraHacks)
**Repo:** https://github.com/ibnweb3/called-it
**Play:** https://calledit-somnia.pages.dev
**Own the house:** https://calledit-somnia.pages.dev/house
**Demo video:** _<paste link>_

---

## One-liner

**Called It is a 15-minute guessing game about Bitcoin's price. Housepool is a
shared vault that lets anyone be the house that runs the game — instead of just a
player.**

---

## The game

Every 15 minutes there's a new round. One question: **will Bitcoin's price be
higher or lower 15 minutes from now?**

You tap **UP** or **DOWN**, put down a small chip, and wait out the window. Guess
right and you get your chip back plus a bit more. Guess wrong and the chip is
gone — that's the whole loss, never more. One tap, then wait.

## The problem

Every betting game needs someone sitting on the **other side of every bet** — to
pay you when you win and keep your chip when you lose. That someone is *the
house*. Two things are wrong with how that works today:

1. **The house is always one big company.** It keeps all the profit. You can only
   ever be a player, never the house.
2. **On a market like DreamDEX, being the house is a miserable job.** You have to
   run a trading bot around the clock, wired to your own wallet, that watches
   every market and re-prices it every few seconds. It's risky and thankless — so
   **almost nobody does it.**

The result: a fresh 15-minute BTC window opens, you tap UP, and **there's nobody
there to take the bet.** The game is dead because the hard seat is empty.

(And the easy half — the tap game itself — is a commodity. Several teams in this
hackathon built the same one.)

## The solution: Housepool

Instead of one company being the house, **lots of people put money into one
shared vault.**

A bot — **the Croupier** — borrows from that vault and does the miserable job for
everyone: it sits in every rolling BTC/ETH window and offers to take **both sides
of every bet, from the first second** the round opens.

- Players who **lose** → their stake flows **into** the vault.
- Players who **win** → they're paid **out** of the vault.
- The house has a small built-in edge — like a casino — so across thousands of
  bets **the vault slowly grows.**
- Everyone who deposited **owns a share** of the vault. Vault grows → your share
  is worth more. **Withdraw whenever you want**, no permission needed.

You never run a bot or learn to trade. You deposit, and **you own part of the
house.**

| You want to… | You are… | You use |
|---|---|---|
| **Play** — call the next 15 min | a player | the game PWA (`apps/web`) |
| **Own the house** — earn the edge | the house | the Housepool dashboard (`apps/vault-web`) |

A player tapping UP and a depositor earning the edge are the two sides of the
exact same trade.

## The clever bit: a curve that watches the clock

The Croupier never offers a flat 50/50. A 15-minute BTC bet is a **digital
option**, and its risk explodes as the clock runs down — the same $50 move that's
noise with ten minutes left can decide the whole outcome with ten seconds left.

- **Early in the window** — Bitcoin could still go anywhere; a real move barely
  nudges the fair odds off 50/50.
- **Final seconds** — if Bitcoin is already up, it's almost certainly *finishing*
  up. A bot still quoting 50/50 here gets robbed. The curve shifts its price to
  match reality, bets smaller, and stops quoting entirely in the last stretch.

That timing sense is **what stops sharp players from draining the vault.** It's
the core invention — `packages/curve`, 14 unit tests, pure math, no chain calls:

1. **Fair probability** — how far the price has moved from the window's opening
   price, versus how far it could still plausibly move before expiry, run through
   a normal CDF.
2. **Size + spread decay** — quote size shrinks and the spread widens on a curve
   as the window empties; quoting stops inside a hard cutoff near expiry.

The Croupier runs it as `CROUPIER_FAIR=curve`, blending the model with the live
book 70/30 when a book exists. Observed live: `bid 4.65@0.421 / ask 4.65@0.520`
around a fair of `0.470` — a real two-sided, non-50/50 quote.

## Why the vault can't run away with your money

Every rule lives on-chain, in `contracts/src/CalledItFloat.sol` (ERC-4626):

- **Withdrawals are never frozen.** They always come from the un-lent half of the
  vault, so you can always get out.
- **The bot can only borrow** — capped at both an absolute ceiling and half the
  vault — and **can never send funds to itself.**
- **If the bot goes dark, anyone can hit an emergency button** (`forceClose()`)
  after a deadline and return everyone's money.
- **Config changes sit behind a 24-hour timelock.**
- 20 Foundry tests + a 1000-run fuzz. **Not audited.** Testnet play money — but a
  losing session really does lower the share price. Nothing here is simulated.

## Why it matters

1. **The game actually works.** There's always a quote, on every market,
   instantly.
2. **Anyone can be the house.** The most profitable seat in betting — normally
   locked to big companies — becomes something you join with a deposit.
3. **Your money can't be frozen or taken.** The rules are on-chain and the
   operator is powerless over the funds.
4. **It's a building block.** Any prediction game on DreamDEX could plug into a
   vault like this instead of begging a company to be its house.

---

## Live on Somnia Shannon testnet (chain `50312`)

| | |
|---|---|
| **Play** | https://calledit-somnia.pages.dev |
| **Own the house** | https://calledit-somnia.pages.dev/house |
| Housepool vault (`CalledItFloat` · `HPOOL`) | [`0x10D2Dd3864Eb090Eb89599795c59de228C528DDf`](https://shannon-explorer.somnia.network/address/0x10D2Dd3864Eb090Eb89599795c59de228C528DDf) |
| Deposit token (tUSDC, 6dp) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` — public `faucet(uint256)`, mint your own |

Every vault operation — deposit, borrow, settle, prize cut, redeem — is verified
on-chain. The Croupier has run live against the shared testnet venue: it borrows
the float, posts curve-priced two-sided quotes, and its **session-by-session
P&L** — wins, losses, and the house's cut — shows up on the dashboard.

## What's verified vs. what's owed

**Verified on testnet**

- Vault deployed — deposit / borrow / settle / prize / redeem all exercised
  on-chain
- Croupier live — borrows the float, curve-priced two-sided quotes, auto-recovers
  a stale session, backs off contested markets, gas-optimized (~0.1–0.5 STT/hr)
- `packages/curve` — 14 unit tests pass
- Housepool dashboard — reads live vault state, per-session P&L history,
  deposit / withdraw / redeem from the browser
- Game PWA — playable end-to-end in demo mode; live testnet **reads** verified
  through the backend (rounds, books, settlements, price feed)

**Owed**

- A player's live on-chain bet landing *from the browser* (connect-wallet flow is
  wired; the write path is unexercised)
- Perp hedge for the house's residual directional exposure (`apps/croupier` —
  math + logging first)
- NAV-over-time chart on the dashboard

## Roadmap

- **Perp hedge** — net the house's leftover BTC exposure across all open windows,
  offset it with one order on Shannon's live BTC perp market.
- **DreamDEX maker rebates** — the venue pays makers who quote tight; it's off on
  testnet, on for mainnet, and it's pure upside to the share price.
- **Session keys** (EIP-7702) — a player signs once per session, not once per tap.
- Mainnet.

## Stack

- **Contracts** — Solidity, Foundry, OpenZeppelin ERC-4626 (`_decimalsOffset(6)`
  inflation guard)
- **Bot** — TypeScript, `@somnia-chain/markets-sdk`, forked from
  `dreamdex-bot-kit`'s `ec-maker`; viem for the vault calls
- **Curve** — pure TypeScript, vitest
- **Dashboard** — Vite + React + viem, no SDK (talks to the vault + tUSDC directly)
- **Game** — Vite + React PWA, `@somnia-chain/markets-sdk`, zustand, service worker
- **Backend** — Node indexer + REST/WS (game data only; holds no key)
- **Hosting** — Cloudflare Pages — one project, one origin, game at `/`, house at
  `/house`

## Team & license

Solo build — **ibnweb3**, with Claude Code.
MIT. Retained `dreamdex-bot-kit` code (`packages/ec-core`, the `ec-maker` fork
under `apps/croupier`) is © DreamDEX S.A., used under MIT. See `NOTICE`.
