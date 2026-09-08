import { useEffect, useRef } from "react";

/**
 * A looping metaballs video behind the whole app. Purely decorative: the deep
 * purple wash + vignette layered over it (`.backdrop::after` in app.css) is what
 * keeps every surface above legible, and the content panels are all opaque, so
 * the video really only shows in the margins and the open space on the front
 * door. Paused entirely under prefers-reduced-motion — the wash alone remains.
 */
export function Backdrop() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // the property some engines honour when the attribute is ignored
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const play = () => void v.play().catch(() => undefined);
    play();
    // resume if the browser parked it (tab hidden, not-ready on first try)
    const onVisible = () => !document.hidden && play();
    document.addEventListener("visibilitychange", onVisible);
    v.addEventListener("canplay", play);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      v.removeEventListener("canplay", play);
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden="true">
      <video
        ref={ref}
        className="backdrop-video"
        src={`${import.meta.env.BASE_URL}bg.mp4`}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        tabIndex={-1}
      />
    </div>
  );
}
