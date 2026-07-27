import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseUrl } from "@/lib/supabase/url";
import { NextResponse, type NextRequest } from "next/server";

// רענון session של Supabase + הגנה על הדשבורד.
// session ארוך (30 יום+) — ההתחברות קורית פעם אחת ואז כמעט אף פעם.

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (all: { name: string; value: string; options: CookieOptions }[]) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = path.startsWith("/dashboard") || path.startsWith("/admin");
  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*", "/login", "/onboarding"],
};
