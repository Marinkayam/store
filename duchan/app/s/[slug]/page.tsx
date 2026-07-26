import type { Metadata } from "next";
import { getPublicStore } from "@/lib/store-public";
import { themeCssVars, themeOrDefault } from "@/lib/themes";
import StoreView from "./store-view";

// דף החנות הפומבי. SSR, נקרא עם service role, שדות מפורשים בלבד.
// noindex בכל דף חנות — אין sitemap, אין אינדוקס.

export const revalidate = 60; // קאשינג קצר — כיתה שלמה בחנות אחת לא מפילה את Supabase

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicStore(slug);
  return {
    title: data.state === "live" ? data.store.display_name : "החנות סגורה",
    description: (data.state === "live" && data.store.tagline) || "חנות קטנה שנבנתה בדוכן",
    robots: { index: false, follow: false },
  };
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicStore(slug);

  // החנות קיימת אבל עוד לא פורסמה. זה לא כישלון — זה "עוד רגע".
  if (data.state === "pending") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F5F6F9] text-center px-8">
        <div className="text-5xl">{data.emoji}</div>
        <h1 className="text-xl font-bold">{data.name} בהכנה</h1>
        <p className="text-sm text-[#7A7D8A] leading-relaxed">
          החנות הזו עוד לא נפתחה רשמית.
          <br />
          שווה לחזור עוד קצת ✨
        </p>
      </div>
    );
  }

  if (data.state === "closed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F5F6F9] text-center px-8">
        <div className="text-5xl">🌙</div>
        <h1 className="text-xl font-bold">החנות סגורה כרגע</h1>
        <p className="text-sm text-[#7A7D8A]">אולי הלינק השתנה, ואולי היא פשוט נחה.</p>
      </div>
    );
  }

  const theme = themeOrDefault(data.store.theme);

  return (
    <div style={themeCssVars(theme) as React.CSSProperties}>
      <StoreView store={data.store} products={data.products} />
      {/* הלולאה: מי שראתה חנות של חברה יכולה לפתוח אחת משלה, והשיוך נשמר */}
      <OpenYourOwn slug={data.store.slug} />
    </div>
  );
}

function OpenYourOwn({ slug }: { slug: string }) {
  return (
    <div className="bg-[#F5F6F9] border-t border-[#E6E7EC] px-6 py-9 text-center">
      <div className="text-3xl">🛍️</div>
      <h2 className="text-[15px] font-bold text-[#15161B] mt-2">גם לך יש דברים למכור</h2>
      <p className="text-[12.5px] text-[#5B5E6B] mt-1.5 leading-relaxed max-w-xs mx-auto">
        סקווישים שכבר לא בשימוש, צמידים שהכנת, בגדים שקטנו.
        <br />
        חנות משלך נבנית בכמה דקות, מהטלפון.
      </p>
      <a
        href={`/?ref=${slug}`}
        className="inline-block mt-4 bg-[#15161B] text-white rounded-xl px-6 py-3 text-[13.5px] font-bold"
      >
        פתחי חנות משלך
      </a>
      <p className="text-[11px] text-[#A2A5B0] mt-3">
        נבנה ב<span className="font-bold">דוכן</span> · חינם לבנייה
      </p>
    </div>
  );
}
