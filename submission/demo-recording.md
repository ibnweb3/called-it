# Called It — demo recording pack

Two things here:

1. **Voiceover script** — paste into any TTS (ElevenLabs, OpenAI, Play.ht…). ~2:55 at a normal pace.
2. **Webapp walkthrough** — exactly what to click, segment by segment, synced to the script.

Live state verified 2026-09-10: vault `0x10D2Dd3864Eb090Eb89599795c59de228C528DDf`
holds **150 tUSDC**, share price **1.000000**, no open session. Bot wallet has
**3.75 STT** gas. Owner wallet `0x8BE860…8113` has **0.20 STT + ~11,387 tUSDC**.

> If you run the bot a few times before recording, each settle nudges the share
> price. Check the dashboard's real number right before you record and the script
> still fits — it says "about 150" and "right around one-to-one".

---

## 1 · Voiceover script (TTS)

Plain text, one paragraph per segment. No stage directions in here — record it
straight through, or clip by clip. If your TTS mispronounces **tUSDC**, find-and-
replace it with **test USDC**.

---

**[SEG 1 — the game]**

Called It is a fifteen minute guessing game about Bitcoin's price. Every quarter hour there's a new round, with one question. Will Bitcoin be higher or lower fifteen minutes from now? You tap up or down, put down a chip, and wait it out. Guess right and you get your chip back plus a bit more. Guess wrong and the chip is gone. That's the whole game. One tap.

**[SEG 2 — the house]**

Every bet needs someone on the other side. Someone to pay the winners and keep the losers' chips. That someone is the house. Normally the house is one big company, it keeps all the profit, and you can only ever be a player. On Called It, the house is a vault that anyone can put money into. We call it Housepool.

**[SEG 3 — the vault, and joining it]**

Here's the pool right now. About a hundred and fifty tUSDC, on Somnia's Shannon testnet, with the share price sitting right around one to one. It's a real on chain vault, and here it is on the block explorer. Joining takes one transaction. I deposit a hundred tUSDC, and I get shares in the pool. My money is now part of the house's float.

**[SEG 4 — the bot and the curve]**

A bot does the actual work. It borrows from the pool and quotes both sides of every rolling Bitcoin window, from the first second. Watch the terminal. It just borrowed the float from the vault, and now it's posting live quotes. And they are not fifty fifty. The curve leans the price toward where Bitcoin is right now, versus where the window opened. And as the clock runs down it pulls its size in and widens the spread, because that's exactly when a short dated option's risk explodes. Fourteen unit tests, pure math, no chain calls.

**[SEG 5 — the share price moves]**

Now I stop the bot. It settles everything back into the vault, works out the profit or loss for that session, and pays ten percent of any profit into a prize pool. Back on the dashboard. The share price has moved, and there's a new row in the session history. Up on a good session, down on a bad one. This is real money, genuinely at risk.

**[SEG 6 — withdraw]**

And I can leave whenever I want. Withdrawals always come out of the un lent half of the vault, so they can never be frozen or paused. I withdraw, and the tUSDC comes straight back to my wallet.

**[SEG 7 — why it matters]**

So the game always has a house, which means it always works, with a real price on every market from second one. And the most profitable seat in betting becomes something you join with a deposit, instead of a company you have to be. The vault's rules are on chain. The operator can never move the money anywhere but back to the people who own it. Next up. A hedge for the house's leftover exposure, the venue's maker rewards on mainnet, and session keys so a player signs once instead of every tap. The repo and both apps are linked in the description. That's Called It. A game, and a house you can own.

---

**Full script, no markers** (for a single TTS pass):

