import type { Metadata } from "next";
import { getPublicStore } from "@/lib/store-public";
import { themeCssVars, themeOrDefault } from "@/lib/themes";
import { lookCssVars, lookFontHref } from "@/lib/looks";
import { ACTIVATION_PRICE, DEAL_LABEL, FULL_PRICE, IS_LAUNCH } from "@/lib/pricing";
import StoreView from "./store-view";
import Icon from "@/app/icons";

// דף החנות הפומבי. SSR, נקרא עם service role, שדות מפורשים בלבד.
// noindex בכל דף חנות — אין sitemap, אין אינדוקס.

export const revalidate = 60; // קאשינג קצר, כיתה שלמה בחנות אחת לא מפילה את Supabase

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPublicStore(slug);

  if (data.state === "closed") {
    return { title: "הדוכן סגור", robots: { index: false, follow: false } };
  }

  const title = data.store.display_name;
  const description = data.store.tagline || "דוכן קטן ואמיתי 🛍️";

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
        <Icon name="moon" size={58} tone="var(--cream)" className="text-[var(--wood)] mx-auto" />
        <h1 className="text-xl font-bold">הדוכן סגור כרגע</h1>
        <p className="text-sm text-[var(--muted)]">אולי הלינק השתנה, ואולי היא פשוט נחה.</p>
      </div>
    );
  }

  const theme = themeOrDefault(data.store.theme);
  const fontHref = lookFontHref(data.store.look);

  return (
    <div style={{ ...themeCssVars(theme), ...lookCssVars(theme, data.store.look) } as React.CSSProperties}>
      {/* הגופן של הסגנון נטען רק כשיש סגנון שצריך אותו. בלי precedence בכוונה:
          איתו React ממתין לגיליון, ורשת שחוסמת את גוגל (בית ספר, סינון)
          הופכת לשגיאת JS. בלעדיו — כשל שקט, והטקסט נופל ל-Heebo. */}
      {fontHref && <link rel="stylesheet" href={fontHref} />}
      <StoreView
        store={data.store}
        products={data.products}
        bestSellerId={data.bestSellerId}
        soldIds={data.soldIds}
        hasCoupons={data.hasCoupons}
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
   * רוצה לשאול לפני שהוא נותן לילד/ה להתחיל. ההודעה נושאת את שם הדוכן ואת
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
    `ואני רוצה גם דוכן מכירות כזה` +
    (IS_LAUNCH ? ` (ראיתי שיש ${DEAL_LABEL}: רק ₪${ACTIVATION_PRICE}).` : ".");

  return (
    <div className="bg-[var(--canvas)] border-t border-[var(--line)] px-6 py-8 text-center">
      <Icon name="stall" size={36} tone="var(--cream)" className="text-[var(--wood)] mx-auto" />
      <h2 className="text-[15px] font-bold text-[var(--ink)] mt-2">רוצה גם דוכן מכירות כזה?</h2>
      <p className="text-[12.5px] text-[var(--muted)] mt-1.5 leading-relaxed max-w-xs mx-auto">
        סקווישים שכבר לא בשימוש, צמידים, בגדים שקטנו.
        <br />
        דוכן משלך נבנה בכמה דקות, מהטלפון.
      </p>
      {IS_LAUNCH && (
        <p
          className="fx-shine inline-block text-[12.5px] font-bold mt-3 text-white px-3.5 py-1.5"
          style={{ background: "var(--wood)" }}
        >
          <span className="relative z-[3]">
            <span className="fx-wiggle">🎉</span> {DEAL_LABEL}: רק <bdi>₪{ACTIVATION_PRICE}</bdi> לפתוח דוכן, במקום <bdi className="line-through opacity-75">₪{FULL_PRICE}</bdi>!
          </span>
        </p>
      )}

      {/* פתיחת דוכן היא הפעולה העיקרית — הכפתור הבולט. פנייה בוואטסאפ היא
          לשאלה, ולכן קישור טקסט קטן מתחתיו, לא כפתור מתחרה. */}
      <a
        href={`/?ref=${slug}`}
        className="btn btn-primary inline-block mt-4 px-8 py-3 text-[13.5px]"
      >
        לפתוח דוכן משלך
      </a>

      <a
        href={`https://wa.me/${sales}?text=${encodeURIComponent(msg)}`}
        className="block mt-3 text-[12px] text-[var(--muted)] underline"
      >
        יש לך שאלות? אשמח לענות בוואטסאפ
      </a>
    </div>
  );
}
