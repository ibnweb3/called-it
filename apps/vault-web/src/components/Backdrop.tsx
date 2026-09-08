import { useEffect, useRef } from "react";

/**
 * A looping metaballs video behind the whole dashboard. Purely decorative: the
 * deep purple wash + vignette over it (`.backdrop::after` in app.css) keeps the
 * cards and text above legible, and every card is opaque, so the video shows
 * mostly in the margins. Paused under prefers-reduced-motion — the wash remains.
 */
export function Backdrop() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const play = () => void v.play().catch(() => undefined);
    play();
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
