# Croupier

The bot that keeps a Called It game running every round. A two-sided post-only
maker on DreamDEX event contracts, quoting a fresh window within seconds of it
opening so a player never sees an empty market.

Forked from `@dreamdex-bot-kit/ec-core`'s `ec-maker`. Called It adds fair-value
control, a daily-loss kill switch, and (Phase 1.4) Float funding.

## Run

```bash
# 1. repo root: cp .env.example .env  — set NETWORK=testnet, VENUE_ID, PRIVATE_KEY
# 2. install once from repo root:  npm install
# 3. dry run (no key needed) — watch it reason about live books:
DRY_RUN=true npm run croupier
# 4. live:
DRY_RUN=false npm run croupier
```

## How it stays safe

- **POST-ONLY** — a quote that would cross is rejected, never takes the spread.
- Gates on the **authoritative on-chain status**, not the lagging indexer.
- **mint-a-pair** seeding so the sell side is collateralised.
- **Net-inventory cap** — past `CROUPIER_MAX_INVENTORY` it quotes only the unwinding side.
- **Daily-loss kill switch** (`CROUPIER_MAX_DAY_LOSS`) — pauses, pulls all quotes, alerts.
- Cancels tracked + swept orders on shutdown.

## Fair value

| `CROUPIER_FAIR` | Anchor | Needs |
|---|---|---|
| `flat` (default) | `0.50` | nothing |
| `drift` | `0.50 + k · r` (clamped to `[LO, HI]`), `r` = underlying return over ~60s | a price feed (bundled on testnet; `PRICE_FEED_URL` on mainnet) |

Either way the anchor is pulled toward the book mid when both sides are quoted.
Swap `fairUp()` in [`src/fair-value.ts`](src/fair-value.ts) for a real model to
earn the spread instead of donating it.

## Knobs

See [`.env.example`](.env.example). DreamDEX config (network, venue, key,
tick/lot, auto-claim) comes from the **repo-root** `.env`.

## Not financial advice, not audited

Educational tooling. Any parameters can lose money, including total loss. Test on
testnet first.
