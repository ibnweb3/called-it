# Called It — web app spec

The player-facing app. A mobile-first PWA: a 15-minute tap game on DreamDEX
event contracts. Tap UP or DOWN on BTC/ETH over a fixed window, keep a streak,
play friends. A bot (the Croupier) keeps every round liquid, so the player never
sees an empty market.

This doc is written so the app can be built elsewhere (v0 / Bolt / a separate
session / a designer) and dropped back in as `apps/web` in the `called-it`
monorepo. Build against the **contracts below**, not against assumptions.

---

## 1. Platform & stack

- **Mobile-first PWA.** Installable, add-to-homescreen, works one-handed. Desktop
  is a centered narrow column, not a separate layout.
- **Framework:** Next.js (App Router) **or** Vite + React. It lands as an npm
  workspace (`apps/web`), Node 20+, so keep the dependency list lean.
- **Chain:** `viem` for the burner wallet; `@called-it/chain` (workspace package)
  for reads and for placing/claiming.
- **Data:** React Query or SWR against the backend REST API; one small client
  store (zustand or context) for the burner key + session token + selected
  asset/room.
- **Styling:** your call (Tailwind is fine). Dark-first. See the design prompt.
- **No server of its own required** for the core loop — it's a static SPA that
  talks to the backend + the chain. (Next is fine too; don't add API routes
  unless the SDK-in-browser check below fails.)

### Env vars

```
NEXT_PUBLIC_API_URL=http://localhost:8787      # the Called It backend
NEXT_PUBLIC_NETWORK=testnet                    # testnet | mainnet
NEXT_PUBLIC_FAUCET_URL=https://testnet.somnia.network/   # tUSDC + STT faucet
```

---

## 2. Backend API contract

Base URL = `NEXT_PUBLIC_API_URL`. JSON. Auth is `Authorization: Bearer <jwt>` on
the routes marked 🔒.

### Auth

`POST /v1/auth` → `{ token, address }`
```jsonc
// body — the burner signs `loginMessage(address, issuedAt)` (see §4)
{ "address": "0x…", "issuedAt": 1788259450000, "signature": "0x…" }
```
Token lasts 30 days. Store it; re-auth when a 401 comes back.

### Rounds

`GET /v1/rounds/current?asset=BTC` → `{ rounds: Round[] }`
```ts
Round = {
  marketId: string            // 0x… — the id you pass to placeCall / /v1/calls
  symbol: string              // "BTC-0-01SEP26-1100-0050/tUSDC#YES"
  asset: "BTC" | "ETH"
  intervalSec: number         // 300 | 900 | 3600 | 14400 | 86400  (testnet runs all)
  status: "listed"|"trading"|"locked"|"settling"|"resolved"|"voided"
  opensAt: number             // unix seconds
  locksAt: number             // unix seconds — the countdown target
  openingPrice: number | null // dollars, e.g. 77903.45  ("line to beat")
  upProbability: number | null// 0..1 implied by the book mid
  book: { upBid: number|null, upAsk: number|null, downBid: number|null, downAsk: number|null }
}
```

`GET /v1/rounds/history?asset=BTC&limit=20` → `{ rounds: [...] }`
```ts
{ marketId, asset, intervalSec, locksAt, result: "UP"|"DOWN"|"VOID", openingPrice, closingPrice }
```
This is the "recently settled" strip.

### Players

`GET /v1/players/:address` → public profile
```ts
{
  address, handle: string|null, telegramLinked: boolean,
  streak: { current, best, totalCalls, totalWins, winRate, netUsd, multiplier },
  badges: [{ key, label, hit: boolean }],
  recentCalls: [{ marketId, side, chipUsd, contracts, spent, outcome, payout, placedAt, roomId }],
  positions: [Position]   // live, from chain — see §3
}
```

`POST /v1/players/me/handle` 🔒 `{ handle }` → `{ ok, handle }`
`POST /v1/players/me/telegram` 🔒 `{ chatId, notifyRounds }` → `{ ok }`

`GET /v1/leaderboard?limit=25` → `{ leaderboard: [{ rank, address, handle, current, best, totalCalls, totalWins, winRate, netUsd, multiplier }] }`

### Calls

`POST /v1/calls` 🔒 → `{ ok, callId }`
```jsonc
// AFTER the burner has placed & broadcast the bet on chain (§3).
// The backend re-reads the chain and 409s if the position isn't there.
{ "marketId":"0x…", "side":"UP", "chipUsd":5, "contracts":8.9,
  "spent":5.0, "avgPrice":0.56, "txHash":"0x…", "roomId":"k7m2q9" }
```
409 `{ error: "position not found on chain", held }` — retry after the tx confirms.
409 `{ error: "round already settled" }`.

