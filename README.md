# Called It

**A 15-minute Bitcoin guessing game where anyone can own the house.**

Every 15 minutes, one question: will Bitcoin's price be higher or lower than it is
right now? Tap **UP** or **DOWN**, put down a chip, wait out the window. Guess
right and you get your chip back plus a bit more. Guess wrong and it's gone —
that's the whole loss, never more.

Every bet needs someone on the other side — to pay the winners and keep the
losers' chips. That's *the house*. **Housepool** is a shared vault that lets
**anyone** be it: deposit a stablecoin, and a bot (**the Croupier**) uses the
pooled money to quote both sides of every window from the first second. What the
house makes on the edge — or loses — moves your share price. Withdraw anytime.

Built on [DreamDEX Event Contracts](https://dreamdex.somnia.network) (Somnia
Shannon testnet, chain `50312`).

---

## Why this exists

A prediction market is dead without a house. And being the house on DreamDEX
means running a trading bot around the clock on your own wallet, re-pricing every
market every few seconds — risky, thankless, and so almost nobody does it. Fresh
15-minute windows open with an empty book: you tap UP and no one's there.

Housepool turns the house into something you **join with a deposit** instead of a
company you have to *be*. Losers' stakes flow into the vault, winners are paid
from it, the house's small edge makes the vault grow over time, and every
depositor owns a share of it — redeemable whenever.

---

## The loop

```
        places a bet            quotes both sides           borrows the float
 Player ───────────────►  DreamDEX  ◄─────────────── Croupier ◄─────────────── Housepool vault
   ▲        UP / DOWN     order book      bot           market-maker    tUSDC   (ERC-4626)
   │                                                        │                      ▲
   └──────────────── paid out when the window settles ◄──────┘   P&L swept back ────┘
                                                                 → share price moves
```

A player tapping **UP** and a depositor earning the edge are the two sides of the
exact same trade — the resting quote the player hits is the Croupier's, funded by
Housepool:

| You want to… | You are… | You use |
|---|---|---|
| **Play** — call the next 15 min | a player | the game PWA (`apps/web`) |
| **Own the house** — earn the edge | the house | the Housepool dashboard (`apps/vault-web`) |

---

## Live on testnet

