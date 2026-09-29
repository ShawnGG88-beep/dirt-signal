import { animate } from "motion";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./accessibility";

/**
 * Tweens a numeric reading to its new value (brief: 400ms, ease-out).
 * Under reduced motion the value swaps instantly.
 */
export function useAnimatedNumber(
  value: number | null | undefined,
  durationMs = 400,
): {
  display: number | null;
  justUpdated: boolean;
} {
  const reduceMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState<number | null>(
    value == null || !Number.isFinite(value) ? null : value,
  );
  const [justUpdated, setJustUpdated] = useState(false);
  const prevRef = useRef<number | null>(display);
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const next =
      value == null || !Number.isFinite(value) ? null : value;
    const prev = prevRef.current;

    if (next == null) {
      prevRef.current = null;
      setDisplay(null);
      return;
    }

    if (prev == null || reduceMotion || prev === next) {
      prevRef.current = next;
      setDisplay(next);
      if (prev != null && prev !== next) {
        setJustUpdated(true);
        if (glowTimer.current) clearTimeout(glowTimer.current);
        glowTimer.current = setTimeout(
          () => setJustUpdated(false),
          reduceMotion ? 3000 : 800,
        );
      }
      return;
    }

    setJustUpdated(true);
    if (glowTimer.current) clearTimeout(glowTimer.current);
    glowTimer.current = setTimeout(() => setJustUpdated(false), 800);

    const controls = animate(prev, next, {
      duration: durationMs / 1000,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
      onComplete: () => {
        prevRef.current = next;
        setDisplay(next);
      },
    });

    return () => {
      controls.stop();
    };
  }, [value, durationMs, reduceMotion]);

  useEffect(
    () => () => {
      if (glowTimer.current) clearTimeout(glowTimer.current);
    },
    [],
  );

  return { display, justUpdated };
}
