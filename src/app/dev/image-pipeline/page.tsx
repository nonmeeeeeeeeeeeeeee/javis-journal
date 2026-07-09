import { notFound } from "next/navigation";

import { ImagePipelineHarness } from "./harness";

// Dev-only harness for the M3 image pipeline (Tier-2 owner gate). Blocked on the
// real production site only, so the owner can still exercise it locally and on a
// Vercel preview (branch) deployment from a real phone. It stays behind the normal
// auth gate (the proxy requires a signed-in user) because it uploads real blobs.
export default function ImagePipelinePage() {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return <ImagePipelineHarness />;
}