| | |
|---|---|
| **Play** | **https://calledit-somnia.pages.dev** |
| **Own the house** | **https://calledit-somnia.pages.dev/house** |
| Network | Somnia Shannon testnet — chain `50312` |
| Housepool vault (`CalledItFloat` · "HPOOL") | [`0x10D2Dd3864Eb090Eb89599795c59de228C528DDf`](https://shannon-explorer.somnia.network/address/0x10D2Dd3864Eb090Eb89599795c59de228C528DDf) |
| Deposit token (tUSDC) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` — public `faucet(uint256)`, mint your own |

The vault contract is deployed and every operation — deposit, borrow, settle,
prize cut, redeem — is verified on-chain. The Croupier has run live against the
shared testnet venue: it borrows the float, posts real two-sided
non-50/50 quotes, and its session-by-session P&L (wins, losses, and the house's
cut) shows up on the dashboard.

---

## The core idea: a curve that watches the clock

The Croupier never offers a flat 50/50. A 15-minute BTC bet is a **digital
option**, and its risk explodes as the clock runs down — the same $50 move that's
noise with ten minutes left can decide the whole outcome with ten seconds left.

- **Early in the window** — Bitcoin could still go anywhere; a real move barely
  nudges the fair price off 0.50.
- **Final seconds** — if Bitcoin is already up, it's almost certainly *finishing*
  up. A bot still quoting 50/50 here gets run over. The curve shifts its price to
  match, shrinks its size, and stops quoting entirely inside a hard cutoff.

That timing sense is **what stops sharp players from draining the vault**.
`packages/curve` — 14 unit tests, pure math, no chain calls:

1. **Fair probability** — how far the price has moved from the window's opening
   price, versus how far it could still plausibly move before expiry, run through
   a normal CDF.
2. **Size + spread decay** — quote size shrinks and the spread widens on a curve
   as the window empties; quoting stops inside a hard cutoff near expiry — so the
   house quotes *least* exactly where a flat quoter gets run over.

The Croupier runs this as its `CROUPIER_FAIR=curve` mode, blending the model with
the live book (70/30) when a book exists.

---

## How Housepool works (the vault)

`contracts/src/CalledItFloat.sol` — an ERC-4626 vault, one trading session at a
time. Every rule that follows is on-chain — it's built so it **can't run away
with your money**:

- **`totalAssets = idle tUSDC + borrowed`** (principal out with the Croupier).
- **Deposit / withdraw** — anyone; **withdrawals are never frozen** and always
  come from idle, so you can always exit against the un-lent half.
- **`borrow(amount)`** — only the `operator` (the bot key), capped at both an
  absolute ceiling *and* half the vault. Opens a session. **The operator can
  never move funds to itself.**
- **`settle()`** — sweeps the Croupier wallet back into the vault, realizes P&L,
  pays a cut of any profit (10%, capped at 20%) to a prize pool.
- **`forceClose()`** — **anyone can hit this emergency button** after a deadline
  if the bot goes dark. The float is always recoverable.
- **Config changes** sit behind a 24-hour timelock.

**Money is at risk.** A losing session lowers the share price. This is testnet
play money; the mechanics are real.

---

## Architecture

```
packages/ec-core/     from dreamdex-bot-kit (MIT) — event-contract helpers over @somnia-chain/markets-sdk
packages/chain/       @called-it/chain — typed "rounds / calls / chips" API (Node + browser)
packages/curve/       @called-it/curve — the time-aware fair-value model (pure math, 14 tests)
contracts/            Foundry — CalledItFloat.sol (Housepool), 20 tests + 1000-run fuzz
apps/croupier/        the Croupier — the market-maker bot (borrows the vault's float, runs the curve)
apps/vault-web/       the Housepool dashboard — deposit / withdraw / session P&L (Vite + React + viem)
apps/web/             the game PWA — tap UP/DOWN, streaks, squads (Vite + React, demo mode built in)
apps/backend/         indexer + REST/WS API for the game
```

Both front-ends are static builds and talk to the chain directly (viem for the
dashboard; `@somnia-chain/markets-sdk` for the game). No server holds a key.

---

## Run it

```bash
npm install                        # from repo root, Node ≥ 20
```

**The vault contract**

```bash
cd contracts && forge test         # 20 tests (needs Foundry)
```

**The Croupier** (reads a git-ignored repo-root `.env` — see `apps/croupier/.env.example`)

```bash
npm run croupier                   # DRY_RUN defaults to true — logs the quotes it would place
DRY_RUN=false npm run croupier      # live two-sided quoting, borrowing from the vault
```

**The Housepool dashboard**

```bash
npm run dev -w vault-web            # http://localhost:5174
# set apps/vault-web/.env: VITE_NETWORK=testnet, VITE_VAULT_ADDRESS=0xED23B3B2…
```

**The game**

```bash
npm run dev -w web                  # http://localhost:5173 — runs in demo mode (local round engine, play money) by default
```

---

## Status

**Working, verified on testnet**

- [x] Housepool vault deployed — deposit / borrow / settle / prize / redeem all verified on-chain
- [x] Croupier live — borrows the float, posts curve-priced two-sided quotes, auto-recovers stale sessions
- [x] `packages/curve` — 14 unit tests pass
- [x] Housepool dashboard — reads live vault state, per-session P&L history
- [x] Game PWA — playable end-to-end in demo mode; live-testnet reads verified through the backend

**Owed**

- [ ] A player's live on-chain bet landing from the browser (connect-wallet flow is wired; write path unexercised)
- [ ] Perp hedge for the house's residual directional exposure (`apps/croupier` — math + logging first)
- [ ] NAV-over-time chart on the dashboard

**Roadmap** — DreamDEX maker rebates (off on testnet), mainnet, session keys so a
player signs once per session instead of once per bet.

---

## License & provenance

MIT — see [`LICENSE`](LICENSE). Called It's own code (`apps/web`, `apps/backend`,
`packages/chain`, `packages/curve`, `apps/vault-web`, `contracts/`) is © the
Called It contributors. Retained dreamdex-bot-kit code (`packages/ec-core`, the
`ec-maker` fork under `apps/croupier`) is © DreamDEX S.A., used under MIT. See
[`NOTICE`](NOTICE).

Detailed build history: [`CALLED-IT.md`](CALLED-IT.md). Not audited, not financial
advice — [`DISCLAIMER.md`](DISCLAIMER.md).
