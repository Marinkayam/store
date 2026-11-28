"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { useStore, confettiBurst } from "./use-store";
import WhatsNew from "./whats-new";
import InstallCard from "../install-card";
import type { CancelReason, Order } from "@/lib/types";
import StaleOrders, { isStale } from "./stale-orders";
import MonthReport from "./month-report";
import WantedCard from "./wanted-card";
import WeekQuestPeek from "./week-quest-peek";
import AlertsNudge from "./alerts-nudge";
import TikTokEntry from "./tiktok/entry";
import { formatPrice, lineTotal, sumPrices } from "@/lib/money";
import { kupaCheck } from "./kupa/use-kupa";
import Icon from "@/app/icons";
import Chevron from "@/app/chevron";
import { storePath } from "@/lib/short-link";
import FirstSteps from "./first-steps";
import SafetyTips from "./safety-tips";
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

/** ₪4,076.20 — עם מפריד אלפים, ואגורות רק כשיש */
const money = (n: number) =>
  `₪${Number(n).toLocaleString("he-IL", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** "27.10 · 20:27" — שנה רק כשזו לא השנה הנוכחית */
function orderWhen(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = `${d.getDate()}.${d.getMonth() + 1}${sameYear ? "" : `.${String(d.getFullYear()).slice(2)}`}`;
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

const PAY_LABEL: Record<string, string> = { bit: "ביט", paybox: "פייבוקס", cash: "מזומן" };

/* למה מבטלים. מרינה, 11.2026: כמעט חצי מההזמנות בוטלו, ולא ידענו למה.
   לחיצה אחת, בלי להקליד. "רוצים לשנות" פותח עריכה במקום לבטל. */
const CANCEL_REASONS: { key: CancelReason; label: string }[] = [
  { key: "changed", label: "רוצים לשנות משהו בהזמנה" },
  { key: "unpaid", label: "לא שילמו" },
  { key: "sold_out", label: "המוצר נגמר" },
  { key: "not_real", label: "הזמנה לא אמיתית" },
  { key: "other", label: "משהו אחר" },
];
const CANCEL_LABEL: Record<CancelReason, string> = {
  changed: "שינוי בהזמנה",
  unpaid: "לא שילמו",
  sold_out: "המוצר נגמר",
  not_real: "הזמנה לא אמיתית",
  other: "סיבה אחרת",
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
  // ביטול: קודם שואלים למה (שורה של סיבות בכרטיס)
  const [cancelAskId, setCancelAskId] = useState<string | null>(null);
  // עריכה: כמות חדשה לכל שורה, לפי הסדר בהזמנה
  const [editId, setEditId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number[]>([]);
  const [editSaving, setEditSaving] = useState(false);

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
    const { clientX, clientY } = e;
    const supa = supabaseBrowser();
    const { error } = await supa.from("orders").update({ status: "delivered" }).eq("id", o.id);
    if (error) {
      showToast("לא הצלחנו לסמן שנמסר. אפשר לנסות שוב");
      return;
    }
    confettiBurst(clientX, clientY);
    refresh();
    kupaCheck();
  }

  // ביטול דרך פונקציית DB — אם המלאי כבר נוכה ("שולם"), הוא חוזר אטומית
  async function cancelOrder(o: Order, reason: CancelReason) {
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("cancel_order", { p_order: o.id });
    if (error) {
      showToast("לא הצלחנו לבטל את ההזמנה. אפשר לנסות שוב");
      return;
    }
    setCancelAskId(null);
    // הסיבה היא תוספת: אם השמירה שלה נכשלת, הביטול עצמו כבר קרה
    const { error: reasonError } = await supa.from("orders").update({ cancel_reason: reason }).eq("id", o.id);
    if (reasonError) console.error("[orders] cancel_reason:", reasonError.message);
    showToast(o.status === "sent" ? "ההזמנה בוטלה" : "ההזמנה בוטלה והכמות חזרה למלאי");
    refresh();
  }

  function openEdit(o: Order) {
    setCancelAskId(null);
    setEditId(o.id);
    setEditQty(o.items.map((it) => it.qty));
  }

  /* עריכת הזמנה חדשה: רק להוריד כמות או מוצר (0073, edit_order_items).
     השרת מחשב מחדש את הסכום ואת הקופון. */
  async function saveEdit(o: Order) {
    setEditSaving(true);
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("edit_order_items", { p_order: o.id, p_qty: editQty });
    setEditSaving(false);
    if (error) {
      console.error("[orders] edit:", error.message);
      showToast("לא הצלחנו לשנות את ההזמנה. אפשר לנסות שוב");
      return;
    }
    setEditId(null);
    showToast("ההזמנה עודכנה. כדאי לשלוח לקונה את הסכום החדש");
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
    const { error } = await supa.from("orders").update({ owner_note: noteText.trim() || null }).eq("id", o.id);
    if (error) {
      // העורך נשאר פתוח עם מה שהוקלד, כדי שאפשר יהיה לנסות שוב
      showToast("השמירה נכשלה, אפשר לנסות שוב");
      return;
    }
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
    const name = whoName.trim().replace(/\s+/g, " ").slice(0, 40);
    const phone = whoPhone.trim() ? normalizePhone(whoPhone.trim()) : null;
    // מספר שהוקלד ולא תקין לא נשמר כ"בלי מספר": זה היה מוחק את המספר הקיים בשקט
    if (whoPhone.trim() && !phone) {
      showToast("המספר לא נראה תקין. אפשר לבדוק ולנסות שוב");
      return;
    }
    const supa = supabaseBrowser();
    const { error } = await supa
      .from("orders")
      .update({ buyer_name: name || null, buyer_phone: phone })
      .eq("id", o.id);
    if (error) {
      // דאטהבייס שעוד לא קיבל את 0029 — לפחות המספר יישמר
      console.error("[orders] buyer_name unavailable:", error.message);
      const { error: phoneError } = await supa.from("orders").update({ buyer_phone: phone }).eq("id", o.id);
      if (phoneError) {
        showToast("השמירה נכשלה, אפשר לנסות שוב");
        return;
      }
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
  // הסימון על טאב "הזמנות" (layout.tsx) מתעדכן מיד כשמסמנים או מבטלים הזמנה
  useEffect(() => {
    window.dispatchEvent(new Event("duchan-orders-changed"));
  }, [newCount]);
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
          why: "מי אתם ומה מיוחד בדוכן. קונים אוהבים לדעת ממי הם קונים.",
          cta: "לכתוב משפט",
          href: "/dashboard/settings#design",
        },
      ].filter(Boolean) as { key: string; title: string; why: string; cta: string; href: string }[]
    : [];

  if (loading) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store)
    return (
      <div className="p-8 text-center text-sm text-[var(--muted)] leading-relaxed">
        עוד אין לכם דוכן.
        <br />
        <a href="/onboarding" className="underline text-[var(--ink)]">לפתוח דוכן ←</a>
      </div>
    );

  const link = typeof window !== "undefined" ? `${window.location.origin}${storePath(store.slug)}` : storePath(store.slug);
  const shareText = `פתחתי דוכן! 🛍️ בואו לראות מה יש אצלי:\n${link}`;

  return (
    <div>
      <header className="bg-[var(--canvas)] px-gutter pt-6 pb-4 border-b border-[var(--line)] flex items-start justify-between">
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
          className="block mx-gutter mt-3 bg-[var(--ink)] text-white p-3.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[13.5px] font-bold">
                <span data-testid="store-state-banner">{store.payment_claimed_at ? "התשלום בבדיקה" : "הדוכן שלכם בתצוגה מקדימה"}</span>
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

      {/* הקופה שלי — שני מספרים גדולים, ומה הכי נמכר מתחתם */}
      {revenue > 0 && (
        <section className="mx-gutter mt-5 bg-white border border-[var(--line)]" data-testid="orders-summary">
          <div className="grid grid-cols-2">
            <div className="px-4 py-4">
              <div className="text-[22px] font-bold leading-tight">{money(revenue)}</div>
              <div className="text-[12px] text-[var(--muted)] mt-0.5">נכנסו ממכירות</div>
            </div>
            <div className="px-4 py-4 border-r border-[var(--line)]">
              <div className="text-[22px] font-bold leading-tight">{sold.length}</div>
              <div className="text-[12px] text-[var(--muted)] mt-0.5">{sold.length === 1 ? "הזמנה ששולמה" : "הזמנות ששולמו"}</div>
            </div>
          </div>
          {topProduct && (
            <div className="px-4 py-3 border-t border-[var(--line)] text-[12.5px] flex gap-1.5 min-w-0">
              <span className="text-[var(--muted)] shrink-0">הכי נמכר:</span>
              <span className="font-medium truncate">{topProduct}</span>
            </div>
          )}
        </section>
      )}

      {/* החודש בדוכן: סיכום קטן, ולשלוח להורים */}
      <MonthReport orders={orders} storeName={store.display_name} />
      {/* התראה על כל הזמנה, למי שעוד אין לו (alerts-nudge.tsx) */}
      {store.activated_at && orders.length > 0 && <AlertsNudge storeId={store.id} />}
      {/* משימת השבוע מהמשחק, גם כאן (week-quest-peek.tsx) */}
      {store.activated_at && <WeekQuestPeek storeId={store.id} />}
      {/* מוצרים שאזלו ואנשים ניסו לקנות (0075) */}
      {store.activated_at && <WantedCard storeId={store.id} />}
      {store.activated_at && orders.length > 0 && (
        <div className="mx-gutter mt-4">
          <TikTokEntry />
        </div>
      )}

      {/* חיפוש — מופיע רק כשיש מספיק הזמנות בשביל שיהיה בו טעם */}
      {orders.length >= 5 && (
        <div className="px-gutter pt-5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, מספר הזמנה או מוצר"
            aria-label="חיפוש בהזמנות"
            className="w-full border border-[var(--line)] bg-white px-3.5 py-3 text-[13.5px]"
          />
        </div>
      )}

      {/* סינון */}
      {orders.length > 0 && (
        <div className="flex gap-2.5 px-gutter pt-5 overflow-x-auto">
          {FILTERS.map((f) => {
            const count =
              f.key === "all" ? orders.length : orders.filter((o) => o.status === f.key).length;
            if (f.key !== "all" && count === 0) return null;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3.5 py-2 text-[12.5px] font-medium whitespace-nowrap border ${
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

      <div className="px-gutter pt-5 pb-8 flex flex-col gap-5">
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

        {/* הזמנות שמחכות כבר כמה ימים: "קיבלתם כסף?" בלחיצה אחת */}
        {filter === "all" && !q && (
          <StaleOrders
            orders={orders.filter((o) => isStale(o))}
            onPaid={(o) => markPaid(o)}
            onUnpaid={(o) => cancelOrder(o, "unpaid")}
          />
        )}

        {/* תזכורת אחת לכל הרשימה, לא בכל כרטיס. ההחלטה "לארוז או לא" נשארת
            אצלה, אבל לא צריך לקרוא את אותו משפט עשר פעמים. */}
        {orders.some((o) => o.status === "sent") && (
          <SafetyTips storeId={store.id} />
        )}

        {filtered.map((o) => {
          const done = o.status === "delivered" || o.status === "cancelled";
          // הודעת וואטסאפ אחת, עם ההזמנה והסכום — לא "היי" ריק
          const wa = o.buyer_phone
            ? `https://wa.me/${o.buyer_phone}?text=${encodeURIComponent(
                o.status === "sent"
                  ? `היי${o.buyer_name ? ` ${o.buyer_name}` : ""}! קיבלתי את ההזמנה שלך (#${o.order_number} · ₪${formatPrice(o.total)}) 💜 אפשר לסגור את התשלום — איך נוח לך?`
                  : `היי${o.buyer_name ? ` ${o.buyer_name}` : ""}! לגבי ההזמנה #${o.order_number} 💜`
              )}`
            : null;
          return (
          <article
            key={o.id}
            className={`border ${
              o.status === "paid"
                ? "bg-[var(--ok-bg)] border-[var(--ok-line)]"
                : done
                  ? /* נמסר/בוטל: רקע שקט במקום שקיפות — שקיפות הורידה את הטקסט
                       מתחת לניגודיות קריאה (axe: 2.3:1) */
                    "bg-[var(--sub)] border-[var(--line)]"
                  : "bg-white border-[var(--line)]"
            }`}
            data-testid="order-card"
          >
            {/* מי ומתי — השם הוא מה שהעין מחפשת מול השיחות בוואטסאפ */}
            <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3.5">
              <div className="min-w-0">
                <div className="text-[16px] font-bold leading-snug truncate">{o.buyer_name || (o.pii_purged_at ? "קונה" : "בלי שם")}</div>
                <div className="text-[12px] text-[var(--muted)] mt-0.5">
                  <bdi>#{o.order_number}</bdi> · <bdi>{orderWhen(o.created_at)}</bdi>
                  {o.edited_at && <span data-testid="order-edited"> · שונתה</span>}
                </div>
                {o.status === "cancelled" && o.cancel_reason && (
                  <div className="text-[12px] text-[var(--muted)] mt-0.5" data-testid="order-cancel-reason">
                    בוטלה: {CANCEL_LABEL[o.cancel_reason]}
                  </div>
                )}
              </div>
              <span className={`shrink-0 text-[11.5px] font-bold px-2 py-1 ${PILL[o.status].cls}`}>{PILL[o.status].label}</span>
            </header>

            {/* מה הזמינו — כמות, שם, צבע/מידה, ומחיר בצד */}
            {editId === o.id ? (
              <EditItems
                order={o}
                qty={editQty}
                onChange={setEditQty}
                saving={editSaving}
                onSave={() => saveEdit(o)}
                onCancel={() => setEditId(null)}
              />
            ) : (
            <ul className="border-t border-[var(--line)] px-4">
              {o.items.map((it, i) => {
                const full = lineTotal(it.price, it.qty);
                const paid = it.line ?? full;
                return (
                  <li key={i} className="flex items-start gap-3 py-3 border-b border-[var(--sand)] last:border-b-0">
                    <span className="shrink-0 min-w-8 text-center text-[12.5px] font-bold bg-[var(--sub)] px-1.5 py-0.5 mt-px">
                      {it.qty}×
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium leading-snug">{it.name}</div>
                      {(it.option || it.deal || it.mystery) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[12px] text-[var(--muted)]">
                          {it.option && <span>{it.option}</span>}
                          {it.deal && (
                            <span className="font-bold text-[var(--warn-ink)] bg-[var(--warn-bg)] px-1.5 py-px" data-testid="order-deal">
                              מבצע <bdi>{it.deal}</bdi>
                            </span>
                          )}
                          {/* שקית הפתעה — תזכורת להכין הפתעה, לא לשלוח את מה שבתמונה */}
                          {it.mystery && <span data-testid="order-mystery">שקית הפתעה</span>}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-left">
                      <div className="text-[14px] font-bold">₪{formatPrice(paid)}</div>
                      {paid < full && <s className="block text-[11.5px] text-[var(--faint)]">₪{formatPrice(full)}</s>}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
            {o.status === "sent" && editId !== o.id && (
              <div className="px-4 pb-2 -mt-1">
                <button onClick={() => openEdit(o)} className="text-[12px] underline text-[var(--muted)] min-h-9" data-testid="order-edit">
                  לשנות כמות או להוריד מוצר
                </button>
              </div>
            )}

            {o.is_gift && (
              <p className="mx-4 mb-2 px-3 py-2 bg-[var(--warn-bg)] text-[var(--warn-ink)] text-[12.5px] font-medium" data-testid="order-gift">
                זו מתנה: לארוז יפה, ובלי מחיר בשקית
              </p>
            )}
            {o.buyer_note && (
              <p className="mx-4 mb-3 px-3 py-2 bg-[var(--sub)] text-[12.5px] leading-relaxed">
                <span className="text-[var(--muted)]">הערה מהקונה: </span>{o.buyer_note}
              </p>
            )}

            {/* איך זה מגיע אליה ואיך משלמים — שורה לכל דבר, עם תווית */}
            {(o.buyer_phone || o.wants_shipping != null || o.pay_method) && (
              <dl className="border-t border-[var(--line)] px-4 py-3.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]" data-testid="order-details">
                {o.buyer_phone && (
                  <>
                    <dt className="text-[var(--muted)]">טלפון</dt>
                    <dd>
                      {/* המספר שמור מנורמל (972...), בדיוק מה ש-wa.me צריך */}
                      <a dir="ltr" className="underline" href={`https://wa.me/${o.buyer_phone}`}>{displayPhone(o.buyer_phone)}</a>
                    </dd>
                  </>
                )}
                {o.wants_shipping != null && (
                  <>
                    <dt className="text-[var(--muted)]">{o.wants_shipping ? "משלוח" : "מסירה"}</dt>
                    <dd className="min-w-0">
                      {o.wants_shipping ? (o.ship_address ? `${o.ship_address}, ${o.ship_city ?? ""}` : "משלוח") : "איסוף מהדוכן"}
                    </dd>
                  </>
                )}
                {o.pay_method && (
                  <>
                    <dt className="text-[var(--muted)]">תשלום</dt>
                    <dd>{PAY_LABEL[o.pay_method] ?? o.pay_method}</dd>
                  </>
                )}
              </dl>
            )}

            <div className="px-4 [&:not(:empty)]:pb-3">
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
            ) : o.pii_purged_at ? (
              /* פרטי הקונה נמחקו אחרי תקופת השמירה (0071). ההזמנה עצמה נשארת,
                 ואי אפשר להוסיף אותם מחדש */
              <p className="text-[12px] text-[var(--muted)] mt-1.5" data-testid="order-purged">
                פרטי הקונה נמחקו. מה שנמכר והסכום נשארים.
              </p>
            ) : !o.buyer_name ? (
              <button
                onClick={() => openWho(o)}
                className="text-[12px] text-[var(--warn-ink)] bg-[var(--warn-bg)] border border-[var(--warn-line)] px-2.5 py-1.5 mt-1.5 w-full text-right"
              >
                להוסיף את שם הקונה
              </button>
            ) : null}

            </div>

            {/* הסכום */}
            <div className="border-t border-[var(--line)] px-4 py-3.5">
              {o.coupon_code && (
                <div className="flex justify-between text-[12px] text-[var(--muted)] mb-1.5" data-testid="order-coupon">
                  <span>קופון <bdi>{o.coupon_code}</bdi> · לפני הנחה ₪{formatPrice(o.subtotal)}</span>
                  <bdi dir="ltr">−₪{formatPrice(o.discount)}</bdi>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-[13px] font-bold">סה"כ</span>
                <span className="text-[18px] font-bold">₪{formatPrice(o.total)}</span>
              </div>
            </div>

            {/* פעולות: אחת ראשית, וואטסאפ אחד (עם ההודעה), וביטול קטן בצד */}
            {(o.status === "sent" || o.status === "paid") && (
              <div className="flex gap-2.5 px-4 pb-4">
                <button
                  onClick={(e) => (o.status === "sent" ? markPaid(o) : markDelivered(o, e))}
                  className="flex-1 bg-[var(--ink)] text-white py-2.5 min-h-11 text-[13px] font-bold"
                >
                  {o.status === "sent" ? "שולם" : "נמסר"}
                </button>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-[var(--line)] py-2.5 min-h-11 text-[13px] font-medium text-center"
                  >
                    <Icon name="chat" size={15} tone="none" />
                    וואטסאפ ל{o.buyer_name ?? "קונה"}
                  </a>
                ) : (
                  <button
                    onClick={() => openWho(o)}
                    className="flex-1 bg-white border border-dashed border-[var(--line)] text-[var(--muted)] py-2.5 min-h-11 text-[13px] text-center"
                  >
                    להוסיף מספר
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditId(null);
                    setCancelAskId(cancelAskId === o.id ? null : o.id);
                  }}
                  aria-expanded={cancelAskId === o.id}
                  className="bg-white border border-[var(--danger-line)] text-[var(--danger)] py-2.5 min-h-11 px-3.5 text-[13px]"
                  data-testid="order-cancel"
                >
                  ביטול
                </button>
              </div>
            )}
            {cancelAskId === o.id && (o.status === "sent" || o.status === "paid") && (
              <div className="mx-4 mb-4 border border-[var(--line)] bg-[var(--sub)] p-3" data-testid="cancel-reasons">
                <p className="text-[13px] font-bold mb-2">למה מבטלים?</p>
                <div className="flex flex-col gap-1.5">
                  {CANCEL_REASONS.filter((r) => r.key !== "changed" || o.status === "sent").map((r) => (
                    <button
                      key={r.key}
                      onClick={() => (r.key === "changed" ? openEdit(o) : cancelOrder(o, r.key))}
                      className="bg-white border border-[var(--line)] text-right px-3 py-2.5 min-h-11 text-[13px]"
                      data-testid={`cancel-${r.key}`}
                    >
                      {r.label}
                      {r.key === "changed" && (
                        <span className="block text-[11.5px] text-[var(--muted)] mt-0.5">אפשר להוריד מוצר או כמות בלי לבטל את כל ההזמנה</span>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={() => setCancelAskId(null)} className="mt-2 text-[12px] underline text-[var(--muted)] min-h-9">
                  לא לבטל
                </button>
              </div>
            )}

            {/* הערה לעצמי + להוריד מהרשימה — קטנים, בשורה אחת בתחתית.
                הקונה יכולה ללחוץ "הזמנה" ולא להתכוון, ורק בעלת הדוכן יודעת. */}
            <div className="border-t border-[var(--sand)] px-4 py-3">
              {noteEditId === o.id ? (
                <div className="flex gap-1.5 py-1">
                  <input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="רק אתם רואים את זה. למשל: לארוז בוורוד"
                    maxLength={120}
                    autoFocus
                    className="flex-1 border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                  />
                  <button onClick={() => saveOwnerNote(o)} className="bg-[var(--ink)] text-white px-3 text-[12px] font-medium">
                    שמירה
                  </button>
                </div>
              ) : o.owner_note ? (
                <button
                  onClick={() => {
                    setNoteEditId(o.id);
                    setNoteText(o.owner_note ?? "");
                  }}
                  className="block w-full text-right text-[12px] text-[var(--warn-ink)] bg-[var(--warn-bg)] border border-[var(--warn-line)] px-2.5 py-1.5 my-1"
                >
                  {o.owner_note}
                </button>
              ) : null}

              {confirmHide === o.id ? (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="flex-1 text-[12px] text-[var(--muted)]">להוריד את ההזמנה מהרשימה?</span>
                  <button onClick={() => hideOrder(o)} className="bg-[var(--ink)] text-white min-h-10 px-3.5 text-xs font-medium">
                    כן, להוריד
                  </button>
                  <button onClick={() => setConfirmHide(null)} className="bg-white border border-[var(--line)] min-h-10 px-3.5 text-xs">
                    לא
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--muted)]">
                  {!o.owner_note && noteEditId !== o.id && o.status !== "cancelled" && !o.pii_purged_at ? (
                    <button
                      onClick={() => {
                        setNoteEditId(o.id);
                        setNoteText("");
                      }}
                      className="underline min-h-11 inline-flex items-center"
                    >
                      הערה לעצמי
                    </button>
                  ) : <span />}
                  <button onClick={() => setConfirmHide(o.id)} className="underline min-h-11 inline-flex items-center">
                    {o.status === "sent" ? "הזמנה לא אמיתית? להוריד" : "להוריד מהרשימה"}
                  </button>
                </div>
              )}
            </div>
          </article>
          );
        })}
      </div>

      {/* מה חסר בדוכן — למטה, אחרי ההזמנות: זה שיפור, לא משימה דחופה */}
      {missing.length > 0 && orders.length > 0 && <Missing missing={missing} />}

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
    <section className={optional ? "border-t border-[var(--line)] pt-2" : "mx-gutter mt-4 bg-white border border-[var(--line)]"} data-testid="store-missing" aria-labelledby="missing-title">
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

