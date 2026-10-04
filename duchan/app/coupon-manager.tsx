"use client";

import { useState } from "react";
import {
  couponLabel,
  couponStatus,
  couponTerms,
  draftToRow,
  type Coupon,
  type CouponDraft,
} from "@/lib/coupons";

/**
 * ניהול קופונים — אותו מסך אצל המוכרת ("החנות שלי" ← קופונים) ואצל המנהלת (תיק חנות
 * בחמ"ל). מה שמשתנה ביניהם זה רק איך שומרים: המוכרת דרך RLS, המנהלת דרך
 * API מאובטח. לכן הרכיב מקבל את הפעולות מבחוץ.
 *
 * כל פעולה מחזירה null בהצלחה, או הודעה לבן אדם בכישלון.
 */
export default function CouponManager({
  coupons,
  onCreate,
  onToggle,
  onDelete,
  shareUrl,
  adminView = false,
}: {
  coupons: Coupon[];
  onCreate: (row: Record<string, unknown>) => Promise<string | null>;
  onToggle: (c: Coupon, active: boolean) => Promise<string | null>;
  onDelete: (c: Coupon) => Promise<string | null>;
  /** לינק הדוכן — להודעת השיתוף של הקוד. אצל המנהלת לא צריך. */
  shareUrl?: string;
  adminView?: boolean;
}) {
  const EMPTY: CouponDraft = { code: "", kind: "percent", value: "", minTotal: "", maxUses: "", expires: "" };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CouponDraft>(EMPTY);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const set = (patch: Partial<CouponDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError("");
  };

  function randomCode() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let c = "";
    for (let i = 0; i < 6; i++) c += abc[Math.floor(Math.random() * abc.length)];
    set({ code: c });
  }

  async function create() {
    const r = draftToRow(draft);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setBusy("create");
    const err = await onCreate(r.row);
    setBusy(null);
    if (err) {
      setError(err);
      return;
    }
    setDraft(EMPTY);
    setMore(false);
    setOpen(false);
  }

  async function run(id: string, fn: () => Promise<string | null>) {
    setBusy(id);
    setRowError(null);
    const err = await fn();
    setBusy(null);
    if (err) setRowError({ id, msg: err });
  }

  async function copyShare(c: Coupon) {
    const text = `🏷️ קוד הנחה: ${c.code} (${couponLabel(c)})${shareUrl ? `\nבדוכן שלי: ${shareUrl}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(c.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setRowError({ id: c.id, msg: `לא הצלחנו להעתיק. הקוד: ${c.code}` });
    }
  }

  const live = coupons.filter((c) => !c.deleted_at);

  return (
    <div className="flex flex-col gap-3" data-testid="coupon-manager">
      {live.length === 0 && !open && (
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">
          עוד אין קופונים. קופון הוא קוד שהקונים מקלידים בהזמנה ומקבלים הנחה. למשל: תודה לקונים חוזרים, מבצע או חג.
        </p>
      )}

      {live.map((c) => {
        const st = couponStatus(c);
        return (
          <div key={c.id} className="bg-white border border-[var(--line)] p-3.5 flex flex-col gap-2.5" data-testid="coupon-row" data-code={c.code}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {/* bdi: קוד באנגלית או בעברית, כל אחד בכיוון שלו */}
                <div className="text-[16px] font-extrabold tracking-wider">
                  <bdi>{c.code}</bdi>
                </div>
                <div className="text-[13px] font-semibold mt-0.5">{couponLabel(c)}</div>
                <div className="text-[11.5px] text-[var(--muted)] mt-0.5">{couponTerms(c)}</div>
                {c.created_by === "admin" && !adminView && (
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">הקופון נוצר על ידי צוות דוכן</div>
                )}
              </div>
              <span
                className={`shrink-0 text-[11px] font-bold px-2 py-1 ${
                  st.live ? "bg-[var(--ok-bg)] text-[var(--ok-ink)]" : "bg-[var(--canvas)] text-[var(--muted)]"
                }`}
              >
                {st.label}
              </span>
            </div>

            {confirmDelete === c.id ? (
              <div className="flex items-center gap-2 text-[12.5px]">
                <span className="flex-1">למחוק את {c.code}? קונים לא יוכלו להשתמש בו.</span>
                <button
                  onClick={() => run(c.id, async () => { const e = await onDelete(c); if (!e) setConfirmDelete(null); return e; })}
                  disabled={busy === c.id}
                  className="min-h-11 px-3 bg-[var(--danger)] text-white font-bold disabled:opacity-50"
                >
                  כן, למחוק
                </button>
                <button onClick={() => setConfirmDelete(null)} className="min-h-11 px-2 underline text-[var(--muted)]">
                  ביטול
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {shareUrl && st.live && (
                  <button onClick={() => copyShare(c)} className="min-h-11 px-3 border border-[var(--line)] text-[12.5px] font-semibold">
                    {copied === c.id ? "✓ הועתק" : "📋 העתקה לשיתוף"}
                  </button>
                )}
                <button
                  onClick={() => run(c.id, () => onToggle(c, !c.active))}
                  disabled={busy === c.id}
                  aria-label={c.active ? `כיבוי ${c.code}` : `הפעלה ${c.code}`}
                  className="min-h-11 px-3 border border-[var(--line)] text-[12.5px] font-semibold disabled:opacity-50"
                >
                  {c.active ? "כיבוי" : "הפעלה"}
                </button>
                <button
                  onClick={() => setConfirmDelete(c.id)}
                  aria-label={`מחיקה ${c.code}`}
                  className="min-h-11 px-3 border border-[var(--danger-line)] text-[var(--danger)] text-[12.5px]"
                >
                  מחיקה
                </button>
              </div>
            )}
            {rowError?.id === c.id && <p role="alert" className="text-[12px] text-[var(--danger)]">{rowError.msg}</p>}
          </div>
        );
      })}

      {open ? (
        <div className="bg-white border-2 border-[var(--ink)] p-4 flex flex-col gap-4" data-testid="coupon-form">
          <div className="text-[13.5px] font-bold">קופון חדש</div>

          <div>
            <label htmlFor="cp-code" className="block text-[12px] text-[var(--muted)] mb-1.5">
              הקוד שהקונים מקלידים בהזמנה · בעברית או באנגלית
            </label>
            <div className="flex gap-2">
              <input
                id="cp-code"
                value={draft.code}
                onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[׳״'"`]/g, "").replace(/\s+/g, "-") })}
                aria-label="קוד הקופון"
                maxLength={20}
                autoCapitalize="characters"
                placeholder="למשל: חנוכה10 או SALE10"
                className="flex-1 min-w-0 border border-[var(--line)] px-3 py-2.5 text-[14px] tracking-wider"
              />
              <button onClick={randomCode} className="shrink-0 min-h-11 px-3 border border-[var(--line)] text-[12px]">
                🎲 קוד אקראי
              </button>
            </div>
          </div>

          <div>
            <div className="block text-[12px] text-[var(--muted)] mb-1.5">סוג ההנחה</div>
            <div className="grid grid-cols-2 border border-[var(--line)]">
              {(["percent", "amount"] as const).map((k, i) => (
                <button
                  key={k}
                  onClick={() => set({ kind: k })}
                  aria-pressed={draft.kind === k}
                  className={`min-h-11 text-[13px] font-semibold ${i ? "border-r border-[var(--line)]" : ""} ${draft.kind === k ? "bg-[var(--ink)] text-white" : "bg-white"}`}
                >
                  {k === "percent" ? "אחוזים (%)" : "שקלים (₪)"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="cp-value" className="block text-[12px] text-[var(--muted)] mb-1.5">
              {draft.kind === "percent" ? "כמה אחוז הנחה?" : "כמה שקלים הנחה?"}
            </label>
            <input
              id="cp-value"
              value={draft.value}
              onChange={(e) => set({ value: e.target.value.replace(/[^\d.,]/g, "") })}
              inputMode="decimal"
              aria-label="גובה ההנחה"
              placeholder={draft.kind === "percent" ? "למשל: 10" : "למשל: 5"}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-[14px]"
            />
          </div>

          {!more ? (
            <button onClick={() => setMore(true)} className="self-start text-[12.5px] underline text-[var(--muted)] min-h-9">
              + תנאים (לא חובה): סכום מינימום, כמה פעמים אפשר להשתמש, עד מתי
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cp-min" className="block text-[12px] text-[var(--muted)] mb-1.5">רק בהזמנה של לפחות (₪)</label>
                <input id="cp-min" value={draft.minTotal} inputMode="decimal" aria-label="סכום מינימלי"
                  onChange={(e) => set({ minTotal: e.target.value.replace(/[^\d.,]/g, "") })}
                  placeholder="בלי"
                  className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]" />
              </div>
              <div>
                <label htmlFor="cp-uses" className="block text-[12px] text-[var(--muted)] mb-1.5">כמה פעמים אפשר להשתמש</label>
                <input id="cp-uses" value={draft.maxUses} inputMode="numeric" aria-label="מספר שימושים"
                  onChange={(e) => set({ maxUses: e.target.value.replace(/\D/g, "") })}
                  placeholder="בלי הגבלה"
                  className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]" />
              </div>
              <div className="col-span-2">
                <label htmlFor="cp-exp" className="block text-[12px] text-[var(--muted)] mb-1.5">בתוקף עד (כולל)</label>
                <input id="cp-exp" type="date" value={draft.expires} aria-label="תאריך סיום"
                  onChange={(e) => set({ expires: e.target.value })}
                  className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px]" />
              </div>
            </div>
          )}

          {error && <p role="alert" data-testid="coupon-form-error" className="text-[12.5px] text-[var(--danger)]">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={busy === "create"}
              data-testid="coupon-create"
              className="flex-1 min-h-12 bg-[var(--ink)] text-white text-[14px] font-bold disabled:opacity-50"
            >
              {busy === "create" ? "יוצרים…" : "יצירת הקופון"}
            </button>
            <button onClick={() => { setOpen(false); setDraft(EMPTY); setError(""); setMore(false); }}
              className="min-h-12 px-4 border border-[var(--line)] text-[13px]">
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          data-testid="coupon-new"
          className="min-h-12 border-2 border-dashed border-[var(--line)] bg-white text-[13.5px] font-semibold"
        >
          + קופון חדש
        </button>
      )}
    </div>
  );
}
