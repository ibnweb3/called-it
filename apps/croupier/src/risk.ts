// The kill switch. The croupier makes a market with the Float's money, so a bad
// day must stop it, not drain the vault.
//
// v1 measure: realized USDso against a daily baseline. It ignores open positions
// and unclaimed winnings, so it reads worse than reality mid-day and trips
// early — deliberately. Per-round PnL accounting arrives with the Float wiring
// (Phase 1.4), which settles the croupier's borrow every window and gives an
// exact number.

import type { EcContext } from "@dreamdex-bot-kit/ec-core";
import { CFG } from "./config.js";

const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

export class RiskGuard {
  private baselineUsd = 0;
  private baselineDay = "";
  paused = false;

  private async usdBalance(ctx: EcContext): Promise<number> {
    const me = ctx.exchange.walletAddress;
    const collateral = ctx.config.addresses.collateral ?? ctx.config.addresses.testUsdc;
    if (!me || !collateral) return 0;
    const raw = await ctx.exchange.client.getErc20Balance(collateral, me).catch(() => 0n);
    return Number(raw) / 10 ** ctx.config.decimals;
  }

  /** Call once per loop. Returns true while trading is allowed. */
  async check(ctx: EcContext): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const bal = await this.usdBalance(ctx);

    if (today !== this.baselineDay) {
      this.baselineDay = today;
      this.baselineUsd = bal;
      if (this.paused) {
        this.paused = false;
        log(`risk: new day — baseline ${bal.toFixed(2)} USDso, unpaused`);
      }
    }

    const pnl = bal - this.baselineUsd;
    if (!this.paused && pnl < -CFG.maxDayLoss) {
      this.paused = true;
      const msg = `croupier PAUSED — day PnL ${pnl.toFixed(2)} USDso past -${CFG.maxDayLoss} limit. Quotes pulled; will retry tomorrow or on manual restart.`;
      log(`risk: ${msg}`);
      await alert(msg);
    }
    return !this.paused;
  }

  dayPnlNote(): string {
    return this.baselineUsd > 0 ? `day baseline ${this.baselineUsd.toFixed(2)} USDso` : "day baseline pending";
  }
}

export async function alert(text: string): Promise<void> {
  if (!CFG.alertWebhook) return;
  try {
    await fetch(CFG.alertWebhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `🃏 ${text}` }),
    });
  } catch {
    /* alerting must never take the bot down */
  }
}