> Called It is a fifteen minute guessing game about Bitcoin's price. Every quarter hour there's a new round, with one question. Will Bitcoin be higher or lower fifteen minutes from now? You tap up or down, put down a chip, and wait it out. Guess right and you get your chip back plus a bit more. Guess wrong and the chip is gone. That's the whole game. One tap.
>
> Every bet needs someone on the other side. Someone to pay the winners and keep the losers' chips. That someone is the house. Normally the house is one big company, it keeps all the profit, and you can only ever be a player. On Called It, the house is a vault that anyone can put money into. We call it Housepool.
>
> Here's the pool right now. About a hundred and fifty tUSDC, on Somnia's Shannon testnet, with the share price sitting right around one to one. It's a real on chain vault, and here it is on the block explorer. Joining takes one transaction. I deposit a hundred tUSDC, and I get shares in the pool. My money is now part of the house's float.
>
> A bot does the actual work. It borrows from the pool and quotes both sides of every rolling Bitcoin window, from the first second. Watch the terminal. It just borrowed the float from the vault, and now it's posting live quotes. And they are not fifty fifty. The curve leans the price toward where Bitcoin is right now, versus where the window opened. And as the clock runs down it pulls its size in and widens the spread, because that's exactly when a short dated option's risk explodes. Fourteen unit tests, pure math, no chain calls.
>
> Now I stop the bot. It settles everything back into the vault, works out the profit or loss for that session, and pays ten percent of any profit into a prize pool. Back on the dashboard. The share price has moved, and there's a new row in the session history. Up on a good session, down on a bad one. This is real money, genuinely at risk.
>
> And I can leave whenever I want. Withdrawals always come out of the un lent half of the vault, so they can never be frozen or paused. I withdraw, and the tUSDC comes straight back to my wallet.
>
> So the game always has a house, which means it always works, with a real price on every market from second one. And the most profitable seat in betting becomes something you join with a deposit, instead of a company you have to be. The vault's rules are on chain. The operator can never move the money anywhere but back to the people who own it. Next up. A hedge for the house's leftover exposure, the venue's maker rewards on mainnet, and session keys so a player signs once instead of every tap. The repo and both apps are linked in the description. That's Called It. A game, and a house you can own.

---

## 2 · Webapp walkthrough

### Pre-flight (do this before you hit record)

1. **Wallet.** Load `0x8BE860A6ce4696BBa9eB35C64D340b7d7E698113` into MetaMask or
   OKX Wallet, network **Somnia Shannon** (chain 50312). It has 0.20 STT and
   ~11,387 tUSDC — plenty for the deposit + withdraw.
2. **Clear the risk gate once.** Open **https://calledit-somnia.pages.dev** →
   **Play** → **Connect wallet** → tick "I've read that…" → **Continue** →
   **Done, let's play**. You're in the game. Now reload — the front page shows the
   two cards again and Play reads **"Enter the game →"**. On camera it's now just
   *chooser → Play → game*, no forms.
3. **Do one full dry run of the whole thing first** (not recorded): start the bot,
   confirm it borrows + quotes, Ctrl-C it, confirm the dashboard updates and the
   session row appears. Then you know the path is clean for the real take. The
   share price will have drifted a hair — that's why the script says "about 150"
   and "right around one to one".
