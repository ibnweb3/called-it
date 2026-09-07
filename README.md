# Called It

**A 15-minute prediction game where the house is a vault anyone can own.**

Tap **UP** or **DOWN** on the next 15 minutes of BTC or ETH. Wait out the window.
Get paid when you're right.

Every bet you make is filled by **Housepool** — a community liquidity vault.
Deposit a stablecoin, and a bot (**the Croupier**) uses the pooled money to quote
both sides of every rolling window from the first second. Whatever the house
makes on the spread — or loses — moves your share price. Withdraw anytime.

Built on [DreamDEX Event Contracts](https://dreamdex.somnia.network) (Somnia
Shannon testnet, chain `50312`).

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

A player tapping **UP** is buying a YES contract — and the resting quote they hit
is the Croupier's, funded by Housepool. The two sides of Called It are the two
sides of the same trade:

| You want to… | You are… | You use |
|---|---|---|
| **Play** — call the next 15 min | a bettor | the game PWA (`apps/web`) |
| **Own the house** — earn the spread | a liquidity provider | the Housepool dashboard (`apps/vault-web`) |

---

## Live on testnet

| | |
|---|---|
| Network | Somnia Shannon testnet — chain `50312` |
| Housepool vault (`CalledItFloat` · "HPOOL") | [`0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262`](https://shannon-explorer.somnia.network/address/0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262) |
| Deposit token (tUSDC) | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` — public `faucet(uint256)`, mint your own |
| Housepool dashboard | _Cloudflare Pages — link in the BUIDL submission_ |
| Game PWA | _Cloudflare Pages — link in the BUIDL submission_ |

The vault contract is deployed and every operation — deposit, borrow, settle,
prize cut, redeem — is verified on-chain. The Croupier has run live against the
shared testnet venue: it borrows the float, posts real two-sided
non-50/50 quotes, and its session-by-session P&L (wins, losses, and the house's
cut) shows up on the dashboard.

---

## The core idea: a time-aware fair-value curve

A BTC up/down contract is a digital option, and a digital option's risk explodes
as expiry approaches — the same $50 move that's noise with ten minutes left can
fully decide the outcome with ten seconds left. A flat 50/50 quote either donates
money late in the window or is too timid early in it.

`packages/curve` is the fix (14 unit tests, no chain calls):

1. **Fair probability** — how far has the price moved from the window's opening
   price, relative to how far it could still plausibly move before expiry? That
   ratio through a normal CDF is the fair probability of UP. Early in a window a
   real move barely nudges the fair price off 0.50; late in a window the same
   move swings it hard toward 0 or 1, because the outcome is nearly decided.
2. **Size + spread decay** — quote size shrinks and the spread widens on a curve
   as the window empties, and quoting stops entirely inside a hard cutoff near
   expiry — so the house quotes *least* exactly where a flat quoter gets run over.

The Croupier runs this as its `CROUPIER_FAIR=curve` mode, blending the model with
the live book (70/30) when a book exists.

---

## How Housepool works (the vault)

`contracts/src/CalledItFloat.sol` — an ERC-4626 vault, one trading session at a
time.

- **`totalAssets = idle tUSDC + borrowed`** (principal out with the Croupier).
- **Deposit / withdraw** — anyone; withdrawals are *never* paused and always come
  from idle, so a holder can always exit against the un-lent half.
- **`borrow(amount)`** — only the `operator` (the bot key), capped at both an
  absolute ceiling and a fraction of TVL (50%). Opens a session.
- **`settle()`** — sweeps the Croupier wallet back into the vault, realizes P&L,
  pays a cut of any profit (10%, capped at 20%) to a prize pool.
- **`forceClose()`** — anyone, after a deadline, if the bot goes dark. The float
  can always be recovered.
- **Config changes** sit behind a 24-hour timelock. The operator can never move
  funds to itself.

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
