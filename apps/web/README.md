# apps/web — the Called It PWA

The player-facing app: a 15-minute tap game on DreamDEX event contracts. Built
to [`SPEC.md`](SPEC.md), styled as a **cartoon** — sticker shapes, fat ink
outlines, hard drop shadows, one coin with a face.

```bash
npm run dev -w web        # http://localhost:5173 — runs in demo mode, no backend needed
npm run build -w web
npm run start -w web      # preview the production build on :4173
npm run typecheck -w web
```

## Two modes

`NEXT_PUBLIC_MODE` decides what the app is talking to. Both go through one
`Gateway` interface (`src/lib/gateway.ts`), so no screen knows the difference.

| | |
|---|---|
| **`demo`** (default) | A local round engine (`src/lib/demo.ts`) deals rounds on wall-clock boundaries, walks a price, quotes both sides, settles on the close and keeps the streak — all on play money in `localStorage`. No backend, no chain, no funding. This is what you get by running `npm run dev -w web` with nothing else switched on. |
| **`live`** | REST + WS against `apps/backend` (`src/lib/live.ts`), calls signed in the player's **connected wallet** (injected EIP-1193 — MetaMask, OKX, Rabby; `src/lib/wallet.ts`) and broadcast on chain through `@called-it/chain` (`src/lib/chain.ts`). Connecting a wallet is also offered in demo mode, where it only sets your leaderboard identity. |

Demo mode takes three deliberate liberties, all visible on screen as **DEMO**: a
1-minute practice window (real venues start at 5m) so a round settles while you
watch, a few house players on the leaderboard, and roughly 1 round in 25 voided
so the refund path is reachable.

### Going live

```bash
cp .env.example .env
# NEXT_PUBLIC_MODE=live
# NEXT_PUBLIC_API_URL=http://localhost:8787
npm run backend:dev      # in the repo root, first
npm run dev -w web
```

Vite is configured with `envPrefix: ["VITE_", "NEXT_PUBLIC_"]`, so the variable
names in SPEC §1 work unchanged.

**What has actually been run against live testnet** (2026-09-02): login →
JWT, `rounds/current` (real BTC 5m/15m/1h/4h/1d windows with books), `rounds/history`,
`price/:asset`, `players/:address`, the WS, and the chip gating on an empty
wallet. **The write path has not**: `placeCall` and `claim` still need a connected
wallet holding tUSDC and STT on Somnia. The connect flow itself (EIP-1193
`eth_requestAccounts` + network switch + `personal_sign` login) is verified in a
browser against a mock provider; a real wallet against a live backend is still owed.

## SPEC §3 — the open question, answered (partly)

> Does `@somnia-chain/markets-sdk` bundle and run in a browser?

**It bundles.** `vite build` resolves the whole SDK into a ~382 kB dynamic chunk
(`chain-*.js`) with no externalised node builtins and no polyfill shims. What is
still unproven is the *runtime* half — signing and broadcasting a real call from
a connected wallet in a real browser. The SDK takes the injected `WalletClient`
(`SomniaMarketsConfig` accepts `walletClient`) and routes each write through
`writeContract`, so the player confirms every call plus a one-time tUSDC approve.

The write path is loaded with a dynamic `import()` so that if it ever does break,
the failure lands on the "Call it" button as one sentence, not on boot as a white
screen. If it has to come out entirely, build with `CHAIN_IN_BROWSER=0` — the
alias swaps in `src/lib/chain-stub.ts`, reads keep working, and writes say so out
loud. Fallbacks A (Web Worker) and B (backend broadcasts a signed intent) are
then still open.

## Layout

```
src/
  lib/
    gateway.ts    the one interface the screens talk to
    demo.ts       the local round engine (demo mode)
    live.ts       REST + WS client (live mode)
    chain.ts      wallet-signed writes via @called-it/chain — lazily imported
    chain-stub.ts what chain.ts becomes under CHAIN_IN_BROWSER=0
    wallet.ts     injected-wallet connect / restore / network switch, login
                    signature, balances
    store.ts      zustand: prefs, rounds, profile, call stage, results
    format.ts     money, clocks, odds — one place, so they never disagree
  components/     the sticker kit, round card, call flow, result, wallet, share card
  screens/        onboarding · play · streak · squad · ranks
  styles/         tokens.css (the palette) + app.css (the components)
```

