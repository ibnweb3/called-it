import { useEffect, useRef } from "react";

/**
 * One burst. Not a loop, not ambient — the design brief allows exactly one
 * short celebration per win, and none at all if the player asked for less
 * motion.
 */
export function Confetti({ fire }: { fire: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    ctx.scale(dpr, dpr);

    const colours = ["#ffc53d", "#ff7bac", "#6fd3f7", "#35c77b", "#fff2d8"];
    const bits = Array.from({ length: 90 }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 90,
      y: window.innerHeight * 0.42,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 13 - 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.34,
      size: 6 + Math.random() * 7,
      colour: colours[Math.floor(Math.random() * colours.length)],
    }));

    let frame = 0;
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.42;
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.vr;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.colour;
        ctx.strokeStyle = "#1b1330";
        ctx.lineWidth = 1.5;
        ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.66);
        ctx.strokeRect(-b.size / 2, -b.size / 2, b.size, b.size * 0.66);
        ctx.restore();
      }
      if (++frame < 150) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [fire]);

  if (!fire) return null;
  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
