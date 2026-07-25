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
    title: data ? data.store.display_name : "החנות סגורה",
    description: data?.store.tagline ?? "חנות קטנה שנבנתה בדוכן",
    robots: { index: false, follow: false },
  };
}

export default async function StorePage({ params }: Props) {
  const { slug } = await params;
  const data = await getPublicStore(slug);

  if (!data) {
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
    </div>
  );
}
