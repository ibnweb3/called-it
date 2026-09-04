import { useEffect, useState } from "react";

/**
 * The headline, played as a four-beat reel that loops forever. Each beat fully
 * replaces the one before it — nothing stacks:
 *
 *   1. "Called it?"                          swipes in from the left, swipes out
 *   2. "Up or down?!"                         pops in, drops out
 *   3. "One tap. Fifteen minutes. …"          types itself out, holds
 *   4. "Dream it. Call it. Prove it."         each phrase pops in, in turn
 *   … then it starts over from 1.
 *
 * `prefers-reduced-motion` shows beat 3 once, settled, and never moves. The
 * whole thing is decorative (`aria-hidden`); a visually-hidden line carries the
 * same words for a screen reader.
 */

// edit these and the reel follows
const BEAT_1 = "Called IT?";
const BEAT_2 = "Up or Down?!";
const TAGLINE = "One tap. Fifteen minutes. Onchain proof.";

// the DreamDEX wink, split into the phrases that pop in one after another.
// swap for e.g. ["Where good", "calls", "come true."] or ["Dreamt it?", "Call it.", "Prove it."]
const DREAM_PHRASES = ["Dream it.", "Call it.", "Prove it."];

const T_BEAT_1 = 1600; // swipe in + hold + swipe out (matches the CSS animation)
const T_BEAT_2 = 1500; // pop in + hold + drop out
const T_CHAR = 42; // typewriter — per character
const T_SPACE = 92; // …slower on spaces / punctuation, for rhythm
const T_SETTLE = 350; // beat after the last character before the tagline "holds"
const T_TAG_HOLD = 1500; // how long the finished tagline sits before beat 4
const T_DREAM_HOLD = 2600; // how long beat 4 sits before the loop restarts

type Phase = "beat1" | "beat2" | "typing" | "tag" | "dream";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function IntroReel() {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<Phase>(reduced ? "tag" : "beat1");
  const [typed, setTyped] = useState(reduced ? TAGLINE.length : 0);

  // the beat clock: beat1 → beat2 → typing → tag → dream → (loop) beat1
  useEffect(() => {
    if (reduced) return;
    let t: number;
    if (phase === "beat1") {
      t = window.setTimeout(() => setPhase("beat2"), T_BEAT_1);
    } else if (phase === "beat2") {
      t = window.setTimeout(() => {
        setTyped(0);
        setPhase("typing");
      }, T_BEAT_2);
    } else if (phase === "tag") {
      t = window.setTimeout(() => setPhase("dream"), T_TAG_HOLD);
    } else if (phase === "dream") {
      t = window.setTimeout(() => setPhase("beat1"), T_DREAM_HOLD);
    }
    return () => window.clearTimeout(t);
  }, [phase, reduced]);

  // the typewriter, then hand off to "tag"
  useEffect(() => {
    if (phase !== "typing") return;
    if (typed >= TAGLINE.length) {
      const done = window.setTimeout(() => setPhase("tag"), T_SETTLE);
      return () => window.clearTimeout(done);
    }
    const slow = /[ .!?]/.test(TAGLINE[typed] ?? "");
    const next = window.setTimeout(() => setTyped((n) => n + 1), slow ? T_SPACE : T_CHAR);
    return () => window.clearTimeout(next);
  }, [phase, typed]);

  const showTagline = phase === "typing" || phase === "tag";

  return (
    <div className="intro-reel">
      <p className="sr-only">
        {BEAT_1} {BEAT_2} {TAGLINE} {DREAM_PHRASES.join(" ")}
      </p>

      <div className="intro-stage" aria-hidden="true">
        {phase === "beat1" && (
          <span key="b1" className="intro-line intro-beat1">
            {BEAT_1}
          </span>
        )}
        {phase === "beat2" && (
          <span key="b2" className="intro-line intro-beat2">
            {BEAT_2}
          </span>
        )}
        {showTagline && (
          <span key="tag" className="intro-line intro-tagline">
            {TAGLINE.slice(0, typed)}
            <span className="intro-caret" data-done={phase === "tag"} />
          </span>
        )}
        {phase === "dream" && (
          <span key="dream" className="intro-line intro-dream">
            {DREAM_PHRASES.map((phrase, i) => (
              <span
                key={i}
                className="intro-dream-word"
                style={{ animationDelay: `${i * 0.24}s` }}
              >
                {phrase}
                {i < DREAM_PHRASES.length - 1 ? " " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
