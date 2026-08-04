"use client";

import { useEffect, useState } from "react";

// Picks a random target duration once per mount and reports whether it has
// elapsed. Used to keep the boot screen on-screen for a believable stretch
// regardless of how fast the real work (auth check, etc.) actually
// finishes — a page that "loads" in 40ms doesn't get to skip the animation.
export function useMinimumDelay(minMs: number, maxMs: number): boolean {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const delay = minMs + Math.random() * (maxMs - minMs);
    const timer = setTimeout(() => setDone(true), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return done;
}