## The live price line

Under the line to beat, the round card shows **now $77,940 · +$37 ▲** — where
the underlying actually is against the price this round resolves on. It comes
from `GET /v1/price/:asset` (added to `apps/backend` for this; SPEC §9), which
wraps `livePrice()` in `@called-it/chain` over the SDK's `fetchPrice`, cached 3s.

It is decoration, never truth: settlement reads the oracle's opening and closing
answers, not this. So the whole path fails to `null` — an unconfigured feed, a
quiet oracle, a dead request — and the line simply isn't drawn. The endpoint
returns 200 with `price: null` rather than an error for the same reason. Polling
is every 5s and stops while the tab is backgrounded.

Direction is carried by the sign and the ▲/▼, not by colour alone, and a move
under a cent reads "level" instead of "+$0.00".

## The UP / DOWN button

`.btn-call` in `styles/app.css` — the two biggest stickers on the screen, side
by side: a 4px ink border, a hard 8px offset shadow, a 26px radius, the arrow,
the word and what it pays.

**The stretch.** On hover or keyboard focus the word pulls itself apart —
`letter-spacing` 0.06em → 0.3em — while the whole sticker peels up off the card
(`translate(-3px, -3px)`) and its shadow grows underneath it (8px → 11px). The
arrow leans the way it points, up on UP and down on DOWN. All of it on one
curve, `cubic-bezier(.22, 1, .36, 1)` over 0.4s. Pressing snaps the sticker back
down into its own shadow in 0.09s, so the press stays crisp even though the
stretch is slow. Pure CSS — no script, no library.

Two details that keep the stretch from costing anything:

- The trailing letter-space is cancelled by an equal negative `margin-right`, so
  the word stays optically centred as it opens instead of drifting left.
- "DOWN" fully open is 97px and the pair only gets 98px of content width on a
  320px phone, so under 360px the stretch eases to 0.2em rather than clip.

Colour stays where it was: `--up` and `--down` fills with `#14100f` text. The
arrow and the word always travel together, so direction never rests on colour
alone, and `prefers-reduced-motion` drops the lift and the arrow nudge and
leaves the tracking as a plain state change.

## Design notes

The look is **milk-carton cartoon**: a flat cream ground, sticker cards in fat
ink outlines with hard offset shadows, one coin with a face. No scene behind the
glass, no gradients, no texture — just a solid, confident colour and the ink.

- **One light scheme, chosen not defaulted.** Cream ground `#f7efdd`, off-white
  card surfaces, near-black ink. Every fill either sits ON that ink border (a
  plain card) or gets its own — `--gold`, `--up`, `--down` — with the ink
  outline drawn back on top, so nothing ever looks unbordered.
- **Type is Fredoka for display, Archivo for body,** IBM Plex Mono with tabular
  figures for every number — countdowns, odds, dollars and streaks all sit
  still while they change.
- **Colour is semantic where it counts.** Green is UP, red is DOWN, grey is
  void — never decorative, and always paired with ▲/▼ *and* the word, so colour
  is never the only signal. Gold is the warm accent (chips, the streak, the
  countdown ticket); sky blue is the cool one (links, the active tab).
- **One celebration.** A win gets a single confetti burst and a flame that grows
  by one. Everything, including the mascot's idle blink/wobble and the hero
  lockup's gentle sign-wobble, obeys `prefers-reduced-motion`.

### The shell — one page, nothing below the fold

`html`/`body` do not scroll. `.shell` (`App.tsx`) is a `100dvh` flex column with
four fixed regions — a top bar (brand + wallet), the **Play · Streak · Squad ·
Ranks** tab bar, the stage, and a footer strip that is always in view.
`.game-box-content` — the card the active tab renders into — keeps
`overflow-y: auto` as a safety net for extreme zoom or font-size settings, but
it isn't the normal path: **all four tabs are sized to fit it outright**,
verified at 390×844 (0px of overflow, footer included) and still within a few
px of it at 375×667, an SE-class phone, via a `@media (max-height: 720px)` tier
that trims chrome padding, drops the settled-round strip, and hides the footer
recap — never anything a player needs to place or track a call.

