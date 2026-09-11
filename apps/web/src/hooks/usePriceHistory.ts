import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import type { Asset } from "@/lib/types";

export interface PricePoint {
  price: number;
  at: number;
}

/**
 * A rolling window of the live underlying, for the price chart. Same feed as
 * useLivePrice (SPEC §9 — decoration, not truth: rounds still settle on the
 * oracle's opening/closing answers), just kept as a short trail instead of one
 * number. Resets whenever the asset changes so BTC's trail never bleeds into
 * ETH's, and stops polling while the tab is hidden.
 */
export function usePriceHistory(asset: Asset, sampleMs = 2000, maxPoints = 60): PricePoint[] {
  const gateway = useApp((s) => s.gateway);
  const booted = useApp((s) => s.booted);
  const [points, setPoints] = useState<PricePoint[]>([]);

  useEffect(() => {
    if (!booted) return;
    let alive = true;
    setPoints([]);

    const read = async () => {
      if (document.hidden) return;
      const row = await gateway.price(asset).catch(() => null);
      if (!alive || !row || row.price === null) return;
      setPoints((prev) => {
        const next = [...prev, { price: row.price as number, at: row.at ?? Date.now() }];
        return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
      });
    };

    void read();
    const id = window.setInterval(() => void read(), sampleMs);
    const onVisible = () => !document.hidden && void read();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [gateway, asset, sampleMs, maxPoints, booted]);

  return points;
}