### Rooms

`POST /v1/rooms` 🔒 `{ name }` → `{ id, name }`
`POST /v1/rooms/:id/join` 🔒 → `{ ok }`
`GET /v1/rooms/:id` → `{ id, name, memberCount, weekStart, leaderboard: [{ rank, address, handle, calls, wins, net, bestStreak }] }`

### Live — `WS /v1/live`

Server → client frames (all JSON):
```ts
{ t: "hello", now }
{ t: "round", round: RoundRow }        // new or status-changed round
{ t: "locking", round: RoundRow }      // ~60s before it locks
{ t: "settled", round: RoundRow }      // resolved/voided — refresh history strip
{ t: "result", address, call, asset, roundResult, result: "won"|"lost"|"void",
  payout, streakCurrent, streakBest }  // only if you subscribed with this address
{ t: "tick", now }                     // 15s heartbeat — reconcile the countdown
{ t: "subscribed", address }
```
Client → server: `{ "subscribe": { "address": "0x…" } }` once, after connecting,
to also receive your own `result` frames.

`RoundRow` from the WS carries snake_case fields (`market_id`, `interval_sec`,
`locks_at`, `opening_price`, `closing_price`, `result`, `status`, `asset`).

---

## 3. What the browser does directly on chain

Via `@called-it/chain` with the burner key:

```ts
import { createClient, resolveConfig, placeCall, positions, claim, claimAll, CHIPS } from "@called-it/chain";

const client = createClient(resolveConfig("testnet"), { privateKey: burnerKey });

// place a call — crosses the book IOC for `chipUsd` of `side`
const receipt = await placeCall(client, { round, side: "UP", chipUsd: 5 });
// CallReceipt = { marketId, side, spent, contracts, avgPrice, maxWin, txHash, missed }
// receipt.missed === true  → nothing filled (book moved). Nothing was spent. Offer retry.

// after a win: redeem
const usd = await claim(client, marketId);        // one round
const { rounds, usd } = await claimAll(client);   // sweep recent settled

// positions (also in /v1/players/:addr, but this is authoritative + instant after a call)
const mine = await positions(client, address);
// Position = { marketId, asset, intervalSec, side, contracts, status,
//              outcome: "pending"|"won"|"lost"|"void", claimable, locksAt }
```

Flow for a call:
1. `placeCall(...)` → receipt.
2. If `receipt.missed` → tell the player, stop.
3. `POST /v1/calls` with the receipt fields (+ `roomId` if in a room).
4. If 409 "position not found" → wait ~2s, retry the POST once (indexer lag).

### ⚠️ Open question the builder must resolve first

Does `@somnia-chain/markets-sdk` (which `@called-it/chain` wraps) **bundle and
run in a browser**? It uses `viem` + `fetch` + WebSocket, which are browser-safe,
but this hasn't been confirmed. Check early. If it does **not**:

- **Fallback A:** run `@called-it/chain` writes in a Web Worker.
- **Fallback B:** the app POSTs the burner-signed intent to a thin backend route
  that broadcasts (backend still never stores the key — it receives a signed
  payload per call). This needs a small backend addition; flag it.

Everything read-only (`currentRounds`, `history`, book, streaks) already comes
from the backend REST API, so only the **write path** is at risk.

---

## 4. Burner wallet

The player never connects MetaMask. On first run the app generates a key.

- `generatePrivateKey()` (viem) → store in `localStorage` (key: `calledit.burner`).
  It holds a few dollars of testnet tUSDC + STT gas — treat it as a hot wallet,
  not a vault. Optionally encrypt with a PIN (nice-to-have).
- **Login:** sign `"Called It login\n<checksummed address>\n<issuedAt ms>"` with
  the burner, POST to `/v1/auth`, keep the JWT.
- **Fund screen:** show the burner address + a QR. The player sends **tUSDC**
  (the stake) and **STT** (gas) to it from their main wallet or the faucet
  (`NEXT_PUBLIC_FAUCET_URL`). Poll both balances (viem `getBalance` for STT,
  `readContract balanceOf` on the tUSDC address from `resolveConfig().addresses.collateral`).
