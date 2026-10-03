"use client";

import { useCallback, useEffect, useState } from "react";
import { displayPhone } from "@/lib/phone";
import { loginLinkWhatsapp } from "./no-sms-login";

/**
 * "לא מצליחות להיכנס" — מי שביקשה קוד כמה פעמים ולא נכנסה (72 שעות).
 *
 * לכל שורה: יוצרים קישור כניסה ושולחים בוואטסאפ. כפתור הוואטסאפ הוא
 * קישור רגיל (<a>) ולא window.open אחרי await — בספארי באייפון חלון שנפתח
 * אחרי המתנה לשרת נחסם כחלון קופץ.
 *
 * אחרי שהיא נכנסת (בקוד או בקישור) היא יורדת מהרשימה לבד.
 * כשאין אף אחת — הכרטיס לא מוצג בכלל.
 */

type Stuck = {
  phone: string;
  requests: number;
  wrongCodes: number;
  firstAt: string;
  lastAt: string;
  linkSentAt: string | null;
  store: { name: string; emoji: string } | null;
};

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "עכשיו";
  if (min < 60) return `לפני ${min} דק׳`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "לפני שעה" : `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}

export default function StuckLogins() {
  const [list, setList] = useState<Stuck[] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<{ phone: string; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/stuck-logins", { cache: "no-store" }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    setList(d?.stuck ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function mint(phone: string) {
    setBusy(phone);
    setErr(null);
    try {
      const res = await fetch("/api/admin/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, for: "store" }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.url) {
        setErr({ phone, msg: d?.error ?? "יצירת הקישור נכשלה" });
        return;
      }
      setLinks((m) => ({ ...m, [phone]: d.url }));
    } finally {
      setBusy(null);
    }
  }

  if (!list || list.length === 0) return null;

  return (
    <section className="bg-white border-2 border-[var(--danger)] p-3" data-testid="stuck-logins">
      <h2 className="text-sm font-bold">
        📵 לא מצליחים להיכנס{" "}
        <span className="bg-[var(--danger)] text-white text-[11px] px-1.5 py-0.5 mr-1">{list.length}</span>
      </h2>
      <p className="text-[12.5px] text-[var(--muted)] mt-0.5 leading-relaxed">
        ביקשו קוד כמה פעמים ולא נכנסו — כנראה הסמס לא מגיע (בקרת הורים, סינון ספאם).
        שולחים קישור כניסה בוואטסאפ. מי שנכנס יורד מהרשימה לבד.
      </p>

      <div className="flex flex-col mt-2">
        {list.map((s) => {
          const url = links[s.phone];
          return (
            <div key={s.phone} data-testid="stuck-row" data-phone={s.phone}
              className="border-t border-[var(--line)] py-2.5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-bold" dir="ltr" style={{ textAlign: "right" }}>
                    {displayPhone(s.phone)}
                  </div>
                  <div className="text-[12px] text-[var(--muted)]">
                    {s.store ? `${s.store.emoji} ${s.store.name}` : "עוד בלי דוכן"}
                    {" · "}
                    {s.requests} בקשות קוד
                    {s.wrongCodes > 0 && ` · ${s.wrongCodes} קוד שגוי`}
                    {" · "}
                    {ago(s.lastAt)}
                  </div>
                  {s.linkSentAt && !url && (
                    <div className="text-[11.5px] text-[var(--wood)] mt-0.5" data-testid="stuck-link-sent">
                      🔑 כבר נוצר קישור {ago(s.linkSentAt)} · עוד לא נכנסה
                    </div>
                  )}
                </div>
                {!url && (
                  <button
                    onClick={() => mint(s.phone)}
                    disabled={busy === s.phone}
                    data-testid="stuck-mint"
                    className="shrink-0 bg-[var(--ink)] text-white px-3 py-2 text-[12px] font-bold disabled:opacity-50"
                  >
                    {busy === s.phone ? "רגע…" : s.linkSentAt ? "🔑 קישור חדש" : "🔑 ליצור קישור"}
                  </button>
                )}
              </div>
              {url && (
                <div className="flex gap-2">
                  <a
                    href={loginLinkWhatsapp(s.phone, url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="stuck-whatsapp"
                    onClick={() => setTimeout(load, 1500)}
                    className="flex-1 text-center bg-[var(--whatsapp)] text-white px-3 py-2 text-[12.5px] font-bold"
                  >
                    לשלוח בוואטסאפ
                  </a>
                  <button
                    onClick={() =>
                      navigator.clipboard?.writeText(url).then(() => {
                        setCopied(s.phone);
                        setTimeout(() => setCopied(null), 2000);
                      }, () => {})
                    }
                    className="border border-[var(--line)] bg-white px-3 py-2 text-[12.5px]"
                  >
                    {copied === s.phone ? "✓ הועתק" : "להעתיק"}
                  </button>
                </div>
              )}
              {err?.phone === s.phone && <p role="alert" className="text-[12px] text-[var(--danger)]">{err.msg}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
