# Called It — demo video shot list

**Target: 3 minutes** (hard max 4). Screen recording + voiceover.
The arc: *here's the game → here's the problem it hides → here's the house you
can own → watch the money move → withdraw.*

---

## Before you record — checklist

1. **STT gas** — faucet the bot wallet `0x31Fd1429eC6280BdaC1338221444167911549Fc1`
   to **≥ 2 STT** from https://testnet.somnia.network.
   Check:
   ```bash
   cast balance 0x31Fd1429eC6280BdaC1338221444167911549Fc1 --rpc-url https://api.infra.testnet.somnia.network
   ```
2. **Vault reads clean** — open `/house`; it should show share price `1.000000`,
   ~150 tUSDC, badge "idle between sessions". If an earlier run drifted it, don't
   fight it — just narrate the real number on camera.
3. **A funded browser wallet** — MetaMask / OKX on Somnia Shannon, ~50 tUSDC
   (mint: call `tUSDC.faucet(50000000)`) and a little STT — for the deposit shot.
4. *(optional, for a live fill)* a **second** wallet with tUSDC + STT to take the
   Croupier's quote.
5. **Terminal** at the repo root, font size bumped, `.env` set to
   `DRY_RUN=false`, `CROUPIER_FAIR=curve`,
   `CROUPIER_FLOAT=0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262`.
6. Notifications off. One clean browser window. Explorer open in a tab:
   https://shannon-explorer.somnia.network/address/0xED23B3B28bECB8AF4dA4928e91E89B86E2B7e262
7. Dry-run the whole thing once without recording.

---

## The 8 beats

### 1 · The hook — 0:00–0:20
- **Screen:** the landing page (the Play / Own-the-house chooser).
- **VO:** "Called It is a 15-minute prediction game — tap up or down on the next
  quarter hour of Bitcoin. But the interesting half is the *other* side of the
  bet: the house. On Called It, the house is a vault anyone can own."

### 2 · The problem — 0:20–0:40
- **Screen:** DreamDEX, a fresh 15-minute BTC window with a thin / empty book.
- **VO:** "Every prediction market needs someone quoting both sides from second
  one. On DreamDEX that means running a trading bot on your own wallet — so
  almost nobody does, and new markets open empty. Housepool turns being the house
  into something you just deposit into."

### 3 · Play a round — 0:40–1:10
- **Screen:** click **Play** → the game (demo mode). Tap **UP**. Show
  confirm → pending → the window ticking (speed this up) → result.
- **VO:** "As a player it's one tap. That's an onchain YES contract, and the
  quote you just hit was the house's. This is demo mode — play money, local
  engine — the live version signs that call on Somnia in your own wallet."

### 4 · The house, live — 1:10–1:35
- **Screen:** navigate to `/house`. The dashboard: your value, total pool, share
  price `1.000000`, "idle between sessions".
- **VO:** "This is Housepool, reading the live vault. 150 tUSDC in the pool, share
  price one-to-one, bot idle. Real ERC-4626 — here it is on the explorer." *(flash
  the explorer tab)*

### 5 · Deposit — 1:35–1:55
- **Screen:** connect wallet → **Deposit** card → approve → deposit **25 tUSDC** →
  shares + "your value" appear.
- **VO:** "I deposit 25 tUSDC, I get shares. My money is now part of the house's
  float."

### 6 · The Croupier borrows + quotes — 1:55–2:30
- **Screen:** terminal — `npm run croupier`. Point at:
  - `borrowed ~75 tUSDC from 0xED23B3B2…`
  - `curve BTC-… fair 0.47 → bid 4.65@0.421 / ask 4.65@0.520`
  - a `PostOnlyWouldCross … backing off` line, if one shows
- **VO:** "Start the bot. It borrows the float — capped at half the pool — and
  quotes every rolling BTC window. Not 50/50: the curve leans the price toward
  where BTC is *now* versus where the window opened, and it cuts size and widens
  the spread as expiry approaches — because that's when a digital option's risk
  explodes."
- **Screen:** quick cut to `npm test -w @called-it/curve` → **14 passing**.

### 7 · A fill moves the share price — 2:30–2:50
- **Screen:** a natural fill in the log, *or* take the quote from the second
  wallet. Then **Ctrl+C** the bot → `settled — returned … vs principal …`.
- **Screen:** back to `/house` — share price is no longer exactly `1.0`, and a new
  row appears in Recent Sessions with the P&L and the prize cut.
- **VO:** "Someone takes the other side. Stop the bot and it settles back to the
  vault, realizes the P&L, pays ten percent of any profit to the prize pool. The
  share price moves — up on a good session, down on a bad one. This one went
  [read the real number]."

### 8 · Withdraw + what's next — 2:50–3:10
- **Screen:** **Withdraw** card → redeem → tUSDC back in the wallet.
- **VO:** "Withdraw whenever — always against the idle half, never blocked. Next:
  a perp hedge for the house's leftover exposure, the venue's maker rebates on
  mainnet, and session keys so a player signs once per session, not once per tap.
  Repo and both apps are in the description. That's Called It — a game, and a
  house you can own."

---

## Must-get vs. nice-to-get

**Must** (the video fails without these):
- the chooser landing page
- one played round
- the dashboard reading real vault state
- terminal: `borrowed …` + one non-50/50 curve quote line
- dashboard share price changing + a new session row after a settle

**Nice:**
- the empty-book "problem" shot on DreamDEX
- curve tests passing
- a live fill from a second wallet (vs. just the spread-cost settle)
- the explorer tab

---

## If the live bot misbehaves on the day

The shared testnet venue is contested and the RPC has flaky spells. Fallbacks,
in order:

1. The dashboard **already carries real session history** from earlier runs
   (`+8.86` with `0.89` prize; `−0.89` spread-cost). Narrate those rows instead of
   forcing a fresh fill.
2. `DRY_RUN=true` still prints real curve quotes computed off the live price —
   enough to carry beat 6 if signing is failing.
3. Beats **5 (deposit)** and **8 (withdraw)** are rock-solid and are the core
   "you can own the house" claim — never cut those.
4. Worst case, record beats 4–8 as two takes (deposit/withdraw in one, bot in
   another) and cut them together.

---

## One-take fallback ordering (if you're short on time)

Landing → Play one round → `/house` deposit → terminal `borrowed` + curve quote →
Ctrl+C settle → `/house` price moved + session row → withdraw. Skip beats 2 and
the curve-tests cut. ~2:20.
