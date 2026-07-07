import { isAllowed } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

function redirectTo(path: string, request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (!code || oauthError) {
    return redirectTo("/login?error=oauth", request);
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return redirectTo("/login?error=oauth", request);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  const email = user?.email;

  if (userError || !user || !email) {
    await supabase.auth.signOut();
    return redirectTo("/login?error=oauth", request);
  }

  if (!(await isAllowed(email))) {
    await supabase.auth.signOut();
    return redirectTo("/denied", request);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  if (profileError) {
    await supabase.auth.signOut();
    return redirectTo("/login?error=oauth", request);
  }

  return redirectTo("/", request);
}
