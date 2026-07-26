"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PhoneVerify from "../phone-verify";

// כניסה בסמס בלבד. אין סיסמה לזכור ואין מייל להקליד.
//
// מי שנרשמה בעבר במייל נכנסת כאן עם אותו מספר וואטסאפ שרשום בחנות שלה,
// והשרת מחבר את המספר לחשבון הקיים. אין מסך "העברה" ואין מה להסביר לה.

function Login() {
  const params = useSearchParams();

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
      <a href="/" className="text-xs text-[#7A7D8A]">
        עוד אין לך חנות? <span className="underline">פותחים אחת בדקות</span>
      </a>
    </main>
  );
}
