import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { Asset, LivePriceRow } from "@/lib/types";

/**
 * The live underlying, polled while the app is on screen.
 *
 * Decoration, not truth: a round still settles on the oracle's opening and
 * closing answers, and this number is only ever "where it is right now". So it
 * fails to `null` and the line it feeds simply disappears — nothing waits on it,
 * nothing breaks without it.
 */
export function useLivePrice(asset: Asset, everyMs = 5_000): LivePriceRow | null {
  const gateway = useApp((s) => s.gateway);
  const booted = useApp((s) => s.booted);
  const [row, setRow] = useState<LivePriceRow | null>(null);

  useEffect(() => {
    if (!booted) return;
    let alive = true;
    setRow(null); // never show BTC's price against an ETH round

    // Read once on mount whatever the tab is doing, so the line is already
    // there when someone looks; after that a backgrounded tab stops polling
    // rather than hammering the feed at nobody.
    const read = async (force = false) => {
      if (!force && document.hidden) return;
      const next = await gateway.price(asset).catch(() => null);
      if (alive) setRow(next);
    };
    const onVisible = () => void read();

    void read(true);
    const id = window.setInterval(() => void read(), everyMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gateway, asset, everyMs, booted]);

  return row;
}
