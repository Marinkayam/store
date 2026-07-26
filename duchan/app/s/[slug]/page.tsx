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

  if (data.state !== "live") {
    return {
      title: data.state === "pending" ? "החנות בהכנה" : "החנות סגורה",
      robots: { index: false, follow: false },
    };
  }

  const title = data.store.display_name;
  const description = data.store.tagline || "חנות קטנה שנבנתה בדוכן";

  // התמונה של הכרטיס בוואטסאפ: הקאבר, ואם אין — תמונת המוצר הראשון.
  // בלי תמונה הלינק נראה כמו טקסט, ואף אחת לא לוחצת עליו.
  const previewKey =
    data.store.cover_key ??
    data.products.find((p) => p.image_key || p.poster_key)?.image_key ??
    data.products.find((p) => p.poster_key)?.poster_key ??
    null;
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const image = previewKey && base ? `${base}/${previewKey}` : undefined;

  return {
    title,
    description,
    // noindex מונע אינדוקס בגוגל; תגיות OpenGraph עדיין עובדות בוואטסאפ.
    // זה בדיוק מה שרוצים — לינק שנראה טוב כששולחים אותו, ולא נמצא בחיפוש.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: "דוכן",
      locale: "he_IL",
      url: `/s/${slug}`,
      // בלי width/height: הקאבר הוא 1200 והמוצר 900, והכרזה על מידות שגויות
      // גורמת לחלק מהצרכנים לחתוך את התמונה. שיימדדו בעצמם.
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
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
      <StoreView store={data.store} products={data.products} bestSellerId={data.bestSellerId} />
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
