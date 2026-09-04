// The sticker kit: the handful of shapes every screen is built from.

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Tone = "default" | "gold" | "pop" | "sky" | "ghost";

export function Btn({
  tone = "default",
  small,
  block,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; small?: boolean; block?: boolean }) {
  const toneClass = tone === "default" ? "" : `btn-${tone}`;
  return (
    <button
      type="button"
      className={`btn ${toneClass} ${small ? "btn-sm" : ""} ${block ? "btn-block" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Sticker({
  tilt,
  flat,
  className = "",
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { tilt?: "l" | "r"; flat?: boolean }) {
  return (
    <div
      className={`sticker ${tilt ? `tilt-${tilt}` : ""} ${flat ? "flat" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone?: "up" | "down" | "void" | "gold";
  children: ReactNode;
}) {
  return <span className={`pill ${tone ? `pill-${tone}` : ""}`}>{children}</span>;
}

export function Bubble({
  tone,
  children,
}: {
  tone?: "warn" | "bad";
  children: ReactNode;
}) {
  return <div className={`bubble ${tone ? `bubble-${tone}` : ""}`}>{children}</div>;
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="label">{children}</div>;
}

export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  scroll,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  scroll?: boolean;
}) {
  return (
    <div className={scroll ? "seg-scroll" : ""}>
      <div className="seg" role="group" aria-label={ariaLabel}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A bottom sheet. Escape closes it, focus goes in, background does not scroll. */
export function Sheet({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        {children}
      </div>
    </div>
  );
}

export function Full({ children, label }: { children: ReactNode; label?: string }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="full" role="dialog" aria-modal="true" aria-label={label}>
      <div style={{ width: "min(430px, 100%)" }}>{children}</div>
    </div>
  );
}

export function Spinner({ label = "Working" }: { label?: string }) {
  return (
    <div className="row" style={{ gap: 12 }}>
      <div className="spinner" aria-hidden="true" />
      <span role="status">{label}</span>
    </div>
  );
}

export function Tape({ children }: { children: ReactNode }) {
  return (
    <div className="tape">
      <span>{children}</span>
    </div>
  );
}

export function Skeleton({ height = 90 }: { height?: number }) {
  return <div className="skel" style={{ height }} aria-hidden="true" />;
}
