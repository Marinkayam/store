import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import ParentControls from "./parent-controls";

// דף בקרת הורה: מגיעים אליו מהלינק שנשלח ב-SMS. הטוקן הוא ההרשאה — אין צורך בחשבון.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ParentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = supabaseAdmin();
  const { data: store } = await db
    .from("stores")
    .select("slug, display_name, emoji, status")
    .eq("parent_token", token)
    .maybeSingle();

  if (!store) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-[#7A7D8A] px-8 text-center">
        הלינק הזה כבר לא בתוקף.
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-4xl">{store.emoji}</div>
      <div>
        <h1 className="text-xl font-bold">{store.display_name}</h1>
        <p className="text-sm text-[#7A7D8A] mt-1 leading-relaxed">
          שלום! קיבלת את הלינק הזה כי המספר שלך הוזן כטלפון של ההורה
          כשהחנות נפתחה בדוכן.
        </p>
      </div>
      <ParentControls token={token} initialStatus={store.status} slug={store.slug} />
      <p className="text-xs text-[#7A7D8A] leading-relaxed max-w-xs">
        דוכן הוא כלי לבניית חנות ולניהול הזמנות בלבד — התשלום והמסירה מסוכמים
        בוואטסאפ, ואין בו איסוף כתובות או פרטים אישיים של קונים.
      </p>
    </main>
  );
}
