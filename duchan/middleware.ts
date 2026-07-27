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

  /**
   * כתיבה מחדש של עוגיית האימות מהשרת, בכל ניווט.
   *
   * העוגייה של Supabase נכתבת בדפדפן (היא חייבת להיות קריאה לג'אווהסקריפט,
   * כי הדשבורד קורא מוצרים והזמנות ישירות מול RLS). ספארי באייפון מגביל
   * עוגיות שנכתבו מג'אווהסקריפט לשבעה ימים — ITP — בלי קשר לתאריך התפוגה
   * שביקשנו. לכן סשן שנראה כאילו הוא ל-400 יום נמחק בפועל אחרי שבוע,
   * והילדה מתבקשת שוב לקוד בסמס.
   *
   * עוגייה שנשלחת בכותרת Set-Cookie מהשרת לא כפופה לתקרה הזו. כאן אנחנו
   * כותבים אותה מחדש בכל בקשה, כך שהשעון מתאפס כל עוד היא נכנסת לאתר.
   */
  if (user) {
    const YEAR_PLUS = 400 * 24 * 60 * 60;
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-") && c.name.includes("auth-token")) {
        response.cookies.set(c.name, c.value, {
          path: "/",
          maxAge: YEAR_PLUS,
          sameSite: "lax",
          // לא httpOnly בכוונה: הקליינט בדפדפן חייב לקרוא אותה
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
        });
      }
    }
  }

  return response;
}

// רץ על כל עמוד, לא רק על הדשבורד: כל ניווט הוא הזדמנות לרענן את הסשן
// ולכתוב את העוגייה מחדש מהשרת. מוחרגים קבצים סטטיים ו-API, שמנהלים
// את האימות שלהם בעצמם.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icon.svg).*)"],
};
