"use client";

import { useEffect, useState } from "react";

/**
 * בדיקת העלאה מהדפדפן — הצד שאי אפשר לבדוק מהשרת.
 *
 * העלאה נכשלת כמעט תמיד באחד משני מקומות: או שהשרת לא מצליח לדבר עם
 * האחסון, או שהאחסון חוסם את *הדפדפן* בגלל CORS. השרת לא יכול לראות את
 * החסימה השנייה — היא קורית במכשיר. הדף הזה עושה בדיוק את מה שקורה
 * כשהיא מעלה תמונה, ואומר מה נשבר.
 *
 * מוגן ב-CRON_SECRET שמגיע בכתובת, ולא נוגע בשום חנות: הקובץ נכתב לתיקיית
 * אבחון ונמחק.
 */

type Status = { env: Record<string, string>; endpoint: string; serverWrite: string; publicRead: string;
  browserProbe: { url: string; key: string } | null; error?: string };

export default function UploadDiag() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [browser, setBrowser] = useState<string>("בודקים…");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    setKey(new URLSearchParams(window.location.search).get("key") ?? "");
  }, []);

  useEffect(() => {
    if (!key) return;
    (async () => {
      const res = await fetch(`/api/upload-status?key=${encodeURIComponent(key)}`);
      const data = (await res.json()) as Status;
      setStatus(data);
      if (!data.browserProbe) {
        setBrowser("✗ השרת לא הצליח לייצר כתובת חתומה, הבעיה בשרת, לא בדפדפן");
        return;
      }
      // בדיוק מה שקורה בהעלאה אמיתית: PUT ישיר מהדפדפן אל האחסון
      try {
        const put = await fetch(data.browserProbe.url, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: new Blob([new Uint8Array(8)], { type: "image/webp" }),
        });
        setBrowser(
          put.ok
            ? "✓ הדפדפן מצליח להעלות, ההעלאות אמורות לעבוד"
            : `✗ האחסון החזיר ${put.status}, לא CORS אלא הרשאה או חתימה`
        );
      } catch {
        setBrowser("✗ הדפדפן נחסם. זו הגדרת CORS בדלי, ראי למטה בדיוק מה להדביק");
      }
    })();
  }, [key]);

  const cors = JSON.stringify(
    [
      {
        AllowedOrigins: [origin || "https://duchan.app"],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2
  );

  if (!key) {
    return (
      <main className="min-h-screen p-6 max-w-lg mx-auto">
        <h1 className="text-lg font-bold">בדיקת העלאות</h1>
        <p className="text-[13px] text-[var(--muted)] mt-2">
          צריך להוסיף לכתובת את המפתח:
          <br />
          <code dir="ltr">/diag/upload?key=…</code>
        </p>
      </main>
    );
  }

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex gap-2 border-t border-[var(--line)] py-2 text-[13px] first:border-0">
      <span className="text-[var(--muted)] min-w-32">{label}</span>
      <span className="flex-1">{value}</span>
    </div>
  );

  return (
    <main className="min-h-screen p-5 max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="text-lg font-bold">בדיקת העלאות</h1>

      <section className="bg-white border border-[var(--line)] p-3">
        <h2 className="text-[13px] font-bold mb-1">מהדפדפן, זו הבדיקה שקובעת</h2>
        <p className="text-[14px]">{browser}</p>
      </section>

      {status && (
        <section className="bg-white border border-[var(--line)] p-3">
          <h2 className="text-[13px] font-bold mb-1">מהשרת</h2>
          <Row label="כתיבה לאחסון" value={status.serverWrite} />
          <Row label="קריאה ציבורית" value={status.publicRead} />
          <Row label="כתובת האחסון" value={status.endpoint} />
          {Object.entries(status.env ?? {}).map(([k, v]) => (
            <Row key={k} label={k} value={v} />
          ))}
        </section>
      )}

      {browser.startsWith("✗ הדפדפן נחסם") && (
        <section className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3">
          <h2 className="text-[13px] font-bold text-[var(--warn-ink)]">מה לעשות</h2>
          <p className="text-[12.5px] leading-relaxed mt-1">
            ב-Cloudflare → R2 → הדלי → Settings → CORS Policy → Edit,
            <br />
            למחוק מה שיש ולהדביק בדיוק את זה, ואז Save:
          </p>
          <pre dir="ltr" className="mt-2 bg-white border border-[var(--line)] p-2 text-[12px] overflow-x-auto">
            {cors}
          </pre>
          <button
            onClick={() => navigator.clipboard.writeText(cors)}
            className="mt-2 bg-[var(--ink)] text-white px-3 py-2 text-[12.5px] font-bold"
          >
            העתקה
          </button>
        </section>
      )}
    </main>
  );
}
