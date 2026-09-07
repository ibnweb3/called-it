/**
 * The Croupier — the bot that keeps a Called It game running every round.
 *
 * A two-sided POST-ONLY maker for DreamDEX event contracts. For each live
 * up/down window it quotes a symmetric bid + ask around a fair UP probability,
 * refreshing fast so a fresh window is two-sided within seconds of opening.
 * That is the whole point: a player never opens the app to an empty market.
 *
 * Forked from @dreamdex-bot-kit/ec-core's `ec-maker`. What Called It adds:
 *   - fair value = a 0.50 anchor (or 0.50 + drift, or the time-aware
 *     @called-it/curve model — CROUPIER_FAIR=flat|drift|curve), pulled
 *     toward the book mid  →  src/fair-value.ts
 *   - a daily-loss kill switch that pauses + flattens  →  src/risk.ts
 *   - a Float hook: trade the community vault's capital, not a personal key,
 *     borrowed at startup and settled + re-borrowed every CROUPIER_FLOAT_CYCLE_MS
 *     (default 5m) so the vault's share price moves while the bot runs, not
 *     only at shutdown  →  src/float.ts  (Phase 1.4)
 *
 * DRY_RUN=true (default) logs the quotes it would place. Set DRY_RUN=false + a
 * funded PRIVATE_KEY in the repo-root .env to quote for real.
 *
 *   npm run croupier            # from repo root
 *   npm run start -w croupier
 */

import {
  createExchange,
  loadConfig,
  shutdown,
  activeMarkets,
  explainEmptyScope,
  marketOnchain,
  isTradable,
  minLeftSec,
  netPosition,
  outcomeSymbols,
  seedInventory,
  quantize,
  assertProbability,
  clampProbability,
  placeLimit,
  cancelTracked,
  cancelVenueOrders,
  untrackOrder,
  sellableSize,
  maybeClaim,
  type EcContext,
  type UnifiedMarket,
} from "@dreamdex-bot-kit/ec-core";
import { isBinaryMarket } from "@somnia-chain/markets-sdk";

import { CFG } from "./config.js";
import { SpotMomentum, pollSpot, fairUp, fairQuote } from "./fair-value.js";
import { RiskGuard, alert } from "./risk.js";
import { loadFloat } from "./float.js";

const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);
const sleep = async (ms: number, stopped?: () => boolean) => {
  for (let t = 0; t < ms; t += 500) {
    if (stopped?.()) return;
    await new Promise((r) => setTimeout(r, Math.min(500, ms - t)));
  }
};

const seeded = new Set<string>();
const mom = new SpotMomentum();
const risk = new RiskGuard();
const float = loadFloat();

// Per-market quoting state, so we only spend gas when it actually buys us
// something. `lastQuote` is what we last posted (skip a re-post if the fair
// barely moved); `crossStreak` / `cooldownUntil` back a market off after it
// keeps rejecting our post-only quote because another maker has it covered.
const lastQuote = new Map<string, { fair: number; halfSpread: number; size: number }>();
const crossStreak = new Map<string, number>();
const cooldownUntil = new Map<string, number>();

// "curve" mode needs each window's opening (reference) price. The oracle
// answers it a little after a window opens, not instantly — until then we
// fall back to the first spot price we happened to see for that window, so
// the curve degrades to "no move yet" (fair 0.50) instead of failing.
// Same pattern as packages/chain/src/rounds.ts's openingPriceOf().
const openingCache = new Map<string, number>();
const firstSpotCache = new Map<string, number>();

function forgetMarket(symbol: string): void {
  seeded.delete(symbol);
  openingCache.delete(symbol);
  firstSpotCache.delete(symbol);
  lastQuote.delete(symbol);
  crossStreak.delete(symbol);
  cooldownUntil.delete(symbol);
}

async function resolveOpening(
  ctx: EcContext,
  marketId: `0x${string}`,
  symbol: string,
  spotNow: number,
): Promise<number | null> {
  const cached = openingCache.get(symbol);
  if (cached !== undefined) return cached;
  try {
    const answers = await ctx.exchange.client.getOpeningPrices([marketId]);
    const raw = answers[marketId.toLowerCase()] ?? answers[marketId] ?? null;
    const n = raw !== null ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) {
      const opening = n / 100; // oracle prices are integer cents — packages/chain/src/rounds.ts
      openingCache.set(symbol, opening);
      return opening;
    }
  } catch {
    /* oracle reference question not answered yet — fall through to the spot cache */
  }
  if (spotNow > 0) {
    const cachedSpot = firstSpotCache.get(symbol);
    if (cachedSpot !== undefined) return cachedSpot;
    firstSpotCache.set(symbol, spotNow);
    return spotNow;
  }
  return null;
}