/** עריכת הזמנה חדשה: מורידים כמות או מוצר. מבצע יורד רק בשלמותו. */
function EditItems({
  order,
  qty,
  onChange,
  saving,
  onSave,
  onCancel,
}: {
  order: Order;
  qty: number[];
  onChange: (q: number[]) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (i: number, v: number) => onChange(qty.map((q, j) => (j === i ? v : q)));
  const lines = order.items.map((it, i) =>
    qty[i] === it.qty ? (it.line ?? lineTotal(it.price, it.qty)) : lineTotal(it.price, qty[i])
  );
  const sum = sumPrices(lines);
  const empty = qty.every((q) => q === 0);
  const same = qty.every((q, i) => q === order.items[i].qty);
  return (
    <div className="border-t border-[var(--line)] px-4 pt-3 pb-3.5" data-testid="order-edit-panel">
      <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mb-2">
        אפשר רק להוריד. אם הקונה רוצה עוד, אפשר לבקש שיזמינו שוב.
      </p>
      <ul>
        {order.items.map((it, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--sand)] last:border-b-0">
            <div className="flex-1 min-w-0">
              <div className={`text-[14px] font-medium leading-snug ${qty[i] === 0 ? "line-through text-[var(--faint)]" : ""}`}>{it.name}</div>
              {(it.option || it.deal) && (
                <div className="text-[12px] text-[var(--muted)] mt-0.5">
                  {it.option}
                  {it.option && it.deal ? " · " : ""}
                  {it.deal && <>מבצע <bdi>{it.deal}</bdi></>}
                </div>
              )}
            </div>
            {it.deal ? (
              /* חלק ממבצע זה כבר מחיר אחר, אז השורה יורדת או נשארת בשלמותה */
              <button
                onClick={() => set(i, qty[i] === 0 ? it.qty : 0)}
                className="shrink-0 border border-[var(--line)] bg-white px-3 min-h-10 text-[12.5px]"
              >
                {qty[i] === 0 ? "להחזיר" : "להוריד"}
              </button>
            ) : (
              <div className="shrink-0 flex items-center border border-[var(--line)] bg-white" data-testid="edit-stepper">
                <button
                  onClick={() => set(i, Math.max(0, qty[i] - 1))}
                  disabled={qty[i] === 0}
                  aria-label={`פחות ${it.name}`}
                  className="w-10 h-10 text-[18px] disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-7 text-center text-[14px] font-bold" aria-live="polite">{qty[i]}</span>
                <button
                  onClick={() => set(i, Math.min(it.qty, qty[i] + 1))}
                  disabled={qty[i] >= it.qty}
                  aria-label={`עוד ${it.name}`}
                  className="w-10 h-10 text-[18px] disabled:opacity-30"
                >
                  +
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-between items-baseline pt-3">
        <span className="text-[13px] font-bold">סה"כ חדש</span>
        <span className="text-[17px] font-bold" data-testid="edit-sum">₪{formatPrice(sum)}</span>
      </div>
      {order.coupon_code && !empty && (
        <p className="text-[12px] text-[var(--muted)] mt-1">הקופון יחושב מחדש על הסכום החדש.</p>
      )}
      {empty && (
        <p className="text-[12px] text-[var(--danger)] mt-1">כדי להוריד הכול, מבטלים את ההזמנה.</p>
      )}
      <div className="flex gap-2.5 mt-3">
        <button
          onClick={onSave}
          disabled={empty || same || saving}
          className="flex-1 bg-[var(--ink)] text-white min-h-11 text-[13px] font-bold disabled:opacity-40"
          data-testid="edit-save"
        >
          {saving ? "שומרים…" : "לשמור את השינוי"}
        </button>
        <button onClick={onCancel} className="border border-[var(--line)] bg-white px-4 min-h-11 text-[13px]">
          בלי שינוי
        </button>
      </div>
    </div>
  );
}
