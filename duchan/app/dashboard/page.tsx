"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore, confettiBurst } from "./use-store";
import WhatsNew from "./whats-new";
import type { Order } from "@/lib/types";

// מסך ההזמנות — מסך הבית של הדשבורד.
// "שולם" מנכה מלאי (בפונקציית DB אטומית). "נמסר" מקבל קונפטי — המיקרו-אינטראקציה היחידה.

const PILL: Record<string, { label: string; cls: string }> = {
  sent: { label: "חדש", cls: "bg-[var(--warn-bg)] text-[var(--warn-ink)]" },
  paid: { label: "שולם", cls: "bg-[#E4F3E9] text-[var(--ok-ink)]" },
  delivered: { label: "נמסר", cls: "bg-[var(--sub)] text-[var(--muted)]" },
  cancelled: { label: "בוטל", cls: "bg-[var(--danger-bg)] text-[var(--danger)]" },
};

type Filter = "all" | "sent" | "paid" | "delivered" | "cancelled";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "sent", label: "חדשות" },
  { key: "paid", label: "שולמו" },
  { key: "delivered", label: "נמסרו" },
  { key: "cancelled", label: "בוטלו" },
];

export default function OrdersPage() {
  const { store, loading } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const refresh = useCallback(async () => {
    if (!store) return;
    const supa = supabaseBrowser();
    const { data } = await supa
      .from("orders")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    setOrders((data as Order[]) ?? []);
  }, [store]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  async function markPaid(o: Order) {
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("mark_order_paid", { p_order: o.id });
    if (error) {
      showToast("משהו השתבש, לנסות שוב");
      return;
    }
    showToast("המלאי עודכן");
    refresh();
  }

  async function markDelivered(o: Order, e: React.MouseEvent) {
    const supa = supabaseBrowser();
    await supa.from("orders").update({ status: "delivered" }).eq("id", o.id);
    confettiBurst(e.clientX, e.clientY);
    refresh();
  }

  // ביטול דרך פונקציית DB — אם המלאי כבר נוכה ("שולם"), הוא חוזר אטומית
  async function cancelOrder(o: Order) {
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("cancel_order", { p_order: o.id });
    if (error) {
      showToast("משהו השתבש, לנסות שוב");
      return;
    }
    showToast(o.status === "sent" ? "ההזמנה בוטלה" : "ההזמנה בוטלה והמלאי חזר");
    refresh();
  }

  async function saveOwnerNote(o: Order) {
    const supa = supabaseBrowser();
    await supa.from("orders").update({ owner_note: noteText.trim() || null }).eq("id", o.id);
    setNoteEditId(null);
    refresh();
  }

  const newCount = orders.filter((o) => o.status === "sent").length;
  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);

  // "הקופה שלי" — בתוך גבולות האפיון: ספירת הזמנות וסכומים, לא אנליטיקס
  const sold = orders.filter((o) => o.status === "paid" || o.status === "delivered");
  const revenue = sold.reduce((s, o) => s + o.total, 0);
  const topProduct = (() => {
    const counts = new Map<string, number>();
    sold.forEach((o) => o.items.forEach((it) => counts.set(it.name, (counts.get(it.name) ?? 0) + it.qty)));
    let best: string | null = null;
    let bestQty = 0;
    counts.forEach((qty, name) => {
      if (qty > bestQty) {
        best = name;
        bestQty = qty;
      }
    });
    return best;
  })();

  const checklist = store
    ? [
        { done: true, label: "שם" },
        { done: true, label: "ערכת נושא" },
        { done: !!store.cover_key, label: "תמונת קאבר" },
        { done: !!store.tagline, label: "תיאור הדוכן" },
      ]
    : [];
  const doneCount = checklist.filter((c) => c.done).length;

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store)
    return (
      <div className="p-8 text-center text-sm text-[var(--muted)] leading-relaxed">
        עוד אין לך חנות.
        <br />
        <a href="/onboarding" className="underline text-[var(--ink)]">נפתח אחת ←</a>
      </div>
    );

  const firstName = store.display_name.replace(/^החנות של\s*/, "");

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)] flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold">היי {firstName} 👋</h1>
          <p className="text-xs text-[var(--muted)] font-light">
            {newCount ? `${newCount} הזמנות חדשות` : "הכל מטופל ✨"}
          </p>
        </div>
        <WhatsNew />
      </header>

      {/* החנות עוד לא פורסמה — זה הדבר הראשון שהיא רואה, ולא נעלם עד שמפעילים */}
      {!store.activated_at && (
        <a
          href="/activate"
          className="block mx-3 mt-3 bg-[var(--ink)] text-white p-3.5"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{store.payment_claimed_at ? "⏳" : "🚀"}</span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold">
                {store.payment_claimed_at ? "מחכות לאישור התשלום" : "הדוכן שלך בתצוגה מקדימה"}
              </div>
              <div className="text-[12.5px] opacity-70 leading-relaxed">
                {store.payment_claimed_at
                  ? "קיבלנו את ההודעה. ברגע שנאשר, אפשר יהיה לקבל הזמנות."
                  : "הלינק כבר עובד ואפשר לשלוח אותו. כדי לקבל הזמנות צריך לפרסם →"}
              </div>
            </div>
          </div>
        </a>
      )}

      {/* רשימת השלמה — נעלמת לגמרי כשמסיימים */}
      {doneCount < checklist.length && (
        <div className="mx-3 mt-3 bg-white border border-[var(--line)] p-3 text-xs">
          <div className="flex justify-between font-medium mb-1.5">
            <span>החנות שלך {doneCount} מתוך {checklist.length}</span>
            <span>{"▓".repeat(doneCount)}{"░".repeat(checklist.length - doneCount)}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[var(--muted)]">
            {checklist.map((c) => (
              <span key={c.label}>{c.done ? "✓" : "○"} {c.label}</span>
            ))}
            <a href="/dashboard/settings" className="underline">←</a>
          </div>
        </div>
      )}

      {/* הקופה שלי */}
      {revenue > 0 && (
        <div className="mx-3 mt-3 bg-white border border-[var(--line)] p-3 flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div className="flex-1">
            <div className="text-sm font-bold">₪{revenue} בקופה</div>
            <div className="text-[12px] text-[var(--muted)]">
              {sold.length} הזמנות ששולמו{topProduct ? ` · הכי נמכר: ${topProduct}` : ""}
            </div>
          </div>
        </div>
      )}

      {/* סינון */}
      {orders.length > 0 && (
        <div className="flex gap-1.5 px-3 pt-3 overflow-x-auto">
          {FILTERS.map((f) => {
            const count =
              f.key === "all" ? orders.length : orders.filter((o) => o.status === f.key).length;
            if (f.key !== "all" && count === 0) return null;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-[12px] font-medium whitespace-nowrap border ${
                  filter === f.key
                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                    : "bg-white text-[var(--muted)] border-[var(--line)]"
                }`}
              >
                {f.label} · {count}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-3 flex flex-col gap-2">
        {orders.length === 0 &&
          (store.activated_at ? (
            <div className="text-center py-14 text-sm text-[var(--muted)] leading-loose">
              עוד לא הגיעו הזמנות.
              <br />
              לשלוח את הלינק לחברים 👇
              <br />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/s/${store.slug}`);
                  showToast("הלינק הועתק");
                }}
                className="mt-2 bg-[var(--ink)] text-white px-4 py-2 text-xs"
              >
                העתקת לינק
              </button>
            </div>
          ) : (
            <div className="text-center py-14 text-sm text-[var(--muted)] leading-loose">
              הזמנות יגיעו אחרי שהדוכן יפורסם.
              <br />
              בינתיים אפשר לשלוח את הלינק ולראות מה חברים אומרים ✨
              <br />
              <a
                href="/dashboard/share"
                className="inline-block mt-2 bg-[var(--ink)] text-white px-4 py-2 text-xs"
              >
                שליחה לחברים
              </a>
            </div>
          ))}

        {filtered.length === 0 && orders.length > 0 && (
          <p className="text-center py-8 text-sm text-[var(--muted)]">אין הזמנות בסינון הזה.</p>
        )}

        {filtered.map((o) => (
          <div
            key={o.id}
            className={`bg-white border p-3 ${
              o.status === "paid"
                ? "bg-[var(--ok-bg)] border-[var(--ok-line)]"
                : o.status === "delivered" || o.status === "cancelled"
                  ? "opacity-45 border-[var(--line)]"
                  : "border-[var(--line)]"
            }`}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[12px] text-[var(--muted)]">
                #{o.order_number} · {new Date(o.created_at).toLocaleDateString("he-IL")}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 ${PILL[o.status].cls}`}>
                {PILL[o.status].label}
              </span>
            </div>
            {o.items.map((it, i) => (
              <div key={i} className="text-[13px] py-px">
                • {it.name} × {it.qty} · ₪{it.qty * it.price}
              </div>
            ))}
            {o.buyer_note && (
              <div className="text-[12px] text-[var(--muted)] italic mt-1">"{o.buyer_note}"</div>
            )}

            {/* הערה אישית של בעלת החנות */}
            {noteEditId === o.id ? (
              <div className="flex gap-1.5 mt-1.5">
                <input
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="לארוז בורוד, לתת ביום שלישי…"
                  maxLength={120}
                  autoFocus
                  className="flex-1 border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                />
                <button
                  onClick={() => saveOwnerNote(o)}
                  className="bg-[var(--ink)] text-white px-3 text-[12px] font-medium"
                >
                  שמירה
                </button>
              </div>
            ) : o.owner_note ? (
              <button
                onClick={() => {
                  setNoteEditId(o.id);
                  setNoteText(o.owner_note ?? "");
                }}
                className="block text-right text-[12px] text-[var(--warn-ink)] bg-[var(--warn-bg)] border border-[var(--warn-line)] px-2.5 py-1.5 mt-1.5 w-full"
              >
                📝 {o.owner_note}
              </button>
            ) : (
              o.status !== "cancelled" && (
                <button
                  onClick={() => {
                    setNoteEditId(o.id);
                    setNoteText("");
                  }}
                  className="text-[12px] text-[var(--muted)] underline mt-1.5"
                >
                  📝 הוספת הערה לעצמי
                </button>
              )
            )}

            <div className="flex justify-between text-xs font-medium border-t border-[var(--line)] mt-2 pt-2">
              <span>סה"כ</span>
              <span>₪{o.total}</span>
            </div>
            {o.status === "sent" && (
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => markPaid(o)}
                  className="flex-1 bg-[var(--ink)] text-white py-2 text-xs font-medium"
                >
                  שולם
                </button>
                {/* מספר הקונה נאסף רק אם היא בחרה להשאיר אותו בטופס ההזמנה */}
                {o.buyer_phone ? (
                  <a
                    href={`https://wa.me/${o.buyer_phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-white border border-[var(--line)] py-2 text-xs font-medium text-center"
                  >
                    וואטסאפ לקונה
                  </a>
                ) : (
                  <span
                    className="flex-1 border border-dashed border-[var(--line)] text-[var(--muted)] py-2 text-xs text-center"
                    title="לא הושאר מספר, השיחה כבר קיימת בוואטסאפ, אפשר לחפש שם לפי מספר ההזמנה"
                  >
                    אין מספר
                  </span>
                )}
                <button
                  onClick={() => cancelOrder(o)}
                  className="bg-white border border-[var(--danger-line)] text-[var(--danger)] py-2 px-3 text-xs"
                >
                  ביטול
                </button>
              </div>
            )}
            {o.status === "paid" && (
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={(e) => markDelivered(o, e)}
                  className="flex-1 bg-[var(--ink)] text-white py-2 text-xs font-medium"
                >
                  נמסר
                </button>
                {o.buyer_phone && (
                  <a
                    href={`https://wa.me/${o.buyer_phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white border border-[var(--line)] py-2 px-3 text-xs font-medium text-center"
                  >
                    וואטסאפ
                  </a>
                )}
                <button
                  onClick={() => cancelOrder(o)}
                  className="bg-white border border-[var(--danger-line)] text-[var(--danger)] py-2 px-3 text-xs"
                >
                  ביטול והחזרת מלאי
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
