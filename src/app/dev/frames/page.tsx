import { notFound } from "next/navigation";

import { FramesHarness } from "./harness";

// Dev-only harness for the M8 frames (the owner's Tier-2 gate): all 3 frames × all 3 scales,
// plus a live framed mini-calendar. Blocked on the real production site only, so the owner can
// still exercise it locally and on a Vercel preview (branch) deployment from a real phone.
export default function FramesPageHarness() {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return <FramesHarness />;
}
