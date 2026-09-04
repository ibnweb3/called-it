import type { CSSProperties } from "react";
import logo from "@/assets/logo.png";

/**
 * The brand: a hand-drawn comic burst around "CALLED IT", replacing the plain
 * text wordmark everywhere it appeared — the topbar, the boot screen, the
 * onboarding splash, the desktop hero panel.
 *
 * It idles with the same slow `sign-wobble` a hanging shop sign gets elsewhere
 * in the app, lifts and lists on hover, and squashes into its own drop-shadow
 * on press — the sticker language applied to the one sticker that's actually
 * artwork rather than CSS.
 *
 * Pass `onClick` where the mark is a real control (the topbar sends you back
 * to Play); omit it where it's pure brand decoration (onboarding, the boot
 * screen, the hero panel) and it renders inert — no button, no tab stop, no
 * hover state that promises a click nothing answers.
 *
 * `size` is a fixed pixel value for the fixed-chrome spots (topbar, sheets).
 * Leave it out where the mark should scale with the space around it instead —
 * the desktop hero panel sizes it with a `clamp()` on `.hero .wordmark` in
 * app.css — since an inline size would win over any CSS rule targeting the
 * same custom property.
 */
export function Wordmark({
  size,
  onClick,
  className = "",
}: {
  size?: number;
  onClick?: () => void;
  className?: string;
}) {
  const style = size !== undefined ? ({ "--wm-size": `${size}px` } as CSSProperties) : undefined;

  if (onClick) {
    return (
      <button type="button" className={`wordmark ${className}`} style={style} onClick={onClick} aria-label="Called It — back to Play">
        <img src={logo} alt="" draggable={false} />
      </button>
    );
  }

  return (
    <span className={`wordmark ${className}`} style={style} role="img" aria-label="Called It">
      <img src={logo} alt="" draggable={false} />
    </span>
  );
}