Two techniques do most of the work, because the alternative — shrinking type
until an unbounded list fits — doesn't scale:

- **Cap what can grow.** A badge grid is always six; a call history or a
  leaderboard is not. `Streak` shows the 3 most recent calls and 2 open
  positions with a one-line "and N more" note instead of the rest; `Squad` and
  `Ranks` both show a leaderboard's **top N plus your own row** if you fell
  outside it (`topAndYou` in `Squad.tsx`, inlined in `Ranks.tsx`) — bounded at
  6-7 rows regardless of whether the real leaderboard has 7 entries or 25.
- **Trade a tile grid for a strip.** The badge grid used to be 2 rows of
  aspect-ratio tiles (~240px tall) with a label and a blurb line each; it's now
  one row of six icon medallions (`.badges`, horizontal-scrolling like the
  settled strip and the interval selector) — same six badges, same full label
  on hover/long-press via `title`, a fraction of the height. The wallet card's
  handle/telegram/wallet rows became `.mini-tiles`, three compact buttons in a
  row instead of three stacked labelled rows.

### The wordmark

Every plain-text "Called It" — the top bar, the boot screen, the onboarding
splash, the desktop hero panel — is now the actual logo (`src/assets/logo.png`,
a comic-burst "CALLED IT" with a rocket, supplied by the user), rendered
through `components/Wordmark.tsx` rather than four separate `<img>` tags.

It idles on the same slow `sign-wobble` a hanging sign gets elsewhere in the
app, lifts and lists a couple of degrees on hover, and squashes down into its
own drop-shadow on press — the sticker language applied to the one sticker
that's artwork instead of CSS. `prefers-reduced-motion` stops the idle wobble
and the hover lift, same as everything else.

`Wordmark` renders two ways depending on whether it does anything:

- **With `onClick`** (the top bar, which sends you back to Play) — a real
  `<button>`, focusable, with an `aria-label` naming what it does.
- **Without it** (onboarding, the boot screen, the desktop hero panel, which is
  already `aria-hidden`) — a plain `role="img"` element with no tab stop, so
  the brand mark never becomes a keyboard dead end that looks clickable but
  isn't.

A visually-hidden `<h1>Called It</h1>` sits next to it on the boot screen and
onboarding splash, so removing the text heading in favour of the image didn't
also remove the page's heading structure for a screen reader.

### Responsive: one card, three widths

`.stage` is a flex row that centres the game box and, once there is genuinely
room beside it, adds a decorative **`.hero`** — the big cartoon "CALLED IT"
lockup, the mascot, and a one-line tagline — filling what would otherwise be
empty gutter.

| | width | what's showing |
|---|---|---|
| **mobile** | < 700px | box only, full width, tab bar wraps to a 4-up grid |
| **tablet** | 700–859px | wider tab bar, box still alone (no room for the hero yet) |
| **desktop** | ≥ 860px | hero appears beside the box; ≥ 1100px both get more room |

The hero is `aria-hidden` and out of the tab order — it repeats the brand
that's already functionally present in the top bar, purely for the wide-screen
gutter.

### One nested-layout bug worth knowing about

`.screen` (what each tab renders) is `display: grid` one column wide. Nested
three deep inside a flex chain — `.stage` → `.game-box` → `.game-box-content` —
an *implicit* grid column sizes to its content's **unwrapped** max-content
width rather than the box it's actually sitting in, so a long heading (the round
card's "Will BTC be up or down at…") blew the card out sideways instead of
wrapping. Fixed with an explicit `grid-template-columns: minmax(0, 1fr)` on
`.screen` plus `min-width: 0` on the flex children in that chain — the standard
fix for grid/flex items that own the size of their own text.

## Known gaps

- **Telegram linking** (SPEC §8) is a stub — the button explains that the notify
  bot lands in Phase 4. The profile already reads `telegramLinked`.
- **OG image endpoint / web push** — not started, not blocking. Share cards are
  drawn client-side on canvas.
- **Your rank outside the top 25** shows as a note rather than a number, pending
  `rank` on the player payload.
- Icons are SVG (`public/icon.svg`, `public/icon-maskable.svg`). Add PNG
  fallbacks if you need older Android home screens.
