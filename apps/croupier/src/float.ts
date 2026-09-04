// The Float hook. In Phase 1.4 the croupier stops trading from a personal key
// and instead borrows working capital from CalledItFloat.sol each session,
// repaying realized PnL every window. The vault enforces per-round and global
// caps; depositors share the spread P&L pro-rata.
//
// Until the contract lands this is a no-op seam so the main loop already calls
// the right shape. Set CROUPIER_FLOAT=0x... to activate once deployed.

import type { EcContext } from "@dreamdex-bot-kit/ec-core";

const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

export interface Float {
  /** Pull working capital into the trading key at startup. */
  borrow(ctx: EcContext): Promise<void>;
  /** Return principal + realized PnL. Called on shutdown and on a risk pause. */
  repay(ctx: EcContext): Promise<void>;
  readonly active: boolean;
}

export function loadFloat(): Float {
  const addr = process.env.CROUPIER_FLOAT ?? "";
  if (!addr) {
    return {
      active: false,
      async borrow() {
        log("float: not configured — croupier trades from its own key (Phase 1.1–1.3)");
      },
      async repay() {},
    };
  }
  // TODO(Phase 1.4): CalledItFloat ABI — borrow(maxRound), repay() with the
  // key's current USDso balance, respect paused/caps. Wire viem writes here.
  return {
    active: true,
    async borrow() {
      log(`float: TODO borrow from ${addr}`);
    },
    async repay() {
      log(`float: TODO repay to ${addr}`);
    },
  };
}
