// Discovering rounds. A "round" is one live up/down window on the DreamDEX
// event-contract venue: BTC or ETH, 15m or 1h, resolving against its own opening
// price ("call the direction over a fixed window").
//
// Two kinds of binary market sit in the indexer: FIXED STRIKE (strike != 0,
// "is BTC >= 63,897 at expiry") and UP/DOWN (strike == 0, "does BTC close at or
// above its opening price"). Called It only plays the up/down ones.

import type { CalledItClient } from "./client.js";
import type { Asset, MarketId, Round, RoundStatus } from "./types.js";

const STATUS_BY_CODE: Record<number, RoundStatus> = {
  0: "listed",
  1: "trading",
  2: "locked",
  3: "settling",
  4: "resolved",
  5: "voided",
};

const eqAddr = (a?: string | null, b?: string | null) =>
  (a ?? "").toLowerCase() === (b ?? "").toLowerCase();

interface RawMarket {
  symbol: string;
  type?: string;
  active?: boolean;
  outcomes?: { symbol: string }[];
  info: {
    marketType?: string;
    marketId?: string;
    venueId?: string;
    asset?: string;
    intervalSec?: number | string;
    strike?: number | string;
  };
}

/** True for a live up/down market on our venue, optionally filtered by asset. */
function isPlayableRound(m: RawMarket, venueId: string, asset?: Asset): boolean {
  if (m.type !== "binary" || !m.active) return false;
  if (m.info.marketType !== "BINARY") return false;
  if (!eqAddr(m.info.venueId, venueId)) return false;
  // up/down rows carry strike 0; fixed-strike rows carry a real number.
  if (String(m.info.strike ?? "0") !== "0") return false;
  if (asset && String(m.info.asset ?? "").toUpperCase() !== asset) return false;
  return true;
}

/** The YES/NO tradable symbols for a binary market (outcome 0 = YES/UP). */
function outcomeSymbols(m: RawMarket): { up: string; down: string } {
  const outs = m.outcomes ?? [];
  return {
    up: outs[0]?.symbol ?? `${m.symbol}#UP`,
    down: outs[1]?.symbol ?? `${m.symbol}#DOWN`,
  };
}

/**
 * Live rounds on the venue, newest window last. Pass an asset to narrow to
 * "BTC" or "ETH". Reads the authoritative on-chain status for each — the
 * indexer's `active` flag lags by seconds.
 */
export async function currentRounds(client: CalledItClient, asset?: Asset): Promise<Round[]> {
  const { exchange, config } = client;
  const all = Object.values((await exchange.loadMarkets(true)) as Record<string, RawMarket>);
  const playable = all.filter((m) => isPlayableRound(m, config.venueId, asset));

  const rounds = await Promise.all(
    playable.map(async (m): Promise<Round | null> => {
      const marketId = m.info.marketId as MarketId | undefined;
      if (!marketId) return null;

      const onchain = await exchange.client.getMarketOnchain(marketId).catch(() => null);
      if (!onchain) return null;

      const { up } = outcomeSymbols(m);
      const book = await exchange.fetchOrderBook(up, 1).catch(() => ({ bids: [], asks: [] }));
      const upBid = book.bids[0]?.[0] ?? null;
      const upAsk = book.asks[0]?.[0] ?? null;
      const upMid = upBid !== null && upAsk !== null ? (upBid + upAsk) / 2 : (upBid ?? upAsk ?? null);

      const intervalSec = Number(m.info.intervalSec ?? 0) || 900;
      const locksAt = Number(onchain.expiry);

      return {
        marketId,
        symbol: up,
        asset: String(m.info.asset ?? "BTC").toUpperCase() as Asset,
        intervalSec,
        status: STATUS_BY_CODE[onchain.status] ?? "listed",
        opensAt: locksAt - intervalSec,
        locksAt,
        openingPrice: await openingPriceOf(client, marketId),
        upProbability: upMid,
        book: {
          upBid,
          upAsk,
          downBid: upAsk !== null ? Number((1 - upAsk).toFixed(6)) : null,
          downAsk: upBid !== null ? Number((1 - upBid).toFixed(6)) : null,
        },
      };
    }),
  );

  return rounds
    .filter((r): r is Round => r !== null)
    .sort((a, b) => a.locksAt - b.locksAt);
}

/** One round by id (used after a call, and by the settlement watcher). */
export async function roundById(client: CalledItClient, marketId: MarketId): Promise<Round | null> {
  const rounds = await currentRounds(client);
  return rounds.find((r) => r.marketId.toLowerCase() === marketId.toLowerCase()) ?? null;
}

/**
 * The oracle reports prices as integer cents (2-decimal fixed point): a BTC
 * opening of `7812055` means $78,120.55, an ETH one of `246075` means $2,460.75.
 * Verified against the live testnet venue, Phase 0 (2026-09-01), consistent
 * across BTC and ETH. `getOpeningPrices` and `getMarketResolution` both use it.
 */
export const ORACLE_PRICE_DIVISOR = 100;

/**
 * The opening price a round resolves against, in dollars, or null while the
 * oracle's reference question is still unanswered.
 */
async function openingPriceOf(client: CalledItClient, marketId: MarketId): Promise<number | null> {
  try {
    const answers = await client.exchange.client.getOpeningPrices([marketId]);
    const raw = answers[marketId.toLowerCase()] ?? answers[marketId] ?? null;
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n / ORACLE_PRICE_DIVISOR : null;
  } catch {
    return null;
  }
}
