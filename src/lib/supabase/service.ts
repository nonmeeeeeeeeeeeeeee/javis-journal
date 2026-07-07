import { createClient } from "@supabase/supabase-js";

// Server-only: do not import this module from Client Components or browser code.

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createServiceClient() {
  return createClient(
    requireEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      auth: {
        persistSession: false,
      },
    },
  );
}
