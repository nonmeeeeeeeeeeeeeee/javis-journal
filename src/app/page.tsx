import { redirect } from "next/navigation";

import { Calendar } from "@/components/calendar/Calendar";
import { createClient } from "@/lib/supabase/server";

// The calendar home. Thin server component: auth check, then hand off to the client
// island (which owns view + current-month state and opens on the current month).
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <Calendar />;
}
