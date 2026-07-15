import { notFound } from "next/navigation";

import { ExportHarness } from "./harness";

// Dev-only harness for the M9 PNG export (the owner's Tier-2 gate): seed a sample decorated month
// into Dexie, then render the REAL export pipeline to an on-page <img> and a share/download
// button — session-free, so the owner can run it locally or on a Vercel preview from a real phone.
// Blocked on the production site only.
export default function ExportPageHarness() {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return <ExportHarness />;
}
