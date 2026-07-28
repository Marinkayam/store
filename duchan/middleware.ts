import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseUrl } from "@/lib/supabase/url";
import { NextResponse, type NextRequest } from "next/server";

// רענון session של Supabase + הגנה על הדשבורד.
// session ארוך (30 יום+) — ההתחברות קורית פעם אחת ואז כמעט אף פעם.

export async function middleware(request: NextRequest) {
  /**
   * squish.duchan.app מוגש מאותה אפליקציה ומאותו דיפלוי.
   *
   * rewrite ולא redirect: הכתובת בדפדפן נשארת התת-דומיין, והראוטים
   * יושבים תחת /squish. אותם מסכים נגישים גם ב-duchan.app/squish, וזה
   * מה שמאפשר לפתח ולבדוק לפני שה-DNS מחובר.
   *
   * העוגייה נשארת עוגייה של המארח הנוכחי אלא אם הוגדר במפורש דומיין
   * משותף — ראה COOKIE_DOMAIN למטה. בלי זה, כניסה בתת-דומיין היא כניסה
   * נפרדת, וזו החלטה מודעת ולא תקלה.
   */
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  const squishHost = (process.env.NEXT_PUBLIC_SQUISH_HOST || "squish.duchan.app").toLowerCase();
  if (host.toLowerCase() === squishHost && !request.nextUrl.pathname.startsWith("/squish")) {
    const url = request.nextUrl.clone();
    url.pathname = `/squish${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

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
  const needsAuth =
    path.startsWith("/dashboard") ||
    path.startsWith("/admin") ||
    // מסכי Squish שדורשים חשבון. /squish, /squish/new ו-/squish/c/* פתוחים
    // בכוונה: בונים אוסף לפני שנרשמים, בדיוק כמו בדוכן.
    path.startsWith("/squish/collection") ||
    path.startsWith("/squish/me") ||
    path.startsWith("/squish/trades") ||
    path.startsWith("/squish/discover");
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
          /**
           * ריק כברירת מחדל, ואז העוגייה שייכת למארח הנוכחי בלבד.
           * הגדרת NEXT_PUBLIC_COOKIE_DOMAIN=.duchan.app הופכת אותה
           * למשותפת לדוכן ול-Squish — אבל היא גם עוגייה *אחרת* מזו
           * שקיימת עכשיו בדפדפנים, כלומר כל המשתמשות יתנתקו פעם אחת.
           * לכן זו החלטה מפורשת ולא ברירת מחדל.
           */
          ...(process.env.NEXT_PUBLIC_COOKIE_DOMAIN
            ? { domain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN }
            : {}),
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
