# Called It

A 15-minute tap game on DreamDEX Event Contracts: call BTC/ETH up or down over a
fixed window, play your friends, get paid when you're right. A bot (**the
Croupier**) keeps a game running every round so a player never sees an empty
market.

This repo is a **fork of [`somnia-chain/dreamdex-bot-kit`](https://github.com/somnia-chain/dreamdex-bot-kit)**.
The kit's `packages/`, `strategies/` and `docs/` are upstream and mostly
untouched; Called It lives in new workspaces:

```
packages/ec-core/     upstream — the event-contract SDK wrapper we build on
packages/chain/       NEW  @called-it/chain — typed "rounds / calls / chips" API (Node + browser)
apps/croupier/        NEW  the market-maker bot (fork of ec-maker)
contracts/            NEW  Foundry — CalledItFloat.sol (the Float vault), 20 tests
apps/backend/         NEW  indexer + REST/WS API + Telegram notifier (the merge layer)
apps/web/             NEW  the player PWA — Vite + React, cartoon styling, demo mode built in
apps/telegram/        (Phase 4) grammY command bot
```

Full concept: [`../called-it-spec.md`](../called-it-spec.md).

## Decisions (locked)

| | |
|---|---|
| Network | **Testnet first** (Somnia Shannon, chain 50312). Mainnet is Phase 5. |
| Player wallet (v1) | **Connect an injected wallet** (EIP-1193 — MetaMask, OKX, Rabby). The player funds their own wallet from the faucet; every call is signed there, on Somnia; the app holds no key and the backend never holds keys. _(Superseded the browser-burner design 2026-09-02 — "connect only, injected only".)_ WalletConnect and EIP-7702 session keys are v2. |
| Repo | Fork of dreamdex-bot-kit, Called It as new workspaces. |

## Build status

- [x] **Phase 0** scaffold — repo forked, `apps/*` workspace wired, installs + typechecks
- [ ] **Phase 0** ground truth — run `ec:doctor` + `ec-maker` on live testnet, record venue facts (see below)
- [x] **Phase 0** ground truth — `@called-it/chain` verified live against testnet via the backend indexer (see findings below). `ec:doctor` / browser-SDK / croupier dry-run still owed.
- [x] **Phase 1.1** `@called-it/chain` — `currentRounds` / `placeCall` / `positions` / `settledRounds` / `claim`. **Reads verified live** (rounds, books, settlements, results). `placeCall` / `claim` still need a funded burner to exercise.
- [x] **Phase 1.2** `apps/croupier` — ec-maker fork with fair-value control + daily-loss kill switch (typechecks; **dry-run not yet verified**)
- [x] **Phase 1.3** `CalledItFloat.sol` + 20 Foundry tests (all pass, 1000-run fuzz clean). **Not deployed, not audited.**
- [ ] **Phase 1.4** wire Croupier ↔ Float — implement `apps/croupier/src/float.ts` against the deployed vault (`borrow` on start, `settle` on shutdown/pause)
- [x] **Phase 2** `apps/backend` — indexer + REST/WS API + Telegram notifier. **Boots and serves live testnet data** (`/v1/rounds/current` returns real BTC/ETH windows, `/v1/rounds/history` returns graded results). Not deployed.
- [x] **Phase 3** web — `apps/web`, a Vite + React PWA built to [`apps/web/SPEC.md`](apps/web/SPEC.md) in a **cartoon** style (sticker shapes, ink outlines, one coin with a face). Onboarding, Play, confirm/pending/result, streak + badges, squads, ranks, share cards, wallet drawer. Ships a **demo mode** (local round engine, play money, no backend) as the default so it runs standalone; `NEXT_PUBLIC_MODE=live` points it at the backend + chain. Typechecks and builds. Live **reads** verified against testnet through the backend (login→JWT, rounds, history, price, profile, WS); live **writes** (`placeCall` / `claim`) still need a funded wallet on Somnia.
- [x] **Phase 3.1** wallet — replaced the browser-burner with a **connect-an-injected-wallet** flow (`apps/web/src/lib/wallet.ts`): EIP-1193 `eth_requestAccounts` + Somnia network add/switch, viem `WalletClient` handed to the markets SDK for `writeContract`-signed calls, `personal_sign` login against the backend, silent reconnect, disconnect. Demo mode gained an optional "connect a wallet" (identity only, still play money). `@called-it/chain`'s `createClient` now takes `walletClient` / `account` too. Typechecks + builds (both `CHAIN_IN_BROWSER` modes); demo flow verified end-to-end in a browser with a mock provider. **Live-mode connect (real wallet + backend) still unexercised.**
- [ ] **Phase 4** telegram (commands) · **Phase 5** merge + mainnet

## Run

```bash
npm install                       # from repo root — builds upstream core too

# repo-root .env (copy .env.example): set at least
#   NETWORK=testnet
#   VENUE_ID=0x...            (verify against a live market row — these move)
#   PRIVATE_KEY=0x...         (a funded testnet key; needs STT gas + it faucets tUSDC)

npm run croupier                  # DRY_RUN defaults to true — logs quotes it would place
DRY_RUN=false npm run croupier    # live two-sided quoting on BTC 15m
```

### Backend

```bash
cp apps/backend/.env.example apps/backend/.env   # set JWT_SECRET
npm run backend:dev                              # http://localhost:8787
curl 'http://localhost:8787/v1/rounds/current?asset=BTC'
```

`@called-it/chain` has no runnable entrypoint of its own — the backend is how you
exercise it. See [`apps/backend/README.md`](apps/backend/README.md).

### Contracts (the Float vault)

```bash
cd contracts && forge test        # 20 tests — needs Foundry (already installed at ~/.foundry/bin)
npm run contracts:test            # same, from repo root
```

See [`contracts/README.md`](contracts/README.md). Deploy with
`contracts/script/Deploy.s.sol` once a testnet deployer + croupier wallet exist.

## Phase 0 — ground truth

Verified against live testnet (2026-09-01) by running the backend indexer:

| | finding |
|---|---|
| Venue id | Bundled testnet default `0x679795…8a28c` **works** — no override needed (yet; they move). |
| Windows | Testnet runs **5m, 15m, 1h, 4h, 24h** up/down windows for **both BTC and ETH** (10 live rounds at once). Mainnet app shows 15m + 1h. |
| Up/down symbol | `BTC-0-01SEP26-1100-0050/tUSDC#YES` — `-0-` = strike 0 (up/down), `/tUSDC` collateral suffix, `#YES` outcome. `m.outcomes[0].symbol` is the tradable UP symbol; `fetchOrderBook` takes it. |
| **Oracle price scale** | **Integer cents** (2-dp fixed point): BTC `7812055` → `$78,120.55`, ETH `246075` → `$2,460.75`. Consistent across assets. `@called-it/chain` now divides by `ORACLE_PRICE_DIVISOR = 100`. |
| Settlement | `getMarketResolution` returns `openingAnswer.numericValue` / `closingAnswer.numericValue` (same cents scale). `winningOutcome === 0` ⇒ UP. Verified: close < open ⇒ DOWN. |
| `currentRounds` latency | ~2.3s cold (loadMarkets + per-round onchain + book + opening price); 3s memo cache in the API softens it. Pre-populating from the indexer is a later optimization. |

| Browser bundle | `@somnia-chain/markets-sdk` **does bundle for a browser** — `vite build` in `apps/web` resolves it into a 376 kB dynamic chunk with no externalised node builtins. The *runtime* half (signing + broadcasting a call from a funded burner in a real browser) is still unproven. |
| Price feed | The SDK's bundled testnet feed (`price-feed.dev.oracle.somnia.host`) is now in the testnet preset's `priceFeedUrl`, so `livePrice()` / `GET /v1/price/:asset` work without config. Verified live: BTC `77583.75`, ETH `2421.31`. **Mainnet has no bundled endpoint** — `livePrice()` returns null there until one is supplied. |

Still owed: `npm run ec:doctor`; a burner-signed call actually landing from the
browser; croupier dry-run soak.

## Not financial advice, not audited

Educational tooling. Testnet first. Any strategy or parameters can lose money.
See [`DISCLAIMER.md`](DISCLAIMER.md).
