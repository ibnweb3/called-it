// Placing a call. The player taps UP or DOWN with a chip ($1 / $5 / $25); this
// crosses the resting book (IOC) to turn that chip into contracts on that side.
//
// Everything hard about it is in the gotchas:
//   - gate on the AUTHORITATIVE on-chain status, never the indexer
//   - never hand the SDK a float price on an 18-decimal venue — convert in tick
//     units as integers and send through the raw trader tier
//   - a reverted write does not throw (assertTxOk)
//   - an unfilled limit remainder rests with escrow locked — so this takes (IOC)
//     and never rests

import { ORDER_TYPE, type BinarySide } from "@somnia-chain/markets-sdk";
import { assertTxOk, type CalledItClient } from "./client.js";
import { clampProbability, toSteps } from "./quantize.js";
import type { CallReceipt, MarketId, Round, Side } from "./types.js";

export interface PlaceCallArgs {
  /** The round to bet on — pass the object from `currentRounds()`. */
  round: Pick<Round, "marketId" | "symbol">;
  side: Side;
  /** Chips to spend, in USDso. */
  chipUsd: number;
  /** How far past the touch to price the cross, so a shifting book still fills. bps. */
  crossBps?: number;
  /** Minimum seconds of window left to accept the call. Default 30. */
  minLeftSec?: number;
}

const SIDE_TO_BINARY: Record<Side, BinarySide> = { UP: "BUY_YES", DOWN: "BUY_NO" };

/**
 * Cross the book for `chipUsd` of `side`. Returns what actually filled — a call
 * can come back `missed: true` with 0 contracts if the book emptied between the
 * read and the send (rare once the croupier is up).
 */
export async function placeCall(client: CalledItClient, args: PlaceCallArgs): Promise<CallReceipt> {
  if (!client.canTrade) throw new Error("placeCall needs a signer — create the client with a burner key.");
  const { exchange, config } = client;
  const { round, side, chipUsd } = args;
  const marketId = round.marketId;
  const decimals = config.decimals;
  const one = 10n ** BigInt(decimals);

  const onchain = await exchange.client.getMarketOnchain(marketId);
  if (onchain.status !== 1) {
    return miss(marketId, side, `round is ${statusName(onchain.status)}, not trading`);
  }
  const now = Math.floor(Date.now() / 1000);
  const left = Number(onchain.expiry) - now;
  if (left < (args.minLeftSec ?? 30)) return miss(marketId, side, `only ${left}s left in the window`);

  // Read the touch for this side. The book is quoted in UP terms whichever leg
  // you trade: DOWN's best ask is (1 − UP best bid).
  const book = await exchange.fetchOrderBook(round.symbol, 1);
  const upBid = book.bids[0]?.[0];
  const upAsk = book.asks[0]?.[0];
  const touchOwn = side === "UP" ? upAsk : upBid !== undefined ? 1 - upBid : undefined;
  if (touchOwn === undefined) return miss(marketId, side, "no liquidity on that side");

  const cross = (args.crossBps ?? 200) / 10_000;
  const priceOwn = clampProbability(touchOwn + cross);

  // contracts ≈ chips / price, snapped DOWN to the lot grid.
  const wantContracts = chipUsd / priceOwn;
  const quantity = toSteps(wantContracts, decimals, config.lot, "floor");
  if (quantity <= 0n) return miss(marketId, side, `chip $${chipUsd} is below one contract`);

  // Prices go through the raw tier as integers on the tick grid. The pool books
  // in UP terms, so a DOWN order's price is the complement — integer subtraction
  // keeps it on the grid.
  const priceOwnSteps = toSteps(priceOwn, decimals, config.tick, "round");
  const priceUpSteps = side === "UP" ? priceOwnSteps : one - priceOwnSteps;

  const expiresAt = Math.min(now + 300, Number(onchain.expiry));
  const res = await exchange.trader.placeOrder({
    pool: onchain.pool,
    side: SIDE_TO_BINARY[side],
    price: priceUpSteps,
    quantity,
    outcomeToken: onchain.outcomeToken,
    yesId: onchain.yesId,
    noId: onchain.noId,
    orderType: ORDER_TYPE.MARKET, // IOC: take what crosses, cancel the rest
    expireTimestampNs: BigInt(expiresAt) * 1_000_000_000n,
  });
  assertTxOk(res, `call ${side} ${marketId}`);

  const fills = (res.fills ?? []) as { quantityFilled: bigint; price?: bigint }[];
  const filledRaw = fills.reduce((acc, f) => acc + f.quantityFilled, 0n);
  const contracts = Number(filledRaw) / Number(one);
  if (contracts <= 0) return { ...miss(marketId, side, "nothing crossed"), txHash: res.hash };

  const costRaw = fills.reduce(
    (acc, f) => acc + (f.price !== undefined ? (f.quantityFilled * f.price) / one : 0n),
    0n,
  );
  const spent = costRaw > 0n ? Number(costRaw) / Number(one) : contracts * priceOwn;
  const avgPrice = spent / contracts;

  return {
    marketId,
    side,
    spent: round4(spent),
    contracts: round4(contracts),
    avgPrice: round4(avgPrice),
    maxWin: round4(contracts),
    txHash: res.hash,
    missed: false,
  };
}

function miss(marketId: MarketId, side: Side, _why: string): CallReceipt {
  return { marketId, side, spent: 0, contracts: 0, avgPrice: 0, maxWin: 0, missed: true };
}

const statusName = (s: number) =>
  (["listed", "trading", "locked", "settling", "resolved", "voided"][s] ?? String(s));
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
