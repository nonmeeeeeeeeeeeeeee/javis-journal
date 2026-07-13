import { notFound } from "next/navigation";

import { DayHarness } from "./harness";

// Dev-only harness for the M6 day editor (the owner's Tier-2 gate). Blocked on the real
// production site only, so the owner can still exercise it locally and on a Vercel preview
// (branch) deployment from a real phone.
export default function DayPageHarness() {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return <DayHarness />;
}
