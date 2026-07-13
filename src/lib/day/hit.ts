// The day page's hit-testing. The math is shared with the sticker layer (M7) and lives in
// `src/lib/gestures/hit.ts`; this is the day's door onto it, kept so M6's call sites and tests
// read unchanged.

export { hitsBox, topElementAt } from "@/lib/gestures/hit";
