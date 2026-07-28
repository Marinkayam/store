"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { normalizePhone } from "@/lib/phone";
import { useStore, confettiBurst } from "./use-store";
import WhatsNew from "./whats-new";
import InstallCard from "../install-card";
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
  const [search, setSearch] = useState("");
  // תיוג "מי הזמינה" להזמנות שנוצרו לפני שהשם היה שדה בקופה
  const [whoEditId, setWhoEditId] = useState<string | null>(null);
  const [whoName, setWhoName] = useState("");
  const [whoPhone, setWhoPhone] = useState("");
  // הסתרת הזמנה היא פעולה חד-כיוונית במסך, אז שואלים פעם אחת לפני
  const [confirmHide, setConfirmHide] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!store) return;
    const supa = supabaseBrowser();
    /* הסינון על deleted_at רץ רק אם העמודה קיימת. בלי הנפילה הזו, דאטהבייס
       שעוד לא קיבל את מיגרציה 0024 מחזיר 400 וכל רשימת ההזמנות נעלמת —
       בדיוק סוג התקלה שכבר הפיל פעם את רשימת החנויות בחמ"ל. */
    const { data, error } = await supa
      .from("orders")
      .select("*")
      .eq("store_id", store.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (!error) {
      setOrders((data as Order[]) ?? []);
      return;
    }
    console.error("[orders] deleted_at unavailable, showing everything:", error.message);
    const { data: all } = await supa
      .from("orders")
      .select("*")
      .eq("store_id", store.id)
      .order("created_at", { ascending: false });
    setOrders((all as Order[]) ?? []);
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

  /* הסתרה, לא מחיקה: השורה נשארת בדאטהבייס ובגיבוי, והיא רק יורדת מהמסך.
     מוצע רק על הזמנות שכבר נגמרו — מבוטלת או נמסרה — כדי שלא תיעלם הזמנה
     שעוד מחכה לטיפול. */
  async function hideOrder(o: Order) {
    const supa = supabaseBrowser();
    const { error } = await supa
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", o.id);
    if (error) {
      console.error("[orders] hide failed:", error.message);
      showToast("ההסתרה נכשלה, צריך עדכון דאטהבייס");
      return;
    }
    setConfirmHide(null);
    showToast("ההזמנה ירדה מהרשימה");
    refresh();
  }

  async function saveOwnerNote(o: Order) {
    const supa = supabaseBrowser();
    await supa.from("orders").update({ owner_note: noteText.trim() || null }).eq("id", o.id);
    setNoteEditId(null);
    refresh();
  }

  /**
   * "מי הזמינה" — גם להזמנות ישנות.
   *
   * השם נוסף לקופה במיגרציה 0029, אבל כל ההזמנות שכבר בדאטהבייס נשארו
   * בלי שם. בלי הדרך הזו כל מה שבנינו עוזר רק להזמנות הבאות, ולערימה
   * שיש לה עכשיו — לא.
   */
  async function saveWho(o: Order) {
    const name = whoName.trim().replace(/\s+/g, " ").slice(0, 24);
    const phone = whoPhone.trim() ? normalizePhone(whoPhone.trim()) : null;
    const supa = supabaseBrowser();
    const { error } = await supa
      .from("orders")
      .update({ buyer_name: name || null, buyer_phone: phone })
      .eq("id", o.id);
    if (error) {
      // דאטהבייס שעוד לא קיבל את 0029 — לפחות המספר יישמר
      console.error("[orders] buyer_name unavailable:", error.message);
      await supa.from("orders").update({ buyer_phone: phone }).eq("id", o.id);
    }
    setWhoEditId(null);
    refresh();
  }

  function openWho(o: Order) {
    setWhoEditId(o.id);
    setWhoName(o.buyer_name ?? "");
    setWhoPhone(o.buyer_phone ?? "");
  }

  const newCount = orders.filter((o) => o.status === "sent").length;
  const byStatus = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  /* חיפוש על שם, מספר הזמנה, מוצר והערות. עם הרבה הזמנות זה מה שמחליף
     גלילה ארוכה — והוא סובל גם "7" וגם "#7". */
  const q = search.trim().toLowerCase().replace(/^#/, "");
  const filtered = !q
    ? byStatus
    : byStatus.filter((o) =>
        [
          o.buyer_name ?? "",
          String(o.order_number),
          o.buyer_note ?? "",
          o.owner_note ?? "",
          ...o.items.map((it) => it.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );

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

      {/* חיפוש — מופיע רק כשיש מספיק הזמנות בשביל שיהיה בו טעם */}
      {orders.length >= 5 && (
        <div className="px-3 pt-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, מספר הזמנה או מוצר"
            aria-label="חיפוש בהזמנות"
            className="w-full border border-[var(--line)] bg-white px-3 py-2.5 text-[13px]"
          />
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
        {/* "להוסיף למסך הבית" יושב כאן ולא בהגדרות: זה המסך שהיא פותחת
            הכי הרבה, וזה הרגע שבו כדאי לה שיהיה לזה קיצור. הכרטיס נעלם
            לבד כשהאפליקציה כבר במסך הבית, או כשסוגרים אותו. */}
        <InstallCard />

        {/* למה יש כאן הזמנה שלא הגיעה בוואטסאפ.
            ההזמנה נרשמת ברגע הלחיצה על "שליחה בוואטסאפ", כי רק אז השרת
            מקצה לה מספר ומוסר את מספר הטלפון. מה שקורה אחרי זה — אם
            ההודעה באמת נשלחה — קורה בתוך וואטסאפ, ואף אחד לא מדווח לנו.
            עדיף להסביר את זה פעם אחת מאשר שהיא תארוז הזמנה שלא קיימת. */}
        {newCount > 0 && (
          <div className="border border-[var(--line)] bg-white px-3 py-2.5 text-[12px] text-[var(--muted)] leading-relaxed">
            הזמנה נכנסת לרשימה ברגע שלוחצים "שליחה בוואטסאפ" — <b className="text-[var(--ink)]">גם אם
            ההודעה לא נשלחה בסוף</b>. כדאי לוודא שההודעה הגיעה אלייך בוואטסאפ לפני
            שאורזים, ומה שלא הגיע אפשר להוריד מהרשימה.
          </div>
        )}

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
              {/* השם צמוד למספר ההזמנה ובולט: זה מה שהעין מחפשת כשמנסים
                  להצליב בין הרשימה הזו לשיחות בוואטסאפ. */}
              <span className="text-[12px] text-[var(--muted)]">
                #{o.order_number}
                {o.buyer_name && (
                  <>
                    {" · "}
                    <b className="text-[13px] text-[var(--ink)]">{o.buyer_name}</b>
                  </>
                )}
                {" · "}
                {new Date(o.created_at).toLocaleDateString("he-IL")}
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

            {/* מי הזמינה — פתוח לעריכה תמיד, כי לפעמים הקונה כותבת כינוי
                ולפעמים ההזמנה ישנה ואין בה שם בכלל. */}
            {whoEditId === o.id ? (
              <div className="border border-[var(--line)] p-2 mt-1.5 flex flex-col gap-1.5">
                <input
                  value={whoName}
                  onChange={(e) => setWhoName(e.target.value)}
                  placeholder="השם של מי שהזמינה"
                  aria-label="שם הקונה"
                  maxLength={24}
                  autoFocus
                  className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                />
                <input
                  value={whoPhone}
                  onChange={(e) => setWhoPhone(e.target.value)}
                  placeholder="מספר וואטסאפ (לא חובה)"
                  aria-label="טלפון הקונה"
                  inputMode="tel"
                  maxLength={20}
                  className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={() => saveWho(o)}
                    className="flex-1 bg-[var(--ink)] text-white py-1.5 text-[12px] font-medium"
                  >
                    שמירה
                  </button>
                  <button
                    onClick={() => setWhoEditId(null)}
                    className="border border-[var(--line)] px-3 text-[12px]"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            ) : !o.buyer_name ? (
              <button
                onClick={() => openWho(o)}
                className="text-[12px] text-[var(--warn-ink)] bg-[var(--warn-bg)] border border-[var(--warn-line)] px-2.5 py-1.5 mt-1.5 w-full text-right"
              >
                מי הזמינה? להוסיף שם
              </button>
            ) : null}

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
                {/* מספר הקונה נאסף רק אם היא בחרה להשאיר אותו בטופס ההזמנה.
                    כשאין — כפתור שעושה משהו, במקום שבב מת שכתוב עליו
                    "אין מספר" ואי אפשר ללחוץ עליו. */}
                {o.buyer_phone ? (
                  <a
                    href={`https://wa.me/${o.buyer_phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-white border border-[var(--line)] py-2 text-xs font-medium text-center"
                  >
                    וואטסאפ ל{o.buyer_name ?? "קונה"}
                  </a>
                ) : (
                  <button
                    onClick={() => openWho(o)}
                    className="flex-1 bg-white border border-dashed border-[var(--line)] text-[var(--muted)] py-2 text-xs text-center"
                  >
                    להוסיף מספר
                  </button>
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
                    וואטסאפ ל{o.buyer_name ?? "קונה"}
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

            {/* להוריד מהרשימה — על כל הזמנה, בכל סטטוס.
                הקונה יכולה ללחוץ "שליחה בוואטסאפ" ואז לא לשלוח כלום, וההזמנה
                כבר נרשמה. אין שום דרך לדעת את זה מהצד שלנו — וואטסאפ לא
                מדווח — ולכן היחידה שיודעת שההזמנה לא אמיתית היא היא.
                קודם הכפתור הופיע רק על מבוטלות ונמסרו, אז כדי להיפטר
                מהזמנה שלא קרתה היא הייתה צריכה קודם "לבטל" אותה. */}
            {/* התזכורת יושבת על ההזמנה החדשה עצמה ולא רק בראש המסך, כי
                ההחלטה "לארוז או לא" מתקבלת מול הכרטיס הזה. */}
            {o.status === "sent" && confirmHide !== o.id && (
              <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-2">
                הגיעה אלייך הודעה בוואטסאפ על ההזמנה הזו? אם לא, יכול להיות שהיא
                נלחצה ולא נשלחה.
              </p>
            )}

            {confirmHide === o.id ? (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="flex-1 text-[12px] text-[var(--muted)]">
                  להוריד את ההזמנה מהרשימה?
                </span>
                <button
                  onClick={() => hideOrder(o)}
                  className="bg-[var(--ink)] text-white py-2 px-3 text-xs font-medium"
                >
                  כן, להוריד
                </button>
                <button
                  onClick={() => setConfirmHide(null)}
                  className="bg-white border border-[var(--line)] py-2 px-3 text-xs"
                >
                  לא
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmHide(o.id)}
                className="text-[12px] text-[var(--muted)] underline mt-2"
              >
                {o.status === "sent" ? "ההזמנה לא אמיתית, להוריד" : "להוריד מהרשימה"}
              </button>
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