async function quoteOne(ctx: EcContext, market: UnifiedMarket): Promise<void> {
  if (!market.symbol.toUpperCase().includes(CFG.underlying)) return;

  // A market another maker keeps out-quoting us on — leave it alone for a while.
  if (Date.now() < (cooldownUntil.get(market.symbol) ?? 0)) return;

  const onchain = await marketOnchain(ctx, market);
  if (!onchain) return;
  if (!isTradable(onchain)) {
    forgetMarket(market.symbol);
    return;
  }

  // Don't act on a window about to close — status can flip between snapshot and
  // send. Scaled to the cadence.
  const interval = isBinaryMarket(market.info) ? Number(market.info.intervalSec ?? 0) : 0;
  if (Number(onchain.expiry) - Date.now() / 1000 < minLeftSec(interval || null)) return;

  // Skip the far-out daily/weekly windows — their book barely moves and
  // quoting them is mostly wasted gas.
  if (CFG.maxWindowSec > 0 && interval > CFG.maxWindowSec) return;

  // Seed a YES/NO set once (mint-a-pair) so the sell side is collateralised.
  if (!seeded.has(market.symbol)) {
    if (!ctx.config.dryRun) await seedInventory(ctx, market, onchain);
    seeded.add(market.symbol);
  }

  const { yes } = outcomeSymbols(market);
  const ob = await ctx.exchange.fetchOrderBook(yes, 3);

  let fair: number;
  let halfSpread = CFG.halfSpread;
  let sizeMult = 1;

  if (CFG.fairMode === "curve") {
    const spot = mom.latest() ?? 0;
    const marketId = isBinaryMarket(market.info) ? market.info.marketId : null;
    const opening = marketId ? await resolveOpening(ctx, marketId, market.symbol, spot) : null;
    const q = fairQuote(ob, {
      spot,
      opening,
      nowSec: Date.now() / 1000,
      expirySec: Number(onchain.expiry),
      windowSec: interval || 900,
    });
    fair = q.fairUp;
    halfSpread = q.halfSpread;
    sizeMult = q.sizeMult;
    if (sizeMult <= 0) return; // too close to expiry — the curve says don't quote this one
  } else {
    fair = fairUp(ob, mom);
  }

  const size = quantize(ctx, CFG.quoteSize * sizeMult);
  if (size <= 0) {
    log(`${yes}: CROUPIER_QUOTE_SIZE ${CFG.quoteSize} × sizeMult ${sizeMult.toFixed(2)} is below one lot — skipping`);
    return;
  }
  const bidPx = clampProbability(fair - halfSpread);
  const askPx = clampProbability(fair + halfSpread);
  assertProbability(bidPx);
  assertProbability(askPx);

  if (ctx.config.dryRun) {
    const net = await netPosition(ctx, onchain);
    log(
      `DRY quote ${yes}: ${net >= CFG.maxInventory ? "—" : `${size}@${bidPx.toFixed(3)}`} / ` +
        `${net <= -CFG.maxInventory ? "—" : `${size}@${askPx.toFixed(3)}`}  ` +
        `(fair ${fair.toFixed(3)}, spread ±${halfSpread.toFixed(3)}, size×${sizeMult.toFixed(2)}, net ${net.toFixed(1)})`,
    );
    return;
  }

  // If our quote is still resting and neither the fair nor the size moved
  // enough to matter, leave it — a cancel + re-post is 4 transactions for
  // nothing.
  const open = await ctx.exchange.fetchOpenOrders(yes);
  const prev = lastQuote.get(market.symbol);
  const moved =
    !prev ||
    Math.abs(fair - prev.fair) >= CFG.requoteFairMove ||
    Math.abs(halfSpread - prev.halfSpread) >= CFG.requoteFairMove ||
    Math.abs(size - prev.size) / Math.max(prev.size, 1) >= CFG.requoteSizeFrac;
  if (open.length > 0 && !moved) return;

  // Cancel our stale quotes on this market before re-posting.
  for (const o of open) {
    await ctx.exchange.cancelOrder(o.id, yes);
    untrackOrder(o.id);
  }

  // Past the inventory cap, quote only the side that unwinds.
  const net = await netPosition(ctx, onchain);
  const skipBid = net >= CFG.maxInventory;
  const skipAsk = net <= -CFG.maxInventory;

  try {
    if (!skipBid) {
      await placeLimit(ctx, { market, onchain, outcome: "YES", side: "buy", price: bidPx, size, type: "post-only" });
    }
    const askSize = skipAsk ? 0 : await sellableSize(ctx, onchain, "YES", size);
    if (askSize > 0) {
      await placeLimit(ctx, { market, onchain, outcome: "YES", side: "sell", price: askPx, size: askSize, type: "post-only" });
    }
    crossStreak.delete(market.symbol);
    lastQuote.set(market.symbol, { fair, halfSpread, size });
    log(
      `quote ${yes}: bid ${skipBid ? "—" : `${size}@${bidPx.toFixed(3)}`} / ` +
        `ask ${askSize > 0 ? `${askSize}@${askPx.toFixed(3)}` : "—"}  ` +
        `(fair ${fair.toFixed(3)}, spread ±${halfSpread.toFixed(3)})`,
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (!msg.includes("PostOnlyWouldCross")) throw e;
    lastQuote.delete(market.symbol);
    const n = (crossStreak.get(market.symbol) ?? 0) + 1;
    crossStreak.set(market.symbol, n);
    if (n >= CFG.crossBackoffAfter) {
      cooldownUntil.set(market.symbol, Date.now() + CFG.crossBackoffMs);
      crossStreak.delete(market.symbol);
      log(`${yes}: ${n}× PostOnlyWouldCross — another maker has it, backing off ${Math.round(CFG.crossBackoffMs / 1000)}s`);
    }
  }
}

const EMPTY_HINT_MS = 60_000;
let lastEmptyAt = 0;

async function main() {
  const dryRun = loadConfig().dryRun;
  const ctx = createExchange({ withSigner: !dryRun });
  log(
    `croupier up as ${ctx.exchange.walletAddress ?? "(no key, dry run)"} · ${CFG.underlying} · ` +
      `dryRun=${dryRun} · fair=${CFG.fairMode} · spread=±${CFG.halfSpread} · size=${CFG.quoteSize} · ` +
      `refresh=${CFG.refreshMs}ms · dayLossLimit=${CFG.maxDayLoss} · float=${float.active ? "on" : "off"}`,
  );

  if (!dryRun) await float.borrow(ctx);
  let lastFloatCycleAt = Date.now();

  let stop = false;
  const requestStop = () => (stop = true);
  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);

  while (!stop) {
    try {
      await pollSpot(ctx, CFG.underlying, mom);
      await maybeClaim(ctx);

      const canTrade = dryRun || (await risk.check(ctx));
      if (!canTrade) {
        if (!dryRun) await pullAllQuotes(ctx);
        await sleep(30_000, () => stop);
        continue;
      }

      // Settle + re-borrow on a timer so the vault's share price moves while
      // the bot is running, not only when it stops. Pull quotes first — settle
      // sweeps the whole croupier-wallet balance, and resting orders hold funds
      // in the pool, not the wallet.
      if (!dryRun && float.active && CFG.floatCycleMs > 0 && Date.now() - lastFloatCycleAt >= CFG.floatCycleMs) {
        lastFloatCycleAt = Date.now();
        try {
          await pullAllQuotes(ctx);
          await float.repay(ctx);
          await float.borrow(ctx);
        } catch (e) {
          log(`float cycle failed: ${(e as Error).message}`);
        }
      }

      const markets = await activeMarkets(ctx);
      if (markets.length === 0 && Date.now() - lastEmptyAt >= EMPTY_HINT_MS) {
        lastEmptyAt = Date.now();
        log(`no window to quote — ${await explainEmptyScope(ctx)}`);
      }
      for (const m of markets) {
        if (stop) break;
        try {
          await quoteOne(ctx, m);
        } catch (e) {
          log(`${m.symbol} error: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      log(`cycle error: ${(e as Error).message}`);
    }
    if (stop) break;
    await sleep(CFG.refreshMs, () => stop);
  }

  if (!dryRun) {
    await pullAllQuotes(ctx);
    await float.repay(ctx).catch((e) => log(`float repay failed: ${(e as Error).message}`));
  }
  await shutdown(ctx);
  log("croupier stopped");
}

async function pullAllQuotes(ctx: EcContext): Promise<void> {
  try {
    const { cancelled, tracked } = await cancelTracked(ctx);
    const swept = await cancelVenueOrders(ctx).catch(() => 0);
    log(`pulled ${cancelled}/${tracked} tracked + ${swept} swept`);
  } catch (e) {
    log(`quote pull failed: ${(e as Error).message}`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    void alert(`croupier crashed: ${(e as Error).message}`);
    process.exit(1);
  },
);
