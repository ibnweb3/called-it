import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";

/**
 * Server-corrected wall clock, in seconds.
 *
 * The countdown is anchored to `locksAt` against the server's `now` (from the
 * WS hello/tick), not the device clock — a phone two minutes fast should not
 * lock a round early (SPEC §6, clock skew).
 */
export function useNow(): number {
  const skew = useApp((s) => s.skew);
  const [local, setLocal] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(() => setLocal(Math.floor(Date.now() / 1000)), 500);
    return () => window.clearInterval(id);
  }, []);

  return local + skew;
}
