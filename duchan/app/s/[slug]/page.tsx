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

  if (data.state === "closed") {
    return { title: "החנות סגורה", robots: { index: false, follow: false } };
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

  if (data.state === "closed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[var(--canvas)] text-center px-8">
        <div className="text-5xl">🌙</div>
        <h1 className="text-xl font-bold">החנות סגורה כרגע</h1>
        <p className="text-sm text-[var(--muted)]">אולי הלינק השתנה, ואולי היא פשוט נחה.</p>
      </div>
    );
  }

  const theme = themeOrDefault(data.store.theme);

  return (
    <div style={themeCssVars(theme) as React.CSSProperties}>
      <StoreView
        store={data.store}
        products={data.products}
        bestSellerId={data.bestSellerId}
        soldIds={data.soldIds}
        preview={data.state === "preview"}
      />
      {/* הלולאה: מי שראתה חנות של חברה יכולה לפתוח אחת משלה, והשיוך נשמר */}
      <OpenYourOwn slug={data.store.slug} name={data.store.display_name} />
    </div>
  );
}

function OpenYourOwn({ slug, name }: { slug: string; name: string }) {
  /**
   * שתי דרכים להגיע לדוכן משלך, ובכוונה בסדר הזה:
   *
   * דיבור עם מרינה קודם — מי שמגיעה מדוכן של חברה כמעט תמיד ההורה, והוא
   * רוצה לשאול לפני שהוא נותן לילדה להתחיל. ההודעה נושאת את שם הדוכן ואת
   * הקוד שלו, כדי שאפשר יהיה לדעת מאיפה הפנייה הגיעה בלי לשאול.
   *
   * המספר מגיע ממשתנה סביבה עם ברירת מחדל, כדי שהחלפת מספר לא תדרוש
   * שינוי קוד. זה מספר עסקי שנועד להיות גלוי — להבדיל ממספר הוואטסאפ של
   * הילדה, שלעולם אינו יושב ב-HTML.
   */
  const sales = (process.env.NEXT_PUBLIC_SALES_WHATSAPP || "972545888471").replace(/\D/g, "");
  const msg =
    `היי מרינה! 👋\n` +
    `הגעתי מהדוכן "${name}" (${slug}) באתר דוכן,\n` +
    `ואני רוצה גם דוכן מכירות כזה.`;

  return (
    <div className="bg-[var(--canvas)] border-t border-[var(--line)] px-6 py-9 text-center">
      <div className="text-3xl">🛍️</div>
      <h2 className="text-[15px] font-bold text-[var(--ink)] mt-2">רוצה גם דוכן מכירות כזה?</h2>
      <p className="text-[12.5px] text-[var(--muted)] mt-1.5 leading-relaxed max-w-xs mx-auto">
        סקווישים שכבר לא בשימוש, צמידים שהכנת, בגדים שקטנו.
        <br />
        דוכן משלך נבנה בכמה דקות, מהטלפון.
      </p>

      <a
        href={`https://wa.me/${sales}?text=${encodeURIComponent(msg)}`}
        className="inline-block mt-4 bg-[var(--whatsapp)] text-white px-6 py-3 text-[13.5px] font-bold"
      >
        דברי איתי בוואטסאפ
      </a>
      <p className="text-[11.5px] text-[var(--muted)] mt-2">
        מרינה · <span dir="ltr">{sales.replace(/^972/, "0")}</span>
      </p>

      <a
        href={`/?ref=${slug}`}
        className="inline-block mt-4 border border-[var(--line)] bg-white px-6 py-2.5 text-[13px] font-medium"
      >
        פתחי חנות משלך
      </a>

      <p className="text-[11px] text-[var(--faint)] mt-4">
        נבנה ב<span className="font-bold">דוכן</span> · חינם לבנייה
      </p>
    </div>
  );
}
