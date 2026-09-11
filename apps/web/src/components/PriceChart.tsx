import { useId, useMemo } from "react";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { price } from "@/lib/format";
import { activeRound, useApp } from "@/lib/store";

const W = 300;
const H = 128;
const PAD = 10;

/**
 * The decorative space beside the game box, now a live line of the asset
 * you're actually watching — the same feed the round settles against, not a
 * separate ticker. Trends green above the round's opening line, red below it,
 * so you can see whether you're winning your call at a glance instead of just
 * a comic-burst logo. Purely decorative (aria-hidden, same as what it
 * replaced): a quiet feed never blocks or breaks anything.
 */
export function PriceChart() {
  const asset = useApp((s) => s.asset);
  const round = useApp(activeRound);
  const points = usePriceHistory(asset, 2000, 60);
  const gradientId = useId();

  const last = points.at(-1) ?? null;
  const opening = round?.openingPrice ?? null;
  const delta = last && opening !== null ? last.price - opening : null;
  const flat = delta !== null && Math.abs(delta) < 0.005;
  const up = delta !== null && delta > 0;
  const trendColor = delta === null || flat ? "var(--gold)" : up ? "var(--up-deep)" : "var(--down-deep)";

  const path = useMemo(() => buildPath(points, opening), [points, opening]);

  return (
    <div className="price-chart sticker" aria-hidden="true">
      <div className="price-chart-head">
        <span className="pill price-chart-asset">{asset}</span>
        {last ? (
          <span className="price-chart-now">
            <span className="num">{price(last.price)}</span>
            {delta !== null && (
              <span className="num" style={{ color: trendColor }}>
                {flat ? "level" : `${up ? "+" : "−"}${abs2(delta)} ${up ? "▲" : "▼"}`}
              </span>
            )}
          </span>
        ) : (
          <span className="dim tiny">warming up…</span>
        )}
      </div>

      {path ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="price-chart-svg" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {path.lineAt !== null && (
            <line
              x1={0}
              x2={W}
              y1={path.lineAt}
              y2={path.lineAt}
              stroke="var(--ink-soft)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              opacity={0.6}
            />
          )}
          <path d={path.area} fill={`url(#${gradientId})`} stroke="none" />
          <path
            d={path.line}
            fill="none"
            stroke={trendColor}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {path.lastPoint && (
            <circle cx={path.lastPoint[0]} cy={path.lastPoint[1]} r={4} fill={trendColor} className="price-chart-dot" />
          )}
        </svg>
      ) : (
        <div className="price-chart-svg price-chart-skel skel" />
      )}

      {opening !== null && <div className="price-chart-line-label tiny dim">line to beat {price(opening)}</div>}
    </div>
  );
}

/** $37.00 — no sign, for pairing with a hand-picked +/− and arrow. */
function abs2(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ChartPath {
  line: string;
  area: string;
  lineAt: number | null;
  lastPoint: [number, number] | null;
}

function buildPath(points: { price: number; at: number }[], opening: number | null): ChartPath | null {
  if (points.length < 2) return null;

  const values = points.map((p) => p.price);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (opening !== null) {
    min = Math.min(min, opening);
    max = Math.max(max, opening);
  }
  if (max - min < 1e-6) {
    max += 1;
    min -= 1;
  }
  const span = max - min;
  const top = PAD;
  const bottom = H - PAD;
  const plotH = bottom - top;

  const x = (i: number) => (points.length === 1 ? 0 : (i / (points.length - 1)) * W);
  const y = (v: number) => bottom - ((v - min) / span) * plotH;

  const coords = points.map((p, i) => [x(i), y(p.price)] as [number, number]);
  const line = coords.map(([cx, cy], i) => `${i === 0 ? "M" : "L"}${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${bottom} L0,${bottom} Z`;

  return {
    line,
    area,
    lineAt: opening !== null ? y(opening) : null,
    lastPoint: coords.at(-1) ?? null,
  };
}
