// Chip — the coin with a face. It is the app's only character, so it does the
// emotional work the copy shouldn't have to: it watches the clock, sweats the
// last seconds, and reacts to the result.
//
// At rest it idles the way the canyon's characters do — a slow head wobble,
// eyes that glance sideways once a loop, and a blink that lasts three frames in
// a hundred. The loops have different lengths so they never fall into step, and
// they all stop under prefers-reduced-motion (styles/app.css).

export type Mood = "idle" | "watching" | "nervous" | "win" | "lose" | "void" | "sleep";

/** The moods that get the idle loops. The reactions hold still and are read. */
const IDLING: Mood[] = ["idle", "watching", "nervous"];

export function Mascot({ mood = "idle", size = 72 }: { mood?: Mood; size?: number }) {
  return (
    <svg
      className={IDLING.includes(mood) ? "mascot" : undefined}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={LABEL[mood]}
      style={{ overflow: "visible", flex: "0 0 auto" }}
    >
      {/* the coin */}
      <circle cx="50" cy="52" r="34" fill="var(--ink)" />
      <circle cx="50" cy="48" r="34" fill="var(--gold)" stroke="var(--ink)" strokeWidth="4" />
      <circle
        cx="50"
        cy="48"
        r="27"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeDasharray="5 5"
        opacity="0.4"
      />
      <Face mood={mood} />
    </svg>
  );
}

const LABEL: Record<Mood, string> = {
  idle: "Chip, waiting",
  watching: "Chip, watching the clock",
  nervous: "Chip, sweating the last seconds",
  win: "Chip, delighted",
  lose: "Chip, dazed",
  void: "Chip, shrugging",
  sleep: "Chip, asleep",
};

function Face({ mood }: { mood: Mood }) {
  const ink = "var(--ink)";

  if (mood === "win") {
    return (
      <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M33 40 l6 6 6-6" />
        <path d="M55 40 l6 6 6-6" />
        <path d="M38 57 q12 12 24 0 q-12 5 -24 0z" fill={ink} />
        <g className="pop-in">
          <path d="M14 22 l3 7 7 3 -7 3 -3 7 -3-7 -7-3 7-3z" fill={ink} stroke="none" />
          <path d="M84 30 l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4-5.6 -5.6-2.4 5.6-2.4z" fill={ink} stroke="none" />
        </g>
      </g>
    );
  }

  if (mood === "lose") {
    return (
      <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M33 40 l10 10 M43 40 l-10 10" />
        <path d="M57 40 l10 10 M67 40 l-10 10" />
        <path d="M40 64 q10 -8 20 0" />
      </g>
    );
  }

  if (mood === "void") {
    return (
      <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M33 44 h11" />
        <path d="M56 44 h11" />
        <path d="M40 62 h20" />
      </g>
    );
  }

  if (mood === "sleep") {
    return (
      <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d="M33 46 q5.5 5 11 0" />
        <path d="M56 46 q5.5 5 11 0" />
        <path d="M43 62 q7 6 14 0" />
        <text x="76" y="20" fontSize="16" fill={ink} stroke="none" fontFamily="var(--font-display)">
          z
        </text>
      </g>
    );
  }

  const nervous = mood === "nervous";
  const watching = mood === "watching";
  const eyeL = watching ? 41 : 38;
  const eyeR = watching ? 63 : 62;

  return (
    <g stroke={ink} strokeWidth="3.5" strokeLinecap="round" fill="none">
      <g className="pupils">
        <circle cx={eyeL} cy="45" r="4.5" fill={ink} stroke="none" />
        <circle cx={eyeR} cy="45" r="4.5" fill={ink} stroke="none" />
      </g>

      {/* the lids sit on top in the coin's own colour and flash shut on blink */}
      <g className="lids">
        <rect x={eyeL - 7} y="37" width="14" height="10" rx="4" fill="var(--gold)" stroke="none" />
        <rect x={eyeR - 7} y="37" width="14" height="10" rx="4" fill="var(--gold)" stroke="none" />
        <path d={`M${eyeL - 6} 45 h12`} strokeWidth="3" />
        <path d={`M${eyeR - 6} 45 h12`} strokeWidth="3" />
      </g>

      {nervous ? (
        <>
          <path d="M32 36 l10 3" />
          <path d="M68 36 l-10 3" />
          <ellipse cx="50" cy="62" rx="7" ry="5" fill={ink} stroke="none" />
          <path d="M80 44 q5 8 0 11 q-5 -3 0 -11z" fill="var(--sky)" stroke={ink} strokeWidth="2.5" className="flame" />
        </>
      ) : (
        <path d="M41 60 q9 7 18 0" />
      )}
    </g>
  );
}
