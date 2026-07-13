"use client";

import { useEffect, useState } from "react";

/**
 * True when the device drives a precise cursor (a mouse/trackpad) rather than a finger.
 *
 * This is the gate for the desktop control clusters. A mouse has no second finger, so pinch
 * (scale) and twist (rotate) are simply unreachable — on desktop we surface them as explicit
 * buttons. The ADR's "no ambient handles" rule was about TOUCH (the fat-thumb problem, and
 * chrome cluttering the composition she is arranging); it does not apply to a cursor, and the
 * buttons never render on a phone.
 *
 * Starts false, so the server render and the first client paint agree (no hydration mismatch);
 * a fine pointer is picked up in the mount effect and tracked live.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const apply = () => setFine(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return fine;
}
