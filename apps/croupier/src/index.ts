/**
 * The Croupier — the bot that keeps a Called It game running every round.
 *
 * A two-sided POST-ONLY maker for DreamDEX event contracts. For each live
 * up/down window it quotes a symmetric bid + ask around a fair UP probability,
 * refreshing fast so a fresh window is two-sided within seconds of opening.
 * That is the whole point: a player never opens the app to an empty market.
 *
 * Forked from @dreamdex-bot-kit/ec-core's `ec-maker`. What Called It adds:
 *   - fair value = a 0.50 anchor (or 0.50 + drift with a price feed), pulled
 *     toward the book mid  →  src/fair-value.ts
 *   - a daily-loss kill switch that pauses + flattens  →  src/risk.ts
 *   - a Float hook: trade the community vault's capital, not a personal key
 *     →  src/float.ts  (Phase 1.4)
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
import { SpotMomentum, pollSpot, fairUp, anchorUp } from "./fair-value.js";
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

async function quoteOne(ctx: EcContext, market: UnifiedMarket): Promise<void> {
  if (!market.symbol.toUpperCase().includes(CFG.underlying)) return;

  const onchain = await marketOnchain(ctx, market);
  if (!onchain) return;
  if (!isTradable(onchain)) {
    seeded.delete(market.symbol);
    return;
  }

  // Don't act on a window about to close — status can flip between snapshot and
  // send. Scaled to the cadence.
  const interval = isBinaryMarket(market.info) ? Number(market.info.intervalSec ?? 0) : 0;
  if (Number(onchain.expiry) - Date.now() / 1000 < minLeftSec(interval || null)) return;

  // Seed a YES/NO set once (mint-a-pair) so the sell side is collateralised.
  if (!seeded.has(market.symbol)) {
    if (!ctx.config.dryRun) await seedInventory(ctx, market, onchain);
    seeded.add(market.symbol);
  }

  const { yes } = outcomeSymbols(market);
  const ob = await ctx.exchange.fetchOrderBook(yes, 3);
  const fair = fairUp(ob, mom);

  const size = quantize(ctx, CFG.quoteSize);
  if (size <= 0) {
    log(`${yes}: CROUPIER_QUOTE_SIZE ${CFG.quoteSize} is below one lot — skipping`);
    return;
  }
  const bidPx = clampProbability(fair - CFG.halfSpread);
  const askPx = clampProbability(fair + CFG.halfSpread);
  assertProbability(bidPx);
  assertProbability(askPx);

  // Cancel our stale quotes on this market before re-posting.
  if (!ctx.config.dryRun) {
    for (const o of await ctx.exchange.fetchOpenOrders(yes)) {
      await ctx.exchange.cancelOrder(o.id, yes);
      untrackOrder(o.id);
    }
  }

  // Past the inventory cap, quote only the side that unwinds.
  const net = await netPosition(ctx, onchain);
  const skipBid = net >= CFG.maxInventory;
  const skipAsk = net <= -CFG.maxInventory;

  if (ctx.config.dryRun) {
    log(
      `DRY quote ${yes}: ${skipBid ? "—" : `${size}@${bidPx.toFixed(3)}`} / ` +
        `${skipAsk ? "—" : `${size}@${askPx.toFixed(3)}`}  (fair ${fair.toFixed(3)}, anchor ${anchorUp(mom).toFixed(3)}, net ${net.toFixed(1)})`,
    );
    return;
  }

  if (!skipBid) {
    await placeLimit(ctx, { market, onchain, outcome: "YES", side: "buy", price: bidPx, size, type: "post-only" });
  }
  const askSize = skipAsk ? 0 : await sellableSize(ctx, onchain, "YES", size);
  if (askSize > 0) {
    await placeLimit(ctx, { market, onchain, outcome: "YES", side: "sell", price: askPx, size: askSize, type: "post-only" });
  }
  log(
    `quote ${yes}: bid ${skipBid ? "—" : `${size}@${bidPx.toFixed(3)}`} / ` +
      `ask ${askSize > 0 ? `${askSize}@${askPx.toFixed(3)}` : "—"}  (fair ${fair.toFixed(3)})`,
  );
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
