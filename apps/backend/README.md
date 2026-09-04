# Called It — backend

The merge layer. Wraps `@called-it/chain` (read-only), indexes rounds and
settlements into SQLite, serves REST + WebSocket to the web app and the Telegram
bot, tracks streaks, and (optionally) sends Telegram DMs.

The backend **never holds keys**. Burner wallets sign and broadcast bets in the
browser; this service verifies the resulting on-chain position before recording
a call.

```bash
cp .env.example .env      # set JWT_SECRET at least
npm run dev -w backend    # http://localhost:8787
```

Node 22.5+ (uses the built-in `node:sqlite` — no native build). The SQLite file
is a rebuildable cache; the chain is the source of truth, so losing it just means
the indexer re-derives.

## API

| Method | Path | Auth | |
|---|---|---|---|
| GET | `/health` | | network / venue |
| POST | `/v1/auth` | | `{address, issuedAt, signature}` → `{token}` (burner signs `loginMessage`) |
| GET | `/v1/rounds/current?asset=BTC` | | live windows + book + countdown |
| GET | `/v1/rounds/history?asset=BTC&limit=20` | | settled UP/DOWN strip |
| GET | `/v1/price/:asset` | | live underlying, for the "now $77,940 · +$37 ▲" line. `{asset, price, at}`, `price: null` (still 200) when the feed is quiet |
| GET | `/v1/players/:address` | | streak, badges, recent calls, live positions |
| POST | `/v1/players/me/handle` | Bearer | set display name |
| POST | `/v1/players/me/telegram` | Bearer | link a Telegram chat |
| GET | `/v1/leaderboard?limit=25` | | best-streak leaderboard |
| POST | `/v1/calls` | Bearer | record a bet (verifies the position on chain) |
| POST | `/v1/rooms` | Bearer | create a squad room |
| POST | `/v1/rooms/:id/join` | Bearer | join |
| GET | `/v1/rooms/:id` | | room + weekly leaderboard |
| WS | `/v1/live` | | round / locking / settled / result frames |

## What it does NOT do (yet)

- **Place bets.** The browser does that with the burner key (`@called-it/chain`).
- **Claim winnings.** Also the browser. Server-side auto-claim is gated on the
  EIP-7702 upgrade (Phase 5).
- **Telegram commands.** Phase 4. Only outbound DMs here, and only if
  `TELEGRAM_BOT_TOKEN` is set.

## Deploy (Railway)

Set the env vars, mount a volume for `DATABASE_PATH`, start command `npm start -w backend`.
