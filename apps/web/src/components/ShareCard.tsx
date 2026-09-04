import { useState } from "react";
import { Btn } from "./kit";
import type { SettledRound } from "@/lib/types";

export interface ShareInput {
  /** "Called it." / "6 for 6 today" — the shout. */
  headline: string;
  /** "BTC ▲ · $5 → $8.90" — the detail line. */
  detail: string;
  streak: number;
  /** Recent results, drawn as the sticker strip. */
  strip: Array<SettledRound["result"]>;
  /** Where to send whoever sees it. */
  url: string;
}

/**
 * The share card is drawn, not screenshotted — same sticker language as the
 * app, at 1080². Canvas keeps it client-side (SPEC §5.8); a backend OG endpoint
 * is a later nice-to-have and this does not wait for it.
 */
export function drawShareCard(input: ShareInput): Promise<Blob> {
  const S = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  const ink = "#0d1225";
  const paper = "#1e2846";
  const card = "#263359";
  const border = "#40538c";
  const text = "#d3d5da";
  const dim = "#9aa3b5";
  const gold = "#f0b429";

  // the night the app plays under
  const sky = ctx.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, "#131a30");
  sky.addColorStop(1, paper);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, S, S);

  // a handful of stars, same as the canyon behind the app
  ctx.fillStyle = text;
  for (const [x, y, r] of [
    [120, 90, 3], [300, 58, 2], [470, 128, 2.4], [640, 74, 2],
    [820, 140, 2.6], [960, 96, 2], [190, 210, 2.2], [900, 250, 2.4],
  ]) {
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // the sticker
  const pad = 56;
  roundRect(ctx, pad, pad, S - pad * 2, S - pad * 2, 56);
  ctx.fillStyle = card;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = border;
  ctx.stroke();

  // wordmark
  ctx.fillStyle = text;
  ctx.font = '800 44px "Archivo Expanded", Archivo, system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("CALLED IT", pad + 56, pad + 106);

  // gold rule
  ctx.fillStyle = gold;
  ctx.fillRect(pad + 56, pad + 128, 180, 12);

  // Headline — wrapped, big. The measure stops short of the streak coin in the
  // top-right corner so a long shout wraps instead of running underneath it.
  ctx.fillStyle = text;
  ctx.font = '800 104px "Archivo Expanded", Archivo, system-ui, sans-serif';
  wrap(ctx, input.headline, pad + 56, pad + 268, S - pad * 2 - 112 - 180, 104);

  // detail
  ctx.font = "700 42px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillStyle = dim;
  ctx.fillText(input.detail, pad + 56, S - pad - 268);

  // streak chip
  const cx = S - pad - 150;
  const cy = pad + 190;
  ctx.beginPath();
  ctx.arc(cx, cy + 8, 88, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 88, 0, Math.PI * 2);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = ink;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.font = "700 72px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillText(String(input.streak), cx, cy + 16);
  ctx.font = '700 24px "Archivo Expanded", Archivo, system-ui, sans-serif';
  ctx.fillText("STREAK", cx, cy + 54);

  // the strip
  ctx.textAlign = "center";
  let x = pad + 56;
  const y = S - pad - 208;
  for (const r of input.strip.slice(0, 12)) {
    ctx.save();
    ctx.translate(x + 32, y + 38);
    ctx.rotate(((x % 2 === 0 ? -2.5 : 2) * Math.PI) / 180);
    roundRect(ctx, -32, -38, 64, 76, 16);
    ctx.fillStyle = r === "UP" ? "#3ddb87" : r === "DOWN" ? "#ff6f66" : "#6d768a";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = ink;
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = "700 38px system-ui, sans-serif";
    ctx.fillText(r === "UP" ? "▲" : r === "DOWN" ? "▼" : "∅", 0, 14);
    ctx.restore();
    x += 76;
  }

  // footer
  ctx.textAlign = "left";
  ctx.fillStyle = text;
  ctx.font = "700 32px Archivo, system-ui, sans-serif";
  ctx.fillText(input.url.replace(/^https?:\/\//, ""), pad + 56, S - pad - 74);
  ctx.font = "700 26px Archivo, system-ui, sans-serif";
  ctx.fillStyle = dim;
  ctx.textAlign = "right";
  ctx.fillText("play money · testnet", S - pad - 56, S - pad - 74);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export function ShareButton({
  input,
  label = "Share",
  small,
}: {
  input: ShareInput;
  label?: string;
  small?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  async function share() {
    setBusy(true);
    try {
      const blob = await drawShareCard(input);
      const file = new File([blob], "called-it.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: `${input.headline} — ${input.detail}`, url: input.url });
        setSaid("Shared");
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = "called-it.png";
        a.click();
        URL.revokeObjectURL(href);
        await navigator.clipboard?.writeText(input.url).catch(() => undefined);
        setSaid("Image saved, link copied");
      }
    } catch {
      setSaid("Couldn't share that one");
    } finally {
      setBusy(false);
      setTimeout(() => setSaid(""), 2600);
    }
  }

  return (
    <>
      <Btn tone="sky" small={small} block onClick={() => void share()} disabled={busy}>
        {busy ? "Drawing…" : label}
      </Btn>
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = "";
  let cursor = y;
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > max && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lh;
    } else {
      line = next;
    }
  }
  ctx.fillText(line, x, cursor);
}
