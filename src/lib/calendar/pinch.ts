// The pinch-to-switch decision (US-2/US-3), pulled out as pure math so the M6 **pinch
// isolation** rule is testable: while a day page is open, a two-finger gesture belongs to the
// stamp being scaled, and must NEVER switch the calendar view behind the overlay.
//
// Belt and braces (decision 10): the overlay also stops propagation. A listener detail can be
// broken by a refactor; this state check cannot.

import type { CalendarView } from "./fit";

/** Ratio of the current finger distance to the gesture-start distance. */
export const SPREAD_RATIO = 1.2; // fingers apart → close-up (detail)
export const PINCH_RATIO = 0.83; // fingers together → full-month (overview)

/**
 * The view a pinch of `ratio` should switch to, or null for "do nothing" — which is always the
 * answer while a day is open.
 */
export function pinchDecision(ratio: number, dayOpen: boolean): CalendarView | null {
  if (dayOpen) return null;
  if (ratio > SPREAD_RATIO) return "close-up";
  if (ratio < PINCH_RATIO) return "full-month";
  return null;
}
