import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? "there";

  return (
    <main>
      <h1>Welcome, {email}.</h1>
      <p>Your calendar arrives in a later milestone.</p>
    </main>
  );
}
