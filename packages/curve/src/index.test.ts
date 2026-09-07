import { describe, expect, it } from "vitest";
import { DEFAULT_CURVE_CONFIG, quote } from "./index.js";

const WINDOW = 900; // 15 minutes, like BTC's shortest DreamDEX window
const NOW = 1_800_000_000; // arbitrary fixed "now"

function inputs(overrides: Partial<Parameters<typeof quote>[0]> = {}) {
  return {
    spot: 80_000,
    opening: 80_000,
    nowSec: NOW,
    expirySec: NOW + WINDOW,
    windowSec: WINDOW,
    ...overrides,
  };
}

describe("quote", () => {
  it("is flat 0.50 when spot equals the opening price", () => {
    const q = quote(inputs());
    expect(q.fairUp).toBeCloseTo(0.5, 6);
  });

  it("stays close to 0.50 for a move that's small relative to the window's own volatility", () => {
    // a $20 move (0.025%) is a small fraction of a fresh 15m window's expected
    // move at 60% annualized vol (~0.32%) — should barely tilt the fair price
    const q = quote(inputs({ spot: 80_020, expirySec: NOW + WINDOW }));
    expect(q.fairUp).toBeGreaterThan(0.5);
    expect(q.fairUp).toBeLessThan(0.55);
  });

  it("swings hard toward 1 for the same-sized move with little time left", () => {
    // same $200 move, but only 60s left in the window — nearly decided
    const q = quote(inputs({ spot: 80_200, expirySec: NOW + 60 }));
    expect(q.fairUp).toBeGreaterThan(0.9);
  });

  it("swings hard toward 0 when the move is down and time is short", () => {
    const q = quote(inputs({ spot: 79_800, expirySec: NOW + 60 }));
    expect(q.fairUp).toBeLessThan(0.1);
  });

  it("is more decisive (further from 0.5) with less time left, for the same move", () => {
    const far = quote(inputs({ spot: 80_400, expirySec: NOW + WINDOW }));
    const near = quote(inputs({ spot: 80_400, expirySec: NOW + 120 }));
    expect(Math.abs(near.fairUp - 0.5)).toBeGreaterThan(Math.abs(far.fairUp - 0.5));
  });

  it("falls back to a flat 0.50 when the opening price is not known yet", () => {
    const q = quote(inputs({ opening: null, spot: 85_000 }));
    expect(q.fairUp).toBe(0.5);
  });

  it("quotes full size and the base spread right when a window opens", () => {
    const q = quote(inputs({ expirySec: NOW + WINDOW }));
    expect(q.sizeMult).toBeCloseTo(1, 6);
    expect(q.halfSpread).toBeCloseTo(DEFAULT_CURVE_CONFIG.baseHalfSpread, 6);
  });

  it("shrinks size and widens the spread as a window empties", () => {
    const open = quote(inputs({ expirySec: NOW + WINDOW }));
    const late = quote(inputs({ expirySec: NOW + 90 })); // 90s left, above the 45s cutoff
    expect(late.sizeMult).toBeLessThan(open.sizeMult);
    expect(late.sizeMult).toBeGreaterThanOrEqual(DEFAULT_CURVE_CONFIG.minSizeMult);
    expect(late.halfSpread).toBeGreaterThan(open.halfSpread);
  });

  it("never quotes below the size floor", () => {
    const q = quote(inputs({ expirySec: NOW + 50 })); // just above the 45s cutoff
    expect(q.sizeMult).toBeGreaterThanOrEqual(DEFAULT_CURVE_CONFIG.minSizeMult);
  });

  it("stops quoting entirely inside the hard cutoff", () => {
    const q = quote(inputs({ expirySec: NOW + 30 })); // below the 45s default cutoff
    expect(q.sizeMult).toBe(0);
  });

  it("stops quoting once a window has already expired", () => {
    const q = quote(inputs({ expirySec: NOW - 5 }));
    expect(q.sizeMult).toBe(0);
  });

  it("respects a custom minQuoteSec", () => {
    const cfg = { ...DEFAULT_CURVE_CONFIG, minQuoteSec: 120 };
    const q = quote(inputs({ expirySec: NOW + 100 }), cfg);
    expect(q.sizeMult).toBe(0);
  });

  it("widens extra hard right at the money in the closing seconds (the gamma guard)", () => {
    const atMoney = quote(inputs({ spot: 80_000, expirySec: NOW + 60 }));
    const decided = quote(inputs({ spot: 82_000, expirySec: NOW + 60 }));
    expect(atMoney.halfSpread).toBeGreaterThan(decided.halfSpread);
  });

  it("always returns finite numbers in range across a sweep of random inputs", () => {
    for (let i = 0; i < 500; i++) {
      const spot = 1000 + Math.random() * 200_000;
      const opening = Math.random() < 0.1 ? null : 1000 + Math.random() * 200_000;
      const windowSec = [60, 300, 900, 3600, 86_400][Math.floor(Math.random() * 5)]!;
      const expirySec = NOW + Math.floor(Math.random() * windowSec * 1.5) - windowSec * 0.25;

      const q = quote(inputs({ spot, opening, expirySec, windowSec }));

      expect(Number.isFinite(q.fairUp)).toBe(true);
      expect(Number.isFinite(q.halfSpread)).toBe(true);
      expect(Number.isFinite(q.sizeMult)).toBe(true);
      expect(q.fairUp).toBeGreaterThanOrEqual(0.02);
      expect(q.fairUp).toBeLessThanOrEqual(0.98);
      expect(q.sizeMult).toBeGreaterThanOrEqual(0);
      expect(q.sizeMult).toBeLessThanOrEqual(1);
      expect(q.halfSpread).toBeGreaterThan(0);
    }
  });
});
