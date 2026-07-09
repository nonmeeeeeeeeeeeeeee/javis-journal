import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function applyAuthCookies(
  response: NextResponse,
  cookiesToSet: CookieToSet[],
  headersToSet: Record<string, string>,
): NextResponse {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headersToSet).forEach(([name, value]) => {
    response.headers.set(name, value);
  });

  return response;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  let authCookiesToSet: CookieToSet[] = [];
  let authHeadersToSet: Record<string, string> = {};

  const supabase = createServerClient(
    requireEnv("SUPABASE_URL", process.env.SUPABASE_URL),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headersToSet) {
          authCookiesToSet = cookiesToSet;
          authHeadersToSet = headersToSet;

          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({ request });
          applyAuthCookies(
            supabaseResponse,
            authCookiesToSet,
            authHeadersToSet,
          );
        },
      },
    },
  );

  const pathname = request.nextUrl.pathname;

  // `/preview` is a dev-only design-tuning page (see src/app/preview/page.tsx).
  // Let it bypass the auth gate in development so it can be viewed locally; it
  // stays gated (and unreachable) in production builds.
  if (process.env.NODE_ENV !== "production" && pathname === "/preview") {
    return supabaseResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && pathname !== "/login") {
    return applyAuthCookies(
      NextResponse.redirect(new URL("/login", request.url)),
      authCookiesToSet,
      authHeadersToSet,
    );
  }

  if (user && pathname === "/login") {
    return applyAuthCookies(
      NextResponse.redirect(new URL("/", request.url)),
      authCookiesToSet,
      authHeadersToSet,
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api/auth/gate|api/health|denied|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
