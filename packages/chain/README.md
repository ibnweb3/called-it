# @called-it/chain

The one import surface for Called It. Wraps `@somnia-chain/markets-sdk` and
speaks the game's vocabulary — **rounds**, **calls**, **chips**, **streaks** —
instead of binary markets and order books.

Environment-agnostic: no `fs`, no `dotenv`, no `process.env`. Runs in Node (the
backend and the croupier) and in the browser (burner-wallet bets).

## Use

```ts
import { createClient, resolveConfig, currentRounds, placeCall, positions } from "@called-it/chain";

// read-only client
const ro = createClient(resolveConfig("testnet"));
const rounds = await currentRounds(ro, "BTC");

// trading client (backend passes the player's burner key; the browser its own)
const client = createClient(resolveConfig("testnet"), { privateKey: burnerKey });
const receipt = await placeCall(client, { round: rounds[0], side: "UP", chipUsd: 5 });
//   → { contracts, spent, avgPrice, maxWin, txHash, missed }

const mine = await positions(client, client.address!);
```

## Surface

| Function | What it does |
|---|---|
| `resolveConfig(network, overrides?)` | Network preset. Override `venueId` when it moves. |
| `createClient(config, { privateKey? })` | Build the client. No key = read-only. |
| `currentRounds(client, asset?)` | Live up/down windows, on-chain status, book, countdown. |
| `roundById(client, marketId)` | One live round. |
| `placeCall(client, { round, side, chipUsd })` | Cross the book IOC for one side. Never rests. |
| `positions(client, address)` | Open + recently settled positions, with `claimable`. |
| `settledRounds(client, { limit, asset })` | The finished-rounds feed — streaks and notifications read this. |
| `claim(client, marketId)` / `claimAll(client, scan?)` | Redeem winnings. |

## Notes / open items (resolved in Phase 0)

- **Venue IDs move.** Presets in `config.ts` are a starting point; if a call
  reports "no rounds", read the live `venueId` off a market row and pass it to
  `resolveConfig`.
- **Opening / closing price scale** is not stated on-chain. `rounds.ts` and
  `settlement.ts` return the raw numeric from `getOpeningPrices` /
  `getMarketResolution`; Phase 0 records the real magnitude on the live venue.
- **`fetchOrderBook` symbol** — `calls.ts` passes `round.symbol` (the UP outcome
  symbol). Phase 0 confirms whether the pool address or marketId also work.
- Prices are converted in **integer tick/lot units** (`quantize.ts`), not floats,
  so the 18-decimal mainnet `InvalidPrice` gotcha never applies.