4. **The bot terminal, ready but not started.** Terminal at the repo root, the
   command typed but not run:
   ```bash
   npm run croupier
   ```
   `.env` already has `DRY_RUN=false` and `CROUPIER_FAIR=curve`. When you run it
   (on camera, in SEG 4) you'll see, near the top:
   ```
   … float: borrowed 74.250000 tUSDC from 0xED23B3B2… (0x…)
   … dryRun=false · fair=curve · spread=±… · size=8 · …
   ```
   then within a minute or two a real two-sided quote:
   ```
   … quote BTC-0-…/tUSDC#YES: bid 8@0.421 / ask 8@0.520  (fair 0.470, spread ±0.049)
   ```
   A `3× PostOnlyWouldCross — another maker has it, backing off` line is *normal*
   (other teams' bots hold the near windows) — narrate it as "it correctly
   declines to cross another maker" if it shows.
5. **Second terminal:** `npm test -w @called-it/curve` → leave `✓ 14 passed` on screen.
6. **Three browser tabs:** (a) the game `calledit-somnia.pages.dev`,
   (b) the dashboard `.../house`, (c) the explorer
   `https://shannon-explorer.somnia.network/address/0x10D2Dd3864Eb090Eb89599795c59de228C528DDf`
7. Notifications off. Terminal font large. Screen recorder ready.

---

### SEG 1 — the game · ~22s

| # | Do this | On screen |
|---|---|---|
| 1 | Start on the game landing page (the two cards). | The V-fan chooser, video moving behind it. |
| 2 | Click the **Play** card. | Drops into the game (demo mode — "DEMO" pill top-left). |
| 3 | On the round card, pick a chip, tap **▲ UP** (or DOWN). | Confirm → pending → the 15-min countdown. |
| 4 | Let the timer run down, or cut forward to a **result** screen. | Win/lose card. Keep this quick. |

### SEG 2 — the house · ~20s

| # | Do this | On screen |
|---|---|---|
| 5 | Switch to the **DreamDEX** venue in another tab if you have it, or just stay on the game. Optional: show a thin/empty order book on a fresh BTC window. | Empty or near-empty book — "nobody's here to take the bet". |

*(If you don't have DreamDEX open, just hold on the game screen — the VO carries this segment.)*

### SEG 3 — the vault, and joining · ~30s

| # | Do this | On screen |
|---|---|---|
| 6 | Go to the **/house** tab. | "The pool": **TOTAL POOL ~150**, **share price ~1.0**, badge "idle between sessions". |
| 7 | Flash the **explorer** tab for 2–3 seconds. | The vault contract on Shannon Explorer. |
| 8 | Back on /house, click **Connect wallet** (top right) → approve in the wallet. | Pill shows `0x8BE8…8113`. |
| 9 | In the **Deposit** card, type `100` → **Deposit** → approve **two** popups (approve tUSDC, then deposit). | ~10–20s for both txs. |
| 10 | Wait for the refresh. | **Your value ≈ $100.00**, **TOTAL POOL ≈ 250**, you now hold shares. Badge still "idle between sessions". |

### SEG 4 — the bot and the curve · ~35s

| # | Do this | On screen |
|---|---|---|
| 11 | Cut to the **bot terminal**. Run `npm run croupier`. | Boots, then `float: borrowed 74.25… tUSDC from 0xED23B3B2… (0x…)` — you see it borrow live. |
| 12 | Wait for a quote line, point at it. | `quote BTC-…: bid 8@0.42x / ask 8@0.52x (fair 0.4xx, spread ±0.0xx)` — bid and ask are **not** 0.50. |
| 13 | Quick cut to the **curve-test terminal**. | `✓ 14 passed`. |
| 14 | *(optional)* flip to **/house** for a second. | Badge now pulsing **"bot trading now"**, WITH THE BOT ≈ 74. |

### SEG 5 — the share price moves · ~22s

| # | Do this | On screen |
|---|---|---|
| 15 | In the bot terminal, press **Ctrl-C** once. | `float: settled — principal was … tUSDC (0x…)` then `croupier stopped`. Wait for it to finish. |
| 16 | Switch to **/house**, wait ~10s for the poll (or reload). | Share price is **no longer exactly 1.000000**. Badge back to "idle between sessions". |
| 17 | Scroll to **Recent bot sessions**. | A **new row** — borrowed vs returned, and the prize cut if it was a winning session. Older rows show real wins and losses. |

### SEG 6 — withdraw · ~18s

| # | Do this | On screen |
|---|---|---|
| 18 | In the **Withdraw** card, click **max** (or type your full value) → **Withdraw** → approve. | One tx. |
| 19 | Wait for the refresh. | **Your value → $0**, your wallet's tUSDC back up (≈ 100, a little over or under depending on the session). |

### SEG 7 — why it matters · ~35s

| # | Do this | On screen |
|---|---|---|
| 20 | Back to the game landing page. Optionally open **"How it works"** / **"FAQ"**. | The chooser, or the Learn panels. |
| 21 | Hold here while the closing VO plays. | End on the landing page. |

---

### If the live bot misbehaves on the night

- The dashboard **already carries real session history** — narrate those rows
  instead of forcing a fresh one. Point at a green row (a win, with a prize cut)
  and a red one (a loss). The mechanism is the same.
- `DRY_RUN=true npm run croupier` still prints real curve quotes computed off the
  live BTC price — enough to carry SEG 4 if signing is flaky.
- **Never cut** SEG 3 (deposit) and SEG 6 (withdraw) — those are the core "you
  can own the house" proof and they're rock solid.
- Worst case, record SEG 3–6 as two takes (deposit/withdraw in one, bot in
  another) and cut them together.

### One-take order if you're short on time (~2:10)

Landing → Play one round → `/house` connect + deposit 100 → bot terminal
`borrowed` + one curve quote → Ctrl-C settle → `/house` price moved + session
row → withdraw. Skip SEG 2 and the curve-tests cut.
