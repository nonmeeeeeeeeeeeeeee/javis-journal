import { createServiceClient } from "@/lib/supabase/service";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isAllowed(email: string): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const ownerOverrideEmail = process.env.OWNER_OVERRIDE_EMAIL;

  if (
    ownerOverrideEmail &&
    normalizedEmail === normalizeEmail(ownerOverrideEmail)
  ) {
    return true;
  }

  const { data } = await createServiceClient()
    .from("allowed_emails")
    .select("email")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  return Boolean(data);
}
