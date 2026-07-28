"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import PhoneVerify from "../phone-verify";
import { supabaseBrowser } from "@/lib/supabase/client";

// כניסה בסמס בלבד. אין סיסמה לזכור ואין מייל להקליד.
//
// מי שנרשמה בעבר במייל נכנסת כאן עם אותו מספר וואטסאפ שרשום בחנות שלה,
// והשרת מחבר את המספר לחשבון הקיים. אין מסך "העברה" ואין מה להסביר לה.

function Login() {
  const params = useSearchParams();

  /**
   * מחוברת? לא מבקשים מספר.
   *
   * הסשן חי בעוגייה ושורד סגירת דפדפן, אבל מסך הכניסה לא בדק אותו — אז מי
   * שהגיעה שוב ללינק ראתה שדה טלפון ריק והסיקה, בצדק, שהמערכת שכחה אותה.
   */
  useEffect(() => {
    supabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) window.location.replace(params.get("next") ?? "/dashboard");
      })
      .catch(() => {});
  }, [params]);

  return (
    <PhoneVerify
      title="כניסה לדוכן"
      subtitle="מקלידים מספר, מקבלים קוד. זהו."
      cta="שלחו לי קוד"
      onVerified={({ hasStore }) => {
        // ניווט מלא ולא router.replace: הסשן נוצר בשרת ונשלח כעוגייה בתשובה
        // של ה-fetch. ניווט צד-לקוח לא טוען מחדש את הקליינט של Supabase,
        // והדשבורד עולה ריק כי הוא עדיין חושב שאף אחת לא מחוברת.
        const next = params.get("next");
        window.location.assign(next ?? (hasStore ? "/dashboard" : "/onboarding"));
      }}
    />
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <div className="text-4xl mb-2">🛍️</div>
      </div>
      <div className="w-full max-w-sm">
        <Suspense>
          <Login />
        </Suspense>
      </div>
      <a href="/" className="text-xs text-[var(--muted)]">
        עוד אין דוכן? <span className="underline">פותחים אחד בדקות</span>
      </a>
      <p className="text-[12px] text-[var(--muted)]">
        <a href="/terms" className="underline">תנאי שימוש</a>
        {" · "}
        <a href="/privacy" className="underline">פרטיות</a>
        {" · "}
        <a href="/accessibility" className="underline">נגישות</a>
      </p>
    </main>
  );
}
