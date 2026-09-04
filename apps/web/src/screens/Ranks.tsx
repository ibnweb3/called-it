import { useEffect, useMemo, useState } from "react";
import { Seg, Skeleton, Sticker } from "@/components/kit";
import { Mascot } from "@/components/Mascot";
import { signedUsd, who } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { LeaderRow } from "@/lib/types";

type Sort = "streak" | "net";

/** Top N plus your own row if you fell outside it — bounded regardless of how
 *  big the real leaderboard gets, so this never has to scroll. */
const TOP_N = 6;

export function Ranks() {
  const gateway = useApp((s) => s.gateway);
  const address = useApp((s) => s.address);
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [sort, setSort] = useState<Sort>("streak");

  useEffect(() => {
    let alive = true;
    gateway
      .leaderboard(25)
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [gateway]);

  const sorted = useMemo(() => {
    if (!rows) return null;
    const copy = [...rows];
    copy.sort(sort === "streak" ? (a, b) => b.best - a.best || b.netUsd - a.netUsd : (a, b) => b.netUsd - a.netUsd);
    return copy.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rows, sort]);

  const mine = sorted?.find((r) => r.address.toLowerCase() === address.toLowerCase());
  const top = sorted?.slice(0, TOP_N) ?? [];
  const shown = mine && !top.some((r) => r.address.toLowerCase() === address.toLowerCase()) ? [...top, mine] : top;

  return (
    <div className="screen">
      <div className="row-between">
        <h2 style={{ fontSize: 22 }}>Ranks</h2>
        <Seg<Sort>
          ariaLabel="Sort leaderboard"
          value={sort}
          onChange={setSort}
          options={[
            { value: "streak", label: "🔥 streak" },
            { value: "net", label: "net" },
          ]}
        />
      </div>

      {!sorted ? (
        <>
          <Skeleton height={40} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </>
      ) : sorted.length === 0 ? (
        <Sticker className="stack center" style={{ justifyItems: "center", gap: 8, padding: 14 }}>
          <Mascot mood="sleep" size={56} />
          <h2 style={{ fontSize: 18 }}>Nobody's called it yet</h2>
          <p className="dim tiny">Be first on the board.</p>
        </Sticker>
      ) : (
        <>
          <ul className="list">
            <li className="row-between tiny dim" style={{ padding: "0 10px" }}>
              <span>player</span>
              <span style={{ display: "flex", gap: 16 }}>
                <span style={{ width: 26, textAlign: "right" }}>best</span>
                <span style={{ width: 36, textAlign: "right" }}>win%</span>
                <span style={{ width: 54, textAlign: "right" }}>net</span>
              </span>
            </li>
            {shown.map((r) => (
              <li
                key={r.address}
                className={`list-row ${r.address.toLowerCase() === address.toLowerCase() ? "me" : ""}`}
              >
                <span className="rank num">{r.rank}</span>
                <span className="grow">{who(r.handle, r.address)}</span>
                <span className="num tiny" style={{ width: 26, textAlign: "right" }}>
                  {r.best}
                </span>
                <span className="num tiny" style={{ width: 36, textAlign: "right" }}>
                  {Math.round(r.winRate * 100)}%
                </span>
                <span className="num tiny" style={{ width: 54, textAlign: "right" }}>
                  {signedUsd(r.netUsd)}
                </span>
              </li>
            ))}
          </ul>

          {sorted.length > shown.length ? (
            <p className="more-note">top {TOP_N} of {sorted.length} — keep calling to climb.</p>
          ) : !mine ? (
            <p className="more-note">Not on the board yet — keep calling.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
