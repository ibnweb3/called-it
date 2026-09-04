// A tiny typed pub/sub. The indexer publishes; the WS layer and the Telegram
// notifier subscribe. In-process only — fine for a single backend instance.

import { EventEmitter } from "node:events";
import type { RoundRow, CallRow } from "./db.js";

export interface Events {
  "round:new": RoundRow;
  "round:update": RoundRow;
  /** Fired once, when a round's chain status first reaches resolved/voided. */
  "round:settled": { round: RoundRow };
  /** A player's call in a settled round, after grading. */
  "call:graded": {
    address: string;
    call: CallRow;
    asset: string;
    roundResult: "UP" | "DOWN" | "VOID";
    result: "won" | "lost" | "void";
    payout: number;
    streakCurrent: number;
    streakBest: number;
  };
  /** ~T-60s before a round locks — the notifier turns this into "closing soon". */
  "round:locking": { round: RoundRow };
}

class Bus extends EventEmitter {
  emitT<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.emit(type, payload);
  }
  onT<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): void {
    this.on(type, fn);
  }
}

export const bus = new Bus();
bus.setMaxListeners(50);