- **Balances** are shown in the wallet section and gate the chip selector.
- **Export:** reveal the private key (with a "write this down / anyone with this
  controls the funds" warning).
- **Cash out:** send the full tUSDC + STT balance to an address the player types.
- **Reset:** wipe local data, generate a fresh burner (with a confirm).

---

## 5. Screens & features

### 5.1 Onboarding

- Splash: one line + "Make your first call →".
- Auto-create burner (invisible).
- **Jurisdiction + risk gate:** "Available in permitted regions only. This is a
  game with real (testnet) stakes; you can lose your stake. Not investment
  advice." Checkbox → continue. Prominent **TESTNET** badge everywhere after.
- **Fund your play wallet:** address + QR, live tUSDC / STT balances, faucet
  link, "Done — let's play" unlocks when tUSDC > 0 and STT > 0.
- Sign login → JWT.
- First call can be nudged ("start with $1").

### 5.2 Play (home) — the core screen

- **Asset toggle:** BTC / ETH.
- **Window row:** the intervals available (`15m` default, plus `5m 1h 4h 1d`).
  Selecting one swaps the round card. (Backend returns one live round per
  asset+interval.)
- **Round card:**
  - Headline: "Will BTC be **UP** or **DOWN** at 14:45?"
  - **Countdown** to `locksAt` — big, monospace, the visual hero. Drive it from
    `locksAt` corrected by the WS `tick`/`hello` `now`, not local clock alone.
  - **Line to beat:** `openingPrice` ($77,903.45). If a live underlying price is
    available (see §9), show "now $77,940 · +$37 ▲" under it.
  - **Odds:** from `upProbability` / `book`. Show both as % *and* as a payout
    multiple ("UP 56% · pays 1.79×", "DOWN 44% · pays 2.27×"). Update on WS
    `round` frames.
  - **Chip selector:** $1 / $5 / $25. Disabled chips if balance too low (link to
    fund).
  - **Preview:** "Cost $5 · Max win $8.90 · Max loss $5".
  - **UP** (green, ▲) / **DOWN** (red, ▼) — full-width, thumb-height buttons.
  - **Your position in this round** if any: "You called UP · 8.9 contracts · max
    win $8.90" + a small "add more" affordance (optional).
  - **No-liquidity state:** if `book` is empty on the chosen side — "Warming up…
    the book is thin this second" + retry. (Rare once the Croupier runs.)
- **Recently settled strip:** last ~15 rounds for this asset+interval as pills:
  green ▲ / red ▼ / grey ∅ (void). This is the streak tease — make it feel like
  a pattern you could read.
- **Solo / room indicator:** "Playing solo" or "Playing in 🏠 <RoomName>" — tap
  to switch. When a room is active, calls carry its `roomId`.
- Live: countdown ticks, odds move, strip appends on `settled`, a subtle pulse
  on `locking`.

### 5.3 Placing a call

- Tap UP/DOWN → **confirm sheet**: asset, side, chip, price, max win, max loss,
  "Call it".
- On confirm: `placeCall` (no wallet popup — burner signs silently) → **pending**
  state (spinner, "sending your call…").
- Success: `POST /v1/calls`, then a short celebratory confirmation — "You're in.
  BTC **UP**, $5 → **$8.90** if it lands." Auto-dismiss.
- `receipt.missed` → "Just missed — the book moved before your call landed.
  Nothing was charged. Try again?"
- Errors:
  - insufficient tUSDC/STT → "Top up to play" → fund screen.
  - round not `trading` / <30s left → "That window just closed — here's the next
    one" and swap the card.

### 5.4 Result & claim

- On a `result` WS frame for your address → **result screen** (full-bleed):
  - **Won:** "✅ Called it! **+$8.90**" · "BTC closed UP" · streak flame with the
    new count · tasteful confetti · **Share** · **Claim $8.90** · "Go again".
  - **Lost:** "❌ Missed. BTC closed DOWN." · "Streak reset" (show the number
    that broke) · **Go again**.
  - **Void:** "⚪️ Round voided — your $5 stake is refundable" · **Claim $5**.
- **Claim:** burner signs `claim(marketId)` → tUSDC balance updates, position
  clears. Also a **Claim all** button on the positions list that calls
  `claimAll`.
- If the player isn't on the app when a round settles, the result waits for them
  in **Positions** (and Telegram DMs them, if linked).

### 5.5 Streak / profile

- **Streak card:** current (big, flame), best, win rate, net P&L (`netUsd`),
  calls made. Multiplier badge: "5+ streak = 2× the prize pot" (from
  `streak.multiplier`).
- **Badges grid:** all six, locked/unlocked (`badges[].hit`): On a roll (3),
  Hot hand (5), Called it ×10, Regular (25 calls), Sharp (60%+ over 20), In the
  green.
- **Handle:** set / edit (`POST /v1/players/me/handle`).
- **Telegram:** "Get pinged when your calls land" → deep-link flow (§8).
- **History:** `recentCalls` as a list — asset, side, chip, outcome pill, payout,
  relative time, room tag.
- **Wallet:** burner address, tUSDC + STT balances, Deposit (QR), Export key,
  Cash out, Reset.

### 5.6 Squads / rooms

- **Create room:** name → `POST /v1/rooms` → share sheet with `.../r/<id>`.
- **Join:** opening `/r/<id>` → "Join <RoomName>?" → `POST /v1/rooms/:id/join` →
  member. Also auto-join when you place a call with that room active.
- **Room screen:** name, member count, **this week's leaderboard**
  (`GET /v1/rooms/:id`): rank, handle, calls, wins, net, best streak. "You" row
  highlighted.
- **Switch room** from the Play screen; "leave room" = just switch to solo (v1
  keeps membership).

### 5.7 Global leaderboard

- Top 25 by best streak (`GET /v1/leaderboard`). Your row highlighted (fetch
  your rank separately if outside 25 — or just show "you: #47").
- Secondary sort/toggle by `netUsd` (data is present client-side).

### 5.8 Share cards

- After a win or from the streak card: generate a shareable image.
  - v1: render client-side (canvas or an SVG → `toDataURL`) — "6/6 on BTC 15m
    today", "Streak: 8", the result. Include the app URL / a join link.
  - Web Share API (`navigator.share`) with the image; fallback = copy link +
    download image.
- Backend OG-image endpoint is a later nice-to-have (§9) — don't block on it.

### 5.9 Shell & PWA

- Bottom nav (mobile): **Play · Streak · Squad · Ranks**. (4 max.)
- `manifest.webmanifest`, maskable icons, theme color, standalone display,
  add-to-homescreen prompt after the first settled call.
- Offline: cache the shell; show "reconnecting…" when the WS/API is down; the
  countdown keeps running off `locksAt`.
- Web push (optional, later): mirrors the Telegram notifier — needs a service
  worker + VAPID + a backend push endpoint (§9).

### 5.10 Settings / legal

- Persistent **TESTNET** badge. Network name. "Play money — not real funds."
- Disclaimer / terms / permitted-regions text.
- Links: DreamDEX, the Somnia explorer for a given `marketId` (oracle graph tab),
  faucet.
- Clear data / reset burner.

---

## 6. States & edge cases to design

| State | Where | Handling |
|---|---|---|
| No burner yet | first run | auto-create, go to fund screen |
| Unfunded / low STT | play, confirm | disable chips, "Top up to play" |
| Book empty on a side | round card | "Warming up" + retry; don't let them tap into a revert |
| Round locks mid-tap | confirm/pending | "That window closed — here's the next" |
| `placeCall` missed | pending | "Book moved, nothing charged, retry" |
| `/v1/calls` 409 (indexer lag) | after placeCall | silent retry once after 2s, then surface |
| Tx pending a long time | pending | keep the spinner, offer "check later in Positions" |
| WS disconnected | everywhere | banner "reconnecting"; countdown still runs; poll REST as fallback |
| Clock skew | countdown | anchor to `locksAt` vs server `now` from `hello`/`tick` |
| Settled while away | positions / result inbox | show unclaimed results; badge the nav |
| Void | result / positions | claim at 0.5× stake |
| JWT expired | any 🔒 call | re-sign login transparently, retry |
| Multiple rounds same asset/interval | shouldn't happen | show the one with soonest `locksAt` that's `trading` |

---

## 7. Non-functional

- **Feels instant.** Optimistic UI on tap; the round screen never blocks on a
  network call to render.
- **Touch:** primary actions are thumb-reachable, ≥ 44px, generous spacing; no
  hover-only affordances.
- **Accessible:** UP/DOWN never signalled by colour alone — always ▲/▼ + the
  words. Respect `prefers-reduced-motion` (kill confetti / pulses). Live regions
  for the countdown and result.
- **Resilient:** every chain/API call can fail; nothing should white-screen.
- **Honest:** amounts always show both the win and the loss. "Testnet" is never
  more than a glance away.

---

## 8. Telegram linking flow (frontend half)

1. Profile → "Link Telegram".
2. App calls the bot deep link: `https://t.me/<bot>?start=<code>` where `<code>`
   is a short random string the app also keeps.
3. Bot (Phase 4) DMs the user, they tap a confirm, the bot hands the code +
   their `chatId` back to the app **or** the app polls
   `POST /v1/players/me/telegram { chatId }` — for v1 the simplest path: the bot
   replies with a one-time URL back into the app carrying `chatId`, the app
   calls `/v1/players/me/telegram`. Design the "waiting for Telegram…" and
   "linked ✓" states; the exact handshake finalises with Phase 4.

---

## 9. Needs backend work (don't block on these)

- **Live underlying price** for the "line to beat" delta — add
  `GET /v1/price/:asset` (backend already has SDK access to `fetchPrice`).
- **OG image endpoint** for rich share links — `GET /v1/og/streak/:address`,
  `GET /v1/og/result/:callId`.
- **Web push** — VAPID keys + `POST /v1/push/subscribe` + push on the same
  events the Telegram notifier uses.
- **Your rank when outside top 25** — `GET /v1/players/:addr` could include
  `rank`.

Ship v1 without them; leave hooks.

---

## 10. Design prompt

> Design **Called It**, a mobile-first PWA. It's a 15-minute tap game: you call
> Bitcoin (or ETH) **UP** or **DOWN** over a fixed window, and you either called
> it or you didn't. One screen, one tap, no charts, no order book. The audience
> is crypto-curious people who'd never open a trading terminal — and their group
> chat.
>
> **Feel:** a late-night arcade cabinet, not a Bloomberg terminal. Confident,
> quick, a little bit of swagger. The tension is the **countdown** and the
> **coin-flip** — lean into both. Tactile: taps land with weight, the timer
> actually ticks, a win is a small event (confetti is allowed, once, briefly).
>
> **Layout:** a single narrow column, thumb-driven. The hero of the Play screen
> is the **countdown timer** and the two big **UP / DOWN** buttons — everything
> else (odds, line to beat, chips, the settled strip) orbits them. A 4-item
> bottom nav. Nothing requires two hands or a scroll to make a call.
>
> **Type:** a characterful display face for headlines and the timer is
> monospace and prominent (numbers matter here — countdowns, odds, dollar
> amounts, streak counts all want tabular figures). Avoid Inter/Space Grotesk as
> the default. Consider Bricolage Grotesque or similar for display, a clean
> neutral sans for body, IBM Plex Mono (or similar) for every number.
>
> **Colour:** dark ground, chosen not defaulted — a near-black with a faint hue
> bias, not pure grey. **One** accent, used sparingly, for structure and
> chrome — a brass / warm-gold reads well against the dark and nods to casino
> chips. **Green and red are strictly semantic** for UP and DOWN — never
> decorative, and always paired with ▲/▼ and the words so colour isn't the only
> signal. A muted grey for void.
>
> **Motion:** the timer ticks; the round card pulses gently in the last 60
> seconds; a call confirms with a quick, satisfying transition; a win gets one
> short confetti burst and a flame that grows by one. Everything obeys
> `prefers-reduced-motion`. No ambient float, no gradient mesh.
>
> **The streak** is the emotional throughline — a flame that grows, a number
> that's scary to lose. The "recently settled" strip of ▲/▼ pills should feel
> like a pattern you're reading, a tell.
>
> **Restraint:** this is a game people open 10 times a day for 15 seconds. It
> should be legible at a glance, never busy, never shouting except when you win.
> A persistent, quiet **TESTNET** marker — honest, not alarming.
>
> Screens to cover: onboarding + fund-your-wallet, Play (BTC/ETH toggle,
> interval row, round card, chips, UP/DOWN, your position, settled strip),
> confirm sheet, pending, result (won / lost / void), streak & profile with a
> badge grid, squad room with a weekly leaderboard, global leaderboard, share
> card, wallet drawer (address/QR/balances/export/cash-out). Design the empty,
> loading, no-liquidity, insufficient-funds, offline, and JWT-expired states too.

---

## 11. Bringing it back

Drop the built app in as `apps/web` (add it to the root `package.json`
`workspaces` — already globbed as `apps/*`). It should:

- read `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_NETWORK`,
- depend on `@called-it/chain` as `"*"` (workspace),
- have `dev` / `build` / `start` / `typecheck` scripts,
- not require any change to `apps/backend` for the core loop.
