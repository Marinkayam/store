"use client";

import { useState } from "react";

/**
 * כניסה בלי סמס — לחמ"ל של דוכן.
 *
 * כשהקוד לא מגיע (בקרת הורים, סינון ספאם, חבילה של ילדים שבולעת סמסים),
 * המנהלת מייצרת כאן קישור כניסה חד-פעמי ושולחת אותו בוואטסאפ. הקישור
 * נכנס לאותו חשבון טלפון ונוחת בדשבורד של הדוכן. תקף 24 שעות, פעם אחת.
 *
 * phone — כשהכרטיס יושב בתיק חנות, המספר כבר ממולא.
 */
/** ההודעה בוואטסאפ עם קישור הכניסה — אחת לכל החמ"ל */
export function loginLinkWhatsapp(phone: string, url: string): string {
  const to = phone.replace(/\D/g, "").replace(/^0/, "972");
  const text = `היי! ראינו שהקוד בסמס לא הגיע 🙈\nהנה קישור כניסה לדוכן שלך 🛍️\n${url}\nלוחצים עליו ואז על "להיכנס" — בלי קוד. עובד פעם אחת, ל-24 שעות.`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export default function NoSmsLogin({ phone: initial = "", compact = false }: { phone?: string; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const [phone, setPhone] = useState(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function mint() {
    setBusy(true);
    setUrl("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, for: "store" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.url) {
        setMsg(d?.error ?? "יצירת הקישור נכשלה");
        return;
      }
      setUrl(d.url);
      navigator.clipboard?.writeText(d.url).then(() => setMsg("הקישור הועתק"), () => {});
    } finally {
      setBusy(false);
    }
  }

  const whatsapp = () => window.open(loginLinkWhatsapp(phone, url), "_blank");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="no-sms-open"
        className="border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]"
      >
        🔑 קישור כניסה בלי סמס
      </button>
    );
  }

  return (
    <section className="bg-white border border-[var(--line)] p-3" data-testid="no-sms-login">
      <h2 className="text-sm font-bold">🔑 כניסה בלי סמס</h2>
      <p className="text-[12.5px] text-[var(--muted)] mt-0.5 leading-relaxed">
        הקוד לא מגיע? (בקרת הורים, סינון ספאם.) יוצרים כאן קישור ושולחים בוואטסאפ —
        לוחצים עליו ונכנסים ישר לדוכן, בלי קוד. פעם אחת, 24 שעות.
      </p>
      <div className="flex gap-2 mt-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="מספר טלפון לכניסה בלי סמס"
          placeholder="05X-XXXXXXX"
          inputMode="tel"
          dir="ltr"
          className="flex-1 min-w-0 border border-[var(--line)] px-3 py-2 text-[13.5px]"
        />
        <button
          onClick={mint}
          disabled={busy || phone.replace(/\D/g, "").length < 9}
          data-testid="no-sms-mint"
          className="shrink-0 bg-[var(--ink)] text-white px-3.5 py-2 text-[12.5px] font-bold disabled:opacity-50"
        >
          {busy ? "רגע…" : "ליצור קישור"}
        </button>
      </div>
      {msg && <p role="status" className="text-[12px] text-[var(--muted)] mt-1.5">{msg}</p>}
      {url && (
        <div data-testid="no-sms-result" className="mt-2 border-t border-[var(--line)] pt-2">
          <div className="text-[11.5px] text-[var(--muted)] break-all" dir="ltr">{url}</div>
          <div className="flex gap-2 mt-2">
            <button onClick={whatsapp} className="bg-[#25d366] text-white px-3 py-1.5 text-[12.5px] font-bold">
              לשלוח בוואטסאפ
            </button>
            <button
              onClick={() => navigator.clipboard?.writeText(url).then(() => setMsg("הועתק"), () => {})}
              className="border border-[var(--line)] bg-white px-3 py-1.5 text-[12.5px]"
            >
              להעתיק
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
