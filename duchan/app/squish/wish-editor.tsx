"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  MAX_WISHES,
  SQUISH_TYPES,
  WISH_COLORS,
  type SquishyType,
  type Wish,
} from "@/lib/squish";

/**
 * עריכת "אני מחפשת".
 *
 * שורה אחת = סוג, צבע ותיאור, וכולם לא חובה — "פתוחה להצעות מיוחדות"
 * הוא ערך לגיטימי בפני עצמו. עד שמונה, כי רשימה ארוכה יותר מפסיקה
 * להיות רשימה של רצונות ומתחילה להיות רעש.
 */
export default function WishEditor({
  wishes,
  profileId,
  onChange,
  onToast,
}: {
  wishes: Wish[];
  profileId: string;
  onChange: (w: Wish[]) => void;
  onToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SquishyType | "">("");
  const [color, setColor] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!type && !color && !desc.trim()) {
      onToast("צריך לפחות סוג, צבע או תיאור");
      return;
    }
    setBusy(true);
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) return setBusy(false);
    const { data, error } = await supa
      .from("squish_wishlist")
      .insert({
        profile_id: profileId,
        owner_user_id: auth.user.id,
        squishy_type: type || null,
        color: color || null,
        description: desc.trim() || null,
        sort_order: wishes.length,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      console.error("[squish] wish failed:", error.message);
      onToast("לא הצלחנו להוסיף, לנסות שוב");
      return;
    }
    onChange([...wishes, data as Wish]);
    setType("");
    setColor("");
    setDesc("");
    setOpen(false);
    onToast("נוסף למבוקשים");
  }

  async function remove(id: string) {
    const supa = supabaseBrowser();
    await supa.from("squish_wishlist").delete().eq("id", id);
    onChange(wishes.filter((w) => w.id !== id));
  }

  return (
    <section>
      {wishes.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-2">
          {wishes.map((w) => (
            <button
              key={w.id}
              onClick={() => remove(w.id)}
              aria-label={`להסיר מהמבוקשים`}
              className="text-[11.5px] text-[var(--muted)] underline"
            >
              להסיר: {[w.description, w.color, w.squishy_type].filter(Boolean)[0]}
            </button>
          ))}
        </div>
      )}

      {wishes.length < MAX_WISHES &&
        (open ? (
          <div className="bg-white border border-[var(--line)] p-3 flex flex-col gap-2">
            <div className="t-small font-medium">מה את מחפשת?</div>
            {/* המילים שלה קודם, והסוג והצבע אחריהן — באותו סדר שבו
                המבוקש ייקרא אחר כך במדף. כשהטקסט היה אחרון, "צפרדע
                גדולה" הופיע בסוף השורה ומה שהוביל אותה היה "כל סוג". */}
            <input
              value={desc}
              maxLength={40}
              aria-label="תיאור מבוקש"
              placeholder="למשל: צפרדע גדולה"
              onChange={(e) => setDesc(e.target.value)}
              className="field w-full px-3 py-2.5 t-small"
            />
            <select
              value={type}
              aria-label="סוג מבוקש"
              onChange={(e) => setType(e.target.value as SquishyType | "")}
              className="field w-full px-3 py-2.5 t-small bg-white"
            >
              <option value="">כל סוג</option>
              {SQUISH_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            <div className="flex gap-1.5 flex-wrap">
              {WISH_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(color === c ? "" : c)}
                  aria-pressed={color === c}
                  className={`px-2.5 py-1.5 text-[12px] border ${
                    color === c ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "border-[var(--line)]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={add} disabled={busy} className="btn btn-primary flex-1 t-small">
                {busy ? "רגע…" : "להוסיף"}
              </button>
              <button onClick={() => setOpen(false)} className="btn btn-secondary px-4 t-small">
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="t-small underline text-[var(--muted)]">
            + להוסיף למה שאני מחפשת
          </button>
        ))}
    </section>
  );
}
