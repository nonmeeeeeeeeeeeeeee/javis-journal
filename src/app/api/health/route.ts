import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.HEALTH_PING_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  const authorization = request.headers.get("authorization");
  const isAuthorized = secrets.some(
    (secret) => authorization === `Bearer ${secret}`,
  );

  if (!isAuthorized) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("allowed_emails")
    .select("email")
    .limit(1);

  if (error) {
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok: true });
}
