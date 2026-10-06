"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { useStore, confettiBurst } from "./use-store";
import WhatsNew from "./whats-new";
import InstallCard from "../install-card";
import type { Order } from "@/lib/types";
import { formatPrice, lineTotal, sumPrices } from "@/lib/money";
import { kupaCheck } from "./kupa/use-kupa";
import Icon from "@/app/icons";
import Chevron from "@/app/chevron";
import { storePath } from "@/lib/short-link";
import FirstSteps from "./first-steps";
import WhatsNewBanner from "./whats-new-banner";
import StatsPeek from "./stats-peek";

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
      showToast("לא הצלחנו לסמן ששולם. אפשר לנסות שוב");
      return;
    }
    showToast("סומן ששולם, והכמות במלאי עודכנה");
    refresh();
    kupaCheck(); // מכירה = מטבעות, ואולי אות "המכירה הראשונה"
  }

  async function markDelivered(o: Order, e: React.MouseEvent) {
    const supa = supabaseBrowser();
    await supa.from("orders").update({ status: "delivered" }).eq("id", o.id);
    confettiBurst(e.clientX, e.clientY);
    refresh();
    kupaCheck();
  }

  // ביטול דרך פונקציית DB — אם המלאי כבר נוכה ("שולם"), הוא חוזר אטומית
  async function cancelOrder(o: Order) {
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("cancel_order", { p_order: o.id });
    if (error) {
      showToast("לא הצלחנו לבטל את ההזמנה. אפשר לנסות שוב");
      return;
    }
    showToast(o.status === "sent" ? "ההזמנה בוטלה" : "ההזמנה בוטלה והכמות חזרה למלאי");
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
      showToast("לא הצלחנו להוריד את ההזמנה מהרשימה. אפשר לנסות שוב מאוחר יותר");
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
  const revenue = sumPrices(sold.map((o) => o.total));
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

  /* מה חסר כדי שהדוכן ייראה מוכן — רק מה שבאמת חסר, כל דבר עם הסבר
     ועם כפתור שלוקח בדיוק לשם (מרינה: "3 מתוך 4 לא ברור בכלל") */
  const missing = store
    ? [
        !store.cover_key && {
          key: "cover",
          title: "תמונת קאבר",
          why: "תמונה רחבה בראש הדוכן, כמו שלט. בלעדיה הדוכן נראה ריק.",
          cta: "להוסיף תמונה",
          href: "/dashboard/settings#design",
        },
        !store.tagline?.trim() && {
          key: "about",
          title: "משפט על הדוכן",
          why: "מי מוכר/ת ומה מיוחד בדוכן. קונים אוהבים לדעת ממי הם קונים.",
          cta: "לכתוב משפט",
          href: "/dashboard/settings#design",
        },
      ].filter(Boolean) as { key: string; title: string; why: string; cta: string; href: string }[]
    : [];

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store)
    return (
      <div className="p-8 text-center text-sm text-[var(--muted)] leading-relaxed">
        עוד אין לך דוכן.
        <br />
        <a href="/onboarding" className="underline text-[var(--ink)]">בואו נפתח אחד ←</a>
      </div>
    );

  const link = typeof window !== "undefined" ? `${window.location.origin}${storePath(store.slug)}` : storePath(store.slug);
  const shareText = `פתחתי דוכן! 🛍️ בואו לראות מה יש אצלי:\n${link}`;

  return (
    <div>
      <header className="bg-[var(--canvas)] px-4 pt-5 pb-3 border-b border-[var(--line)] flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-bold">הזמנות</h1>
          <p className="text-[13px] text-[var(--muted)] mt-0.5" data-testid="orders-subtitle">
            {newCount
              ? newCount === 1
                ? "הזמנה חדשה אחת מחכה לטיפול"
                : `${newCount} הזמנות חדשות מחכות לטיפול`
              : orders.length
                ? "אין הזמנות חדשות שמחכות לטיפול"
                : "כאן יופיעו ההזמנות שמגיעות מהדוכן"}
          </p>
        </div>
        <WhatsNew />
      </header>

      {/* מה חדש בדוכן — לדוכנים ותיקים, עד שסוגרים */}
      <WhatsNewBanner createdAt={store.created_at} />
      {/* מי מסתכל — מהרגע שהדוכן פתוח לקונים */}
      {store.activated_at && <StatsPeek storeId={store.id} />}

      {/* החנות עוד לא פורסמה. כשאין הזמנות זה צעד במסלול "ככה הדוכן מתחיל
          לעבוד" למטה, ולכן הבאנר מופיע רק כשכבר יש הזמנות (למשל אחרי ביטול פרסום) */}
      {!store.activated_at && orders.length > 0 && (
        <a
          href="/activate"
          className="block mx-3 mt-3 bg-[var(--ink)] text-white p-3.5"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{store.payment_claimed_at ? "⏳" : "🚀"}</span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold">
                <span data-testid="store-state-banner">{store.payment_claimed_at ? "התשלום בבדיקה" : "הדוכן שלך בתצוגה מקדימה"}</span>
              </div>
              <div className="text-[12.5px] opacity-70 leading-relaxed">
                {store.payment_claimed_at
                  ? "קיבלנו את הדיווח על התשלום. אחרי שנאשר, הדוכן ייפתח להזמנות."
                  : "הלינק כבר עובד ואפשר לשלוח אותו. כדי לקבל הזמנות צריך לפרסם את הדוכן →"}
              </div>
            </div>
          </div>
        </a>
      )}

      {/* מה חסר בדוכן — נעלם כשהכל מוכן. כשאין הזמנות הוא יושב מתחת למסלול */}
      {missing.length > 0 && orders.length > 0 && <Missing missing={missing} />}

      {/* הקופה שלי */}
      {revenue > 0 && (
        <div className="mx-4 mt-4 bg-white border border-[var(--line)] p-4 flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div className="flex-1">
            <div className="text-sm font-bold">₪{formatPrice(revenue)} נכנסו ממכירות</div>
            <div className="text-[12px] text-[var(--muted)]">
              {sold.length === 1 ? "הזמנה אחת ששולמה" : `${sold.length} הזמנות ששולמו`}{topProduct ? ` · הכי נמכר: ${topProduct}` : ""}
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
        <div className="flex gap-2 px-4 pt-4 overflow-x-auto">
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

      <div className="px-4 pt-4 pb-6 flex flex-col gap-4">
        {/* "להוסיף למסך הבית" יושב כאן ולא בהגדרות: זה המסך שהיא פותחת
            הכי הרבה, וזה הרגע שבו כדאי לה שיהיה לזה קיצור. הכרטיס נעלם
            לבד כשהאפליקציה כבר במסך הבית, או כשסוגרים אותו. */}
        {orders.length > 0 && <InstallCard />}

        {/* אין הזמנות: מסלול ברור, צעד אחרי צעד, במקום מסך ריק */}
        {orders.length === 0 && (
          <FirstSteps store={store} link={link} shareText={shareText} onCopied={() => showToast("הלינק הועתק")} />
        )}
        {/* "ואם יש זמן" רק אחרי הפרסום. לפני זה יש משימה אחת — הצעדים שלמעלה. */}
        {orders.length === 0 && missing.length > 0 && store?.activated_at && <Missing missing={missing} optional />}
        {/* בלי הזמנות, ההוספה למסך הבית וההתראות יושבות בצעד 5 של FirstSteps */}

        {filtered.length === 0 && orders.length > 0 && (
          <p className="text-center py-8 text-sm text-[var(--muted)]">אין הזמנות בסינון הזה.</p>
        )}

        {filtered.map((o) => (
          <div
            key={o.id}
            className={`bg-white border p-4 ${
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
                • {it.mystery ? "🎁 " : ""}{it.name}{it.option ? ` (${it.option})` : ""} × {it.qty} · ₪{formatPrice(lineTotal(it.price, it.qty))}
                {/* שקית הפתעה — תזכורת להכין הפתעה, לא לשלוח את מה שבתמונה */}
                {it.mystery && <span className="text-[11px] text-[var(--muted)]" data-testid="order-mystery"> · שקית הפתעה</span>}
              </div>
            ))}
            {o.buyer_note && (
              <div className="text-[12px] text-[var(--muted)] italic mt-1">"{o.buyer_note}"</div>
            )}

            {/* פרטי ההזמנה החדשים (2026-09): ההזמנה כבר לא מגיעה בוואטסאפ,
                אז כל מה שהמוכרת צריכה כדי לטפל בה יושב על הכרטיס עצמו —
                טלפון לחזרה, יעד משלוח, ואיך הקונה מתכוונת לשלם. */}
            {(o.buyer_phone || o.wants_shipping != null || o.pay_method) && (
              <div className="text-[12px] text-[var(--muted)] mt-3 flex flex-col gap-1.5" data-testid="order-details">
                {o.buyer_phone && (
                  <span className="flex items-center gap-2 flex-wrap">
                    <span>
                      📞{" "}
                      {/* המספר שמור מנורמל (972...), בדיוק מה ש-wa.me צריך */}
                      <a dir="ltr" className="underline" href={`https://wa.me/${o.buyer_phone}`}>
                        {displayPhone(o.buyer_phone)}
                      </a>
                    </span>
                    {/* גם המוכרת סוגרת תשלום בוואטסאפ — שיחה שנפתחת עם
                        ההזמנה והסכום, במקום "היי" ריק ומבוכה. */}
                    <a
                      href={`https://wa.me/${o.buyer_phone}?text=${encodeURIComponent(
                        `היי${o.buyer_name ? ` ${o.buyer_name}` : ""}! קיבלתי את ההזמנה שלך (#${o.order_number} · ₪${formatPrice(o.total)}) 💜 אפשר לסגור את התשלום — איך נוח לך?`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11.5px] font-bold px-2 py-1 border border-[var(--line)] bg-white"
                    >
                      💬 לסגור תשלום
                    </a>
                  </span>
                )}
                {o.wants_shipping === true && (
                  <span>📦 משלוח{o.ship_address ? `: ${o.ship_address}, ${o.ship_city ?? ""}` : ""}</span>
                )}
                {o.wants_shipping === false && <span>🤝 מסירה אישית</span>}
                {o.pay_method && (
                  <span>💰 {o.pay_method === "bit" ? "ביט" : o.pay_method === "paybox" ? "פייבוקס" : "מזומן"}</span>
                )}
              </div>
            )}

            {/* מי הזמינה — פתוח לעריכה תמיד, כי לפעמים הקונה כותבת כינוי
                ולפעמים ההזמנה ישנה ואין בה שם בכלל. */}
            {whoEditId === o.id ? (
              <div className="border border-[var(--line)] p-2 mt-1.5 flex flex-col gap-1.5">
                <input
                  value={whoName}
                  onChange={(e) => setWhoName(e.target.value)}
                  placeholder="שם הקונה"
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
                מי הזמין/ה? להוסיף שם
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
                  📝 הערה לעצמי (הקונה לא רואה אותה)
                </button>
              )
            )}

            {o.coupon_code && (
              <div className="flex justify-between text-[12px] text-[var(--muted)] border-t border-[var(--line)] mt-3.5 pt-3" data-testid="order-coupon">
                <span>🏷️ קופון <bdi>{o.coupon_code}</bdi> · לפני הנחה ₪{formatPrice(o.subtotal)}</span>
                <bdi dir="ltr">−₪{formatPrice(o.discount)}</bdi>
              </div>
            )}
            <div className={`flex justify-between text-xs font-medium ${o.coupon_code ? "mt-1.5" : "border-t border-[var(--line)] mt-3.5 pt-3"}`}>
              <span>סה"כ</span>
              <span>₪{formatPrice(o.total)}</span>
            </div>
            {o.status === "sent" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => markPaid(o)}
                  className="flex-1 bg-[var(--ink)] text-white py-2.5 min-h-11 text-xs font-medium"
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
                    className="flex-1 bg-white border border-[var(--line)] py-2.5 min-h-11 text-xs font-medium text-center"
                  >
                    וואטסאפ ל{o.buyer_name ?? "קונה"}
                  </a>
                ) : (
                  <button
                    onClick={() => openWho(o)}
                    className="flex-1 bg-white border border-dashed border-[var(--line)] text-[var(--muted)] py-2.5 min-h-11 text-xs text-center"
                  >
                    להוסיף מספר
                  </button>
                )}
                <button
                  onClick={() => cancelOrder(o)}
                  className="bg-white border border-[var(--danger-line)] text-[var(--danger)] py-2.5 min-h-11 px-3.5 text-xs"
                >
                  ביטול
                </button>
              </div>
            )}
            {o.status === "paid" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={(e) => markDelivered(o, e)}
                  className="flex-1 bg-[var(--ink)] text-white py-2.5 min-h-11 text-xs font-medium"
                >
                  נמסר
                </button>
                {o.buyer_phone && (
                  <a
                    href={`https://wa.me/${o.buyer_phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-white border border-[var(--line)] py-2.5 min-h-11 px-3.5 text-xs font-medium text-center"
                  >
                    וואטסאפ ל{o.buyer_name ?? "קונה"}
                  </a>
                )}
                <button
                  onClick={() => cancelOrder(o)}
                  className="bg-white border border-[var(--danger-line)] text-[var(--danger)] py-2.5 min-h-11 px-3.5 text-xs"
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
                לא בטוחים שההזמנה אמיתית? כדאי לבדוק עם הקונה לפני שמכינים
                אותה.
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
                {o.status === "sent" ? "הזמנה לא אמיתית? להוריד מהרשימה" : "להוריד מהרשימה"}
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

type MissingItem = { key: string; title: string; why: string; cta: string; href: string };

/** מה חסר כדי שהדוכן ייראה מוכן. כשאין הזמנות הוא מתחת למסלול, ומסומן "לא חובה" */
function Missing({ missing, optional = false }: { missing: MissingItem[]; optional?: boolean }) {
  return (
    <section className={optional ? "border-t border-[var(--line)] pt-2" : "mx-4 mt-4 bg-white border border-[var(--line)]"} data-testid="store-missing" aria-labelledby="missing-title">
      <h2 id="missing-title" className={`${optional ? "" : "px-4"} pt-3.5 pb-1 text-[14px] font-bold`}>
        {optional
          ? "ואם יש זמן: לשפר את הדוכן (לא חובה)"
          : missing.length === 1
            ? "נשאר דבר אחד כדי שהדוכן ייראה מוכן"
            : `נשארו ${missing.length} דברים כדי שהדוכן ייראה מוכן`}
      </h2>
      {missing.map((m) => (
        <a key={m.key} href={m.href} className={`flex items-center gap-3 ${optional ? "" : "px-4"} py-3 border-t border-[var(--sand)] first-of-type:border-t-0`} data-testid={`missing-${m.key}`}>
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-bold">{m.title}</span>
            <span className="block text-[12px] text-[var(--muted)] leading-snug mt-0.5">{m.why}</span>
          </span>
          <span className="shrink-0 text-[12.5px] font-bold text-[var(--ink)] flex items-center gap-1">
            {m.cta}
            <Chevron size={14} />
          </span>
        </a>
      ))}
    </section>
  );
}
