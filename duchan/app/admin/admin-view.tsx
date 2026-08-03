"use client";

// מרכז הניהול של מרינה. שישה אזורים:
// לאישור (חנויות ששילמו ומחכות) · סקירה (מספרים חיים) · חנויות (תיק חנות + וואטסאפ)
// · רשת (מי הביאה את מי) · מה מוכרות (גלריה) · עדכונים (הודעות לבנות)

import { useCallback, useEffect, useMemo, useState } from "react";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { milestones, reachedCount } from "@/lib/milestones";
import { payoutSummary } from "@/lib/payouts";
import { ACTIVATION_PRICE } from "@/lib/pricing";

/* ---------- types ---------- */

interface Totals {
  stores: number;
  activeStores: number;
  products: number;
  orders: number;
  newOrders: number;
  revenue: number;
  viewsTotal: number;
  views7d: number;
  live: number;
  drafts: number;
  pendingActivation: number;
  paidTotal: number;
  referred: number;
  refClicks: number;
}

interface AdminStore {
  id: string;
  slug: string;
  display_name: string;
  emoji: string;
  tagline: string | null;
  avatar_key: string | null;
  status: "active" | "paused" | "blocked";
  contact_phone: string;
  parent_email: string | null;
  claim_token: string | null;
  media_bytes: number;
  media_quota_bytes?: number | null;
  ai_enabled: boolean | null;
  ai_credits: number | null;
  sms_unlimited: boolean | null;
  created_at: string;
  activated_at: string | null;
  parent_consent_at: string | null;
  payment_claimed_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  payment_amount: number | null;
  payout_bit: boolean;
  payout_paybox: boolean;
  payout_cash: boolean;
  payout_note: string | null;
  referred_by: string | null;
  referral_source: string | null;
  ref_clicks: number;
  brought: number;
  products: number;
  deletedProducts: number;
  ordersNew: number;
  ordersPaid: number;
  ordersTotal: number;
  revenue: number;
  viewsTotal: number;
  views7d: number;
  lastOrderAt: string | null;
}

interface DetailProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  track_stock: boolean;
  is_visible: boolean | null;
  image_key: string | null;
  poster_key: string | null;
  video_key: string | null;
  deleted_at: string | null;
}

interface DetailOrder {
  id: string;
  order_number: number;
  total: number;
  status: string;
  created_at: string;
  items: { name: string; qty: number; price: number }[];
}

interface StoreDetail {
  store: AdminStore & { theme: string; cover_key: string | null };
  products: DetailProduct[];
  orders: DetailOrder[];
  views: { day: string; views: number }[];
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  emoji: string;
  created_at: string;
}

interface ExploreStore {
  id: string;
  slug: string;
  display_name: string;
  emoji: string;
  tagline: string | null;
  avatar_key: string | null;
  products: { name: string; price: number; image_key: string | null; poster_key: string | null; video_key: string | null; track_stock: boolean; stock: number }[];
}

const mediaUrl = (key: string | null) =>
  key ? `${(process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}` : null;

const STATUS_PILL: Record<string, string> = {
  active: "bg-[#E4F3E9] text-[var(--ok-ink)]",
  paused: "bg-[var(--warn-bg)] text-[var(--warn-ink)]",
  blocked: "bg-[var(--danger-bg)] text-[var(--danger)]",
};
const STATUS_LABEL: Record<string, string> = { active: "פעילה", paused: "מושהית", blocked: "חסומה" };

/* ---------- component ---------- */

type Tab = "approvals" | "overview" | "stores" | "network" | "explore" | "news";

const METHOD_LABEL: Record<string, string> = {
  bit: "ביט",
  paybox: "פייבוקס",
  other: "אחר",
  gift: "מתנה",
};

export default function AdminView({ aiConfigured = false }: { aiConfigured?: boolean }) {
  const [tab, setTab] = useState<Tab>("overview");
  // אם מישהי מחכה לאישור — נוחתים שם. הסקירה נעימה, אבל ילדה ששילמה
  // ומחכה היא הדבר היחיד בחמ"ל שכל שעה שעוברת עולה בו אמון.
  const [landed, setLanded] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<StoreDetail | null>(null);
  // המוצר שפתוח לעריכה בתיק החנות. אחד בכל רגע.
  const [editProduct, setEditProduct] = useState<{ id: string; name: string; price: string; stock: string } | null>(null);
  const [explore, setExplore] = useState<ExploreStore[]>([]);
  const [news, setNews] = useState<Announcement[]>([]);
  const [toast, setToast] = useState("");

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    if (res.ok) {
      const data = await res.json();
      setTotals(data.totals);
      setStores(data.stores);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === "explore" && explore.length === 0) {
      fetch("/api/admin/explore").then(async (r) => r.ok && setExplore((await r.json()).stores));
    }
    if (tab === "news") {
      fetch("/api/admin/announcements").then(async (r) => r.ok && setNews((await r.json()).announcements));
    }
  }, [tab, explore.length]);

  async function openDetail(id: string) {
    const res = await fetch(`/api/admin/store?id=${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function setStatus(storeId: string, status: string) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, status }),
    });
    refresh();
    if (detail?.store.id === storeId) openDetail(storeId);
    showToast(status === "active" ? "החנות הופעלה" : status === "paused" ? "החנות הושהתה" : "החנות נחסמה");
  }

  // הפעלת חנות = פתיחת הלינק לשיתוף. הפעולה היחידה שגובה כסף בפועל.
  async function setActivation(storeId: string, activate: boolean, paymentAmount?: number) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, activate, paymentAmount }),
    });
    refresh();
    if (detail?.store.id === storeId) openDetail(storeId);
    showToast(activate ? "החנות הופעלה, הלינק פתוח 🎉" : "ההפעלה בוטלה");
  }

  async function setAi(storeId: string, aiEnabled: boolean, aiCredits?: number | null) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, aiEnabled, aiCredits }),
    });
    refresh();
    if (detail?.store.id === storeId) openDetail(storeId);
    showToast(aiEnabled ? "כתיבה אוטומטית הופעלה ✨" : "כתיבה אוטומטית כובתה");
  }

  // פוטר את מספר הטלפון של החנות ממכסת הסמס היומית — בלי גישת אדמין.
  // ללקוחה שבודקת הרבה ונתקעת במכסה שנועדה לעצור הצפה, לא אותה.
  async function setSmsUnlimited(storeId: string, smsUnlimited: boolean) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, smsUnlimited }),
    });
    refresh();
    if (detail?.store.id === storeId) openDetail(storeId);
    showToast(smsUnlimited ? "סמס ללא הגבלה למספר הזה" : "בוטל, חוזרת למכסה הרגילה");
  }

  // הגדלת אחסון לחנות ספציפית — 25MB הם ברירת המחדל של כולן;
  // חנות עם הרבה סרטונים מקבלת כאן יותר, בלי לפתוח את התקרה לכולן.
  async function setMediaQuota(storeId: string, mediaQuotaMb: number | null) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, mediaQuotaMb }),
    });
    refresh();
    if (detail?.store.id === storeId) openDetail(storeId);
    showToast(mediaQuotaMb ? `האחסון הוגדל ל-${mediaQuotaMb}MB 📦` : "האחסון חזר לברירת המחדל");
  }

  // איפוס מיידי — פותח כניסה עכשיו בלי לחכות למיגרציה. לא קבוע, רק לרגע הזה.
  async function resetSmsQuota(storeId: string) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, resetSmsQuota: true }),
    });
    showToast("המכסה אופסה, אפשר להיכנס שוב עכשיו");
  }

  /**
   * כל פעולה על מוצר מהחמ"ל. גם "מחיקה" היא רכה — deleted_at, עם שחזור.
   * הודעת ה-toast מפורשת בכוונה: אחרת נראה כאילו מחקת מוצר לתמיד בלי לשאול.
   */
  async function productAction(
    productId: string,
    storeId: string,
    action: "restore" | "delete" | "hide" | "show" | "edit",
    extra?: Record<string, unknown>
  ) {
    const r = await fetch("/api/admin/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, action, ...extra }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      showToast(d.error ?? "הפעולה נכשלה");
      return;
    }
    setEditProduct(null);
    openDetail(storeId);
    showToast(
      action === "restore" ? "המוצר חזר לחנות"
      : action === "delete" ? "המוצר הוצא מהחנות, אפשר לשחזר"
      : action === "hide" ? "המוצר מוסתר מהקונות"
      : action === "show" ? "המוצר חזר להיות מוצג"
      : "המוצר עודכן"
    );
  }

  useEffect(() => {
    if (landed || !totals) return;
    setLanded(true);
    if (totals.pendingActivation > 0) setTab("approvals");
  }, [totals, landed]);

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return stores;
    // חיפוש לפי טלפון הוא הדרך שבה אני באמת מחפשת: לקוחה כותבת לי מהמספר
    // שלה, ואת שם החנות אני לא זוכרת. המספר מנורמל בשני הצדדים כדי
    // ש-050-527-8685 ו-972505278685 יימצאו אותו דבר.
    const digits = q.replace(/\D/g, "");
    const asE164 = normalizePhone(q);
    return stores.filter(
      (s) =>
        s.display_name.includes(q) ||
        s.slug.includes(q) ||
        (s.parent_email ?? "").includes(q) ||
        (!!asE164 && s.contact_phone === asE164) ||
        (digits.length >= 5 && (s.contact_phone ?? "").includes(digits))
    );
  }, [stores, search]);

  /** מי שהצהירה ששילמה ומחכה לי, והכי ותיקה קודם — היא מחכה הכי הרבה זמן */
  const waitingPayment = useMemo(
    () =>
      stores
        .filter((s) => !s.activated_at && s.payment_claimed_at)
        .sort((a, b) => (a.payment_claimed_at! < b.payment_claimed_at! ? -1 : 1)),
    [stores]
  );

  /** בנו דוכן ולא ביקשו לפרסם. לא פעולה — תמונת מצב. */
  const draftsNoClaim = useMemo(
    () => stores.filter((s) => !s.activated_at && !s.payment_claimed_at),
    [stores]
  );

  const waLink = (s: { contact_phone: string; display_name: string }) =>
    `https://wa.me/${s.contact_phone}?text=${encodeURIComponent(
      `היי! כאן מרינה מדוכן 👋\nראיתי את "${s.display_name}" ורציתי לומר שלום 💜`
    )}`;

/**
 * אזהרה כשהדאטהבייס מפגר אחרי הקוד.
 *
 * זה המסך היחיד שבו זה נראה לפני שילדה נתקלת בזה. הבדיקה נעשית מול
 * הסכמה עצמה ולא מול `schema_migrations`, כי הטבלה ההיא יודעת רק מה
 * הרצנו — לא מה קיים.
 */
function SchemaWarning() {
  const [state, setState] = useState<{ ok: boolean; missingColumns?: string[]; missingFunctions?: string[] } | null>(null);
  useEffect(() => {
    fetch("/api/squish/preflight").then((r) => r.json()).then(setState).catch(() => {});
  }, []);
  if (!state || state.ok) return null;
  const missing = [...(state.missingColumns ?? []), ...(state.missingFunctions ?? [])];
  return (
    <div
      data-testid="schema-warning"
      className="bg-[var(--danger)] text-white p-3.5 text-[13px] leading-relaxed"
    >
      <div className="font-bold">הדאטהבייס מפגר אחרי הקוד</div>
      <p className="opacity-90 mt-1">
        סקוויש קלאב עלול להיכשל בשקט עד שמריצים את המיגרציות החסרות.
      </p>
      {!!missing.length && (
        <p className="opacity-80 mt-1.5 text-[12px]" dir="ltr">{missing.slice(0, 8).join(" · ")}</p>
      )}
    </div>
  );
}

  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4 pb-16">
        <SchemaWarning />
        <header className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">דוכן · חמ"ל 👑</h1>
          {/* סקוויש קלאב הוא חמ"ל נפרד. בלי הקישור הזה הוא היה מסך
              שצריך לדעת את הכתובת שלו כדי להגיע אליו. */}
          <a href="/admin/squish" className="text-[12.5px] border border-[var(--line)] bg-white px-2.5 py-1.5 shrink-0">
            סקוויש קלאב →
          </a>
        </header>
        {totals && (
          <div className="text-xs text-[var(--muted)] -mt-2">
            {totals.activeStores}/{totals.stores} חנויות פעילות
          </div>
        )}

        <div className="flex bg-[var(--sub)] p-0.5 sticky top-2 z-20 ">
          {([
            ["approvals", "לאישור"],
            ["overview", "סקירה"],
            ["stores", "חנויות"],
            ["network", "רשת"],
            ["explore", "מה מוכרות"],
            ["news", "עדכונים"],
          ] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 text-[13px] font-medium transition ${tab === k ? "bg-white " : "text-[var(--muted)]"}`}
            >
              {label}
              {/* הספירה יושבת על הלשונית ולא רק בפנים: חנות שמחכה לאישור היא
                  ילדה שכבר שילמה ומחכה, וזה הדבר היחיד בחמ"ל שדוחק בזמן. */}
              {k === "approvals" && (totals?.pendingActivation ?? 0) > 0 && (
                <span className="mr-1.5 bg-[var(--danger)] text-white text-[11px] font-bold px-1.5 py-0.5">
                  {totals!.pendingActivation}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── לאישור ── המסך שבו מרינה מאשרת חנויות ששילמו.
            הוא לשונית ראשונה ולא פינה בתוך "סקירה", כי זו הפעולה היחידה
            בחמ"ל שילדה ממתינה לה בפועל. */}
        {tab === "approvals" && (
          <>
            <section className="bg-white border border-[var(--line)] p-3">
              <h2 className="text-sm font-bold">חנויות שהצהירו על תשלום</h2>
              <p className="text-[12.5px] text-[var(--muted)] mt-0.5 leading-relaxed">
                הכסף מגיע בביט או בפייבוקס, מחוץ למערכת. כאן מאשרים שהוא התקבל,
                והלינק של החנות נפתח להזמנות מיד.
              </p>
            </section>

            {waitingPayment.length === 0 ? (
              <div className="bg-white border border-[var(--line)] p-8 text-center">
                <div className="text-3xl">✓</div>
                <p className="text-[13px] font-bold mt-2">אין חנויות שמחכות</p>
                <p className="text-[12.5px] text-[var(--muted)] mt-1">
                  כשילדה תלחץ "שילמנו", היא תופיע כאן.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {waitingPayment.map((s) => (
                  <div key={s.id} className="bg-white border border-[var(--warn-line)] p-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar s={s} size={10} />
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => { setTab("stores"); openDetail(s.id); }}
                          className="text-[14px] font-bold truncate block text-right"
                        >
                          {s.display_name}
                        </button>
                        <div className="text-[12.5px] text-[var(--muted)]">
                          הצהירה {new Date(s.payment_claimed_at!).toLocaleDateString("he-IL")}
                          {s.payment_method && ` · ${METHOD_LABEL[s.payment_method] ?? s.payment_method}`}
                          {s.payment_ref && ` · על שם ${s.payment_ref}`}
                        </div>
                        <div className="text-[12.5px] text-[var(--muted)]">
                          {s.products} מוצרים · {s.viewsTotal} כניסות
                          {/* אישור ההורים הוא תנאי להצהרה, ולכן הוא אמור להיות
                              מסומן תמיד. אם הוא חסר — זו חנות ותיקה, ושווה לדעת. */}
                          {s.parent_consent_at
                            ? " · ✓ ההורים מאשרים"
                            : " · ⚠ בלי אישור הורים"}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5 mt-2.5">
                      <button
                        data-testid="approve-store"
                        onClick={() => setActivation(s.id, true, ACTIVATION_PRICE)}
                        className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12.5px] font-bold"
                      >
                        אישור והפעלה
                      </button>
                      <a
                        href={`/s/${s.slug}`}
                        target="_blank"
                        className="border border-[var(--line)] py-2.5 px-3 text-[12.5px] font-medium text-center"
                      >
                        לחנות
                      </a>
                      <a
                        href={waLink(s)}
                        target="_blank"
                        className="border border-[var(--line)] py-2.5 px-3 text-[12.5px] font-medium text-center"
                      >
                        וואטסאפ
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* בנות שבנו דוכן ועוד לא ביקשו לפרסם — לא פעולה, אבל כן תמונת מצב */}
            {draftsNoClaim.length > 0 && (
              <section className="bg-white border border-[var(--line)] p-3">
                <h2 className="text-[13px] font-bold">בנו דוכן ועוד לא פרסמו · {draftsNoClaim.length}</h2>
                <div className="flex flex-col gap-1.5 mt-2">
                  {draftsNoClaim.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setTab("stores"); openDetail(s.id); }}
                      className="flex items-center gap-2.5 text-right border-t border-[var(--line)] pt-1.5 first:border-0 first:pt-0"
                    >
                      <Avatar s={s} size={8} />
                      <span className="text-[12.5px] flex-1 truncate">{s.display_name}</span>
                      <span className="text-[12px] text-[var(--muted)]">{s.products} מוצרים</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── סקירה ── */}
        {tab === "overview" && totals && (
          <>
            {/* ממתינות להפעלה — הדבר היחיד שחוסם כסף וילדה מרוצה. תמיד ראשון. */}
            {totals.pendingActivation > 0 && (
              <section className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3">
                <h2 className="text-sm font-bold mb-2 text-[var(--warn-ink)]">
                  ⏳ ממתינות לאישור תשלום · {totals.pendingActivation}
                </h2>
                <div className="flex flex-col gap-2">
                  {stores
                    .filter((s) => !s.activated_at && s.payment_claimed_at)
                    .map((s) => (
                      <div key={s.id} className="bg-white border border-[var(--warn-line)] p-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar s={s} size={9} />
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => { setTab("stores"); openDetail(s.id); }}
                              className="text-[13px] font-bold truncate block text-right"
                            >
                              {s.display_name}
                            </button>
                            <div className="text-[12px] text-[var(--muted)]">
                              הצהירה {new Date(s.payment_claimed_at!).toLocaleDateString("he-IL")}
                              {s.payment_method && ` · ${METHOD_LABEL[s.payment_method] ?? s.payment_method}`}
                              {s.payment_ref && ` · ${s.payment_ref}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => setActivation(s.id, true, ACTIVATION_PRICE)}
                            className="flex-1 bg-[var(--ink)] text-white py-2 text-[12.5px] font-bold"
                          >
                            אישור והפעלה
                          </button>
                          <a
                            href={waLink(s)}
                            target="_blank"
                            className="flex-1 border border-[var(--line)] py-2 text-[12.5px] font-medium text-center"
                          >
                            וואטסאפ
                          </a>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Stat label="חנויות באוויר" value={totals.live} sub={`${totals.drafts} טיוטות`} icon="🚀" />
              <Stat label="הכנסה מהפעלות" value={`₪${totals.paidTotal}`} sub={`${totals.live} חנויות ששולמו`} icon="🏦" />
              <Stat label="כניסות · 7 ימים" value={totals.views7d} sub={`${totals.viewsTotal} סה"כ`} icon="👀" />
              <Stat label="הזמנות חדשות" value={totals.newOrders} sub={`${totals.orders} סה"כ`} icon="🧾" />
              <Stat label='מכירות ששולמו' value={`₪${totals.revenue}`} sub="בכל החנויות" icon="💰" />
              <Stat label="מוצרים באוויר" value={totals.products} sub={`${totals.stores} חנויות`} icon="🛍️" />
            </div>

            <section className="bg-white border border-[var(--line)] p-3">
              <h2 className="text-sm font-bold mb-2">הכי נצפות השבוע</h2>
              {[...stores]
                .sort((a, b) => b.views7d - a.views7d)
                .slice(0, 5)
                .map((s) => (
                  <button key={s.id} onClick={() => { setTab("stores"); openDetail(s.id); }}
                    className="w-full flex items-center gap-2.5 py-1.5 text-right">
                    <Avatar s={s} size={8} />
                    <span className="flex-1 text-[13px] font-medium truncate">{s.display_name}</span>
                    <span className="text-[12px] text-[var(--muted)]">{s.views7d} כניסות · ₪{s.revenue}</span>
                  </button>
                ))}
              {stores.length === 0 && <p className="text-xs text-[var(--muted)] py-3">עוד אין חנויות.</p>}
            </section>

            <section className="bg-white border border-[var(--line)] p-3">
              <h2 className="text-sm font-bold mb-2">דורשות תשומת לב</h2>
              {stores.filter((s) => s.ordersNew > 0 || (s.products === 0 && s.status === "active")).slice(0, 6).map((s) => (
                <button key={s.id} onClick={() => { setTab("stores"); openDetail(s.id); }}
                  className="w-full flex items-center gap-2.5 py-1.5 text-right">
                  <Avatar s={s} size={8} />
                  <span className="flex-1 text-[13px] truncate">{s.display_name}</span>
                  <span className="text-[12px] text-[var(--warn-ink)]">
                    {s.ordersNew > 0 ? `${s.ordersNew} הזמנות מחכות` : "חנות ריקה"}
                  </span>
                </button>
              ))}
              {stores.every((s) => s.ordersNew === 0 && !(s.products === 0 && s.status === "active")) && (
                <p className="text-xs text-[var(--muted)] py-2">הכל מטופל ✨</p>
              )}
            </section>
          </>
        )}

        {/* ── חנויות ── */}
        {tab === "stores" && (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, טלפון או לינק…"
              className="w-full border border-[var(--line)] bg-white px-4 py-2.5 text-sm"
            />
            <div className="flex flex-col gap-2">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => openDetail(s.id)}
                  className="bg-white border border-[var(--line)] p-3 text-right hover:border-[var(--ink)] transition">
                  <div className="flex items-center gap-2.5">
                    <Avatar s={s} size={10} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{s.display_name}</span>
                        <span className={`text-[11px] px-2 py-0.5 ${STATUS_PILL[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                        {s.claim_token && (
                          <span className="text-[11px] px-2 py-0.5 bg-[var(--sub)] text-[var(--muted)]">לא נתבעה</span>
                        )}
                        {!s.activated_at && (
                          <span className={`text-[11px] px-2 py-0.5 ${s.payment_claimed_at ? "bg-[var(--warn-bg)] text-[var(--warn-ink)]" : "bg-[var(--sub)] text-[var(--muted)]"}`}>
                            {s.payment_claimed_at ? "ממתינה לאישור" : "טיוטה"}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] text-[var(--muted)] mt-0.5">
                        {s.views7d} כניסות השבוע · {s.products} מוצרים · {s.ordersTotal} הזמנות · ₪{s.revenue}
                        {s.ordersNew > 0 && <b className="text-[var(--warn-ink)]"> · {s.ordersNew} חדשות</b>}
                      </div>
                      <div className="text-[12px] text-[var(--muted)] mt-0.5">
                        📈 התקדמות: {reachedCount(milestones({
                          products: s.products, orders: s.ordersTotal, paidOrders: s.ordersPaid,
                          revenue: s.revenue, views: s.viewsTotal,
                        }))}/7
                        {s.ai_enabled && <span className="text-[var(--ok-ink)]"> · ✨ פרימיום</span>}
                      </div>
                    </div>
                    <span className="text-[var(--muted)]">‹</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-[var(--muted)] py-8">לא נמצאו חנויות.</p>
              )}
            </div>
          </>
        )}

        {/* ── רשת ── */}
        {tab === "network" && totals && (
          <NetworkTab
            stores={stores}
            totals={totals}
            onOpen={(id) => { setTab("stores"); openDetail(id); }}
          />
        )}

        {/* ── מה מוכרות ── */}
        {tab === "explore" && (
          <div className="flex flex-col gap-3">
            {explore.length === 0 && <p className="text-center text-sm text-[var(--muted)] py-10">עוד אין חנויות פעילות.</p>}
            {explore.map((s) => (
              <div key={s.id} className="bg-white border border-[var(--line)] p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <Avatar s={s} size={10} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{s.display_name}</div>
                    {s.tagline && <div className="text-[12px] text-[var(--muted)] truncate">{s.tagline}</div>}
                  </div>
                  <a href={`/s/${s.slug}`} target="_blank"
                    className="border border-[var(--line)] px-3 py-1.5 text-[12px] whitespace-nowrap">
                    לחנות ←
                  </a>
                </div>
                {s.products.length === 0 ? (
                  <p className="text-[12px] text-[var(--muted)]">עוד אין מוצרים.</p>
                ) : (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {s.products.map((p, i) => {
                      const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
                      const out = p.track_stock && p.stock === 0;
                      return (
                        <div key={i} className={`min-w-20 w-20 ${out ? "opacity-45" : ""}`}>
                          <div className="w-20 h-20 bg-[var(--canvas)] flex items-center justify-center text-2xl overflow-hidden relative">
                            {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                            {p.video_key && (
                              <span className="absolute bottom-0.5 left-1 text-[8px] bg-black/60 text-white px-1 ">▶</span>
                            )}
                          </div>
                          <div className="text-[11px] truncate mt-0.5">{p.name}</div>
                          <div className="text-[11px] font-bold">₪{p.price}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── עדכונים ── */}
        {tab === "news" && (
          <NewsTab news={news} setNews={setNews} showToast={showToast} />
        )}
      </div>

      {/* ── תיק חנות ── */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setDetail(null)} />
          <div className="fixed bottom-0 inset-x-0 max-w-2xl mx-auto z-50 bg-white px-4 pt-3 pb-8 max-h-[92%] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-1 bg-black/15 mx-auto" />
              <button
                onClick={() => setDetail(null)}
                aria-label="סגירה"
                className="absolute top-3 left-4 w-8 h-8 bg-[var(--canvas)] text-[var(--muted)] text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 mb-1">
              <Avatar s={detail.store} size={12} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold truncate">{detail.store.display_name}</h2>
                  <span className={`text-[11px] px-2 py-0.5 ${STATUS_PILL[detail.store.status]}`}>
                    {STATUS_LABEL[detail.store.status]}
                  </span>
                </div>
                <div className="text-[12px] text-[var(--muted)]" dir="ltr">
                  /s/{detail.store.slug} · {displayPhone(detail.store.contact_phone)} · {detail.store.parent_email || "אין"}
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 my-3 flex-wrap">
              <a href={waLink(detail.store)} target="_blank"
                className="bg-[var(--whatsapp)] text-white px-3.5 py-2 text-xs font-medium">
                💬 וואטסאפ לבעלי הדוכן
              </a>
              <a href={`/s/${detail.store.slug}`} target="_blank"
                className="border border-[var(--line)] px-3.5 py-2 text-xs font-medium">
                צפייה בחנות
              </a>
              {(["active", "paused", "blocked"] as const)
                .filter((st) => st !== detail.store.status)
                .map((st) => (
                  <button key={st} onClick={() => setStatus(detail.store.id, st)}
                    className={`border px-3.5 py-2 text-xs font-medium ${st === "blocked" ? "border-[var(--danger-line)] text-[var(--danger)]" : "border-[var(--line)]"}`}>
                    {st === "active" ? "הפעלה" : st === "paused" ? "השהיה" : "חסימה"}
                  </button>
                ))}
            </div>

            {detail.store.claim_token && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/claim/${detail.store.claim_token}`);
                  showToast("לינק התביעה הועתק");
                }}
                className="w-full text-right text-[12px] text-[var(--ok-ink)] bg-[var(--ok-bg)] border border-[var(--ok-line)] px-3 py-2 mb-3"
              >
                🔗 החנות עוד לא נתבעה, לחיצה מעתיקה את לינק התביעה
              </button>
            )}

            {/* הפעלה ותשלום */}
            <div
              className={` p-3 mb-3 border ${
 detail.store.activated_at
                  ? "bg-[var(--ok-bg)] border-[var(--ok-line)]"
                  : detail.store.payment_claimed_at
                    ? "bg-[var(--warn-bg)] border-[var(--warn-line)]"
                    : "bg-[var(--canvas)] border-[var(--line)]"
              }`}
            >
              <div className="text-[11.5px] text-[var(--muted)] mb-1.5">
                תשלום הקמה לדוכן, לא קשור לאיך שהיא גובה מקונות
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold flex-1">
                  {detail.store.activated_at
                    ? `🚀 באוויר מאז ${new Date(detail.store.activated_at).toLocaleDateString("he-IL")}`
                    : detail.store.payment_claimed_at
                      ? "⏳ הצהירה ששילמה, ממתינה לאישור"
                      : "📝 טיוטה, הלינק סגור"}
                </span>
                {detail.store.activated_at ? (
                  <button
                    onClick={() => setActivation(detail.store.id, false)}
                    className="border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]"
                  >
                    ביטול הפעלה
                  </button>
                ) : (
                  <button
                    onClick={() => setActivation(detail.store.id, true, ACTIVATION_PRICE)}
                    className="bg-[var(--ink)] text-white px-3 py-1.5 text-[12px] font-medium"
                  >
                    אישור והפעלה
                  </button>
                )}
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-1.5">
                {detail.store.payment_claimed_at && (
                  <>
                    הצהרה: {new Date(detail.store.payment_claimed_at).toLocaleDateString("he-IL")}
                    {detail.store.payment_method &&
                      ` · ${METHOD_LABEL[detail.store.payment_method] ?? detail.store.payment_method}`}
                    {detail.store.payment_ref && ` · ${detail.store.payment_ref}`}
                    {detail.store.payment_amount ? ` · ₪${detail.store.payment_amount}` : ""}
                    <br />
                  </>
                )}
                {detail.store.referred_by ? (
                  <>
                    הגיעה מ
                    <button
                      onClick={() => openDetail(detail.store.referred_by!)}
                      className="underline"
                    >
                      {stores.find((x) => x.id === detail.store.referred_by)?.display_name ?? "חנות שנמחקה"}
                    </button>
                  </>
                ) : (
                  "הגיעה ישירות"
                )}
                {" · "}
                הביאה {stores.find((x) => x.id === detail.store.id)?.brought ?? 0} · {detail.store.ref_clicks ?? 0} לחיצות על "פתחי חנות"
              </div>
            </div>

            {/* איך היא גובה מקונות — לידיעה בלבד. הכסף הזה לא עובר דרכנו. */}
            <div className="bg-[var(--canvas)] p-3 mb-3">
              <div className="text-[12px] text-[var(--muted)] mb-1">איך היא גובה מקונות</div>
              <div className="text-[12.5px]">
                {payoutSummary(detail.store) || "לא הגדירה עדיין"}
                {detail.store.payout_note && (
                  <span className="text-[var(--muted)]"> · {detail.store.payout_note}</span>
                )}
              </div>
            </div>

            {/* מסע + פרימיום */}
            <div className="bg-[var(--canvas)] p-3 mb-3">
              <div className="text-[12px] text-[var(--muted)] mb-2">ההתקדמות שלה</div>
              <div className="flex flex-wrap gap-1.5">
                {milestones({
                  products: detail.store.products, orders: detail.store.ordersTotal,
                  paidOrders: detail.store.ordersPaid, revenue: detail.store.revenue,
                  views: detail.store.viewsTotal,
                }).map((ms) => (
                  <span key={ms.key} title={ms.title}
                    className={`text-[12px] px-2 py-1 border ${ms.reached ? "bg-[var(--ok-bg)] border-[var(--ok-line)]" : "bg-white border-[var(--line)] opacity-50"}`}>
                    <span className={ms.reached ? "" : "grayscale"}>{ms.emoji}</span> {ms.title}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--line)]">
                <span className="text-[12px] flex-1">
                  ✨ כתיבה אוטומטית
                  {detail.store.ai_enabled ? (
                    <span className="text-[var(--muted)]">
                      {" · "}{detail.store.ai_credits === null ? "ללא הגבלה" : `${detail.store.ai_credits} נשארו`}
                    </span>
                  ) : (
                    <span className="text-[var(--warn-ink)]">{" · כבוי לחנות הזו"}</span>
                  )}
                </span>
                {detail.store.ai_enabled ? (
                  <>
                    <button onClick={() => setAi(detail.store.id, true, (detail.store.ai_credits ?? 0) + 50)}
                      className="border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]">+50</button>
                    <button onClick={() => setAi(detail.store.id, false)}
                      className="border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]">כיבוי</button>
                  </>
                ) : (
                  <button
                    onClick={() => setAi(detail.store.id, true, 50)}
                    disabled={!aiConfigured}
                    className="bg-[var(--ink)] text-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-30"
                  >
                    הדלקה מחדש · 50
                  </button>
                )}
              </div>
              {!aiConfigured && (
                <div className="text-[12px] text-[var(--warn-ink)] mt-2">
                  <b>אין מפתח Anthropic בשרת.</b> כתיבה אוטומטית דלוקה לכל החנויות,
                  אז כל מי שילחץ "לכתוב לי תיאור" יקבל שגיאה. צריך להגדיר{" "}
                  <code>ANTHROPIC_API_KEY</code> ולפרוס מחדש.
                </div>
              )}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--line)]">
                <span className="text-[12px] flex-1">
                  📱 סמס ללא הגבלה
                  <span className="text-[var(--muted)]">
                    {" · "}{detail.store.sms_unlimited ? "פעיל למספר הזה" : "מכסה רגילה (5 ליום)"}
                  </span>
                </span>
                <button
                  onClick={() => setSmsUnlimited(detail.store.id, !detail.store.sms_unlimited)}
                  aria-label={detail.store.sms_unlimited ? "כיבוי סמס ללא הגבלה" : "הפעלת סמס ללא הגבלה"}
                  className={detail.store.sms_unlimited
                    ? "border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]"
                    : "bg-[var(--ink)] text-white px-3 py-1.5 text-[12px] font-medium"}
                >
                  {detail.store.sms_unlimited ? "כיבוי" : "הפעלה"}
                </button>
                <button
                  onClick={() => resetSmsQuota(detail.store.id)}
                  aria-label="איפוס מכסת סמס עכשיו"
                  className="border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]"
                >
                  איפוס עכשיו
                </button>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--line)]">
                <span className="text-[12px] flex-1">
                  📦 אחסון מדיה
                  <span className="text-[var(--muted)]">
                    {" · "}{(detail.store.media_bytes / 1024 / 1024).toFixed(1)}MB מתוך{" "}
                    {((detail.store.media_quota_bytes ?? 25 * 1024 * 1024) / 1024 / 1024).toFixed(0)}MB
                    {detail.store.media_quota_bytes ? " (מוגדל)" : ""}
                  </span>
                </span>
                {[50, 100].map((mb) => (
                  <button
                    key={mb}
                    onClick={() => setMediaQuota(detail.store.id, mb)}
                    aria-label={`הגדלת אחסון ל-${mb} מגהבייט`}
                    className={detail.store.media_quota_bytes === mb * 1024 * 1024
                      ? "bg-[var(--ink)] text-white px-3 py-1.5 text-[12px] font-medium"
                      : "border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]"}
                  >
                    {mb}MB
                  </button>
                ))}
                {detail.store.media_quota_bytes != null && (
                  <button
                    onClick={() => setMediaQuota(detail.store.id, null)}
                    aria-label="חזרה לברירת המחדל של האחסון"
                    className="border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px]"
                  >
                    ברירת מחדל
                  </button>
                )}
              </div>
            </div>

            {/* כניסות 14 יום */}
            <div className="bg-[var(--canvas)] p-3 mb-3">
              <div className="text-[12px] text-[var(--muted)] mb-2">כניסות · 14 ימים אחרונים</div>
              <div className="flex items-end gap-1 h-14">
                {buildDays(detail.views).map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: ${d.views}`}>
                    <div className="w-full bg-[var(--ink)] min-h-[2px]"
                      style={{ height: `${d.pct}%`, opacity: d.views ? 1 : 0.12 }} />
                  </div>
                ))}
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-1.5">
                {detail.views.reduce((s, v) => s + v.views, 0)} כניסות בתקופה
              </div>
            </div>

            {/* מוצרים — כולל מחוקים. כלום לא נעלם. */}
            <h3 className="text-sm font-bold mb-1.5">
              מוצרים ({detail.products.filter((p) => !p.deleted_at).length} פעילים
              {detail.products.some((p) => p.deleted_at) &&
                ` · ${detail.products.filter((p) => p.deleted_at).length} בארכיון`})
            </h3>
            <div className="flex flex-col gap-1.5 mb-4">
              {detail.products.map((p) => {
                const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
                const open = editProduct?.id === p.id;
                return (
                  <div key={p.id}
                    className={`border border-[var(--line)] p-2 ${p.deleted_at ? "bg-[#FAFAFB] opacity-70" : "bg-white"}`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-[var(--canvas)] flex items-center justify-center text-lg overflow-hidden shrink-0">
                        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{p.name}</div>
                        <div className="text-[11px] text-[var(--muted)]">
                          ₪{p.price}
                          {p.track_stock ? ` · מלאי ${p.stock}` : " · בלי מעקב"}
                          {p.is_visible === false && " · מוסתר"}
                          {p.deleted_at && ` · הוצא ${new Date(p.deleted_at).toLocaleDateString("he-IL")}`}
                        </div>
                      </div>
                      {p.deleted_at ? (
                        <button data-testid={`restore-product-${p.id}`}
                          onClick={() => productAction(p.id, detail.store.id, "restore")}
                          className="text-[12px] border border-[var(--line)] px-2.5 py-1.5 shrink-0">
                          שחזור
                        </button>
                      ) : (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() =>
                              setEditProduct(
                                open
                                  ? null
                                  : { id: p.id, name: p.name, price: String(p.price), stock: String(p.stock) }
                              )
                            }
                            aria-label="עריכה"
                            className="text-[12px] border border-[var(--line)] px-2 py-1.5">
                            {open ? "סגירה" : "✏️"}
                          </button>
                          <button
                            onClick={() => productAction(p.id, detail.store.id, p.is_visible === false ? "show" : "hide")}
                            aria-label={p.is_visible === false ? "הצגה" : "הסתרה"}
                            className="text-[12px] border border-[var(--line)] px-2 py-1.5">
                            {p.is_visible === false ? "👁️" : "🙈"}
                          </button>
                          <button onClick={() => productAction(p.id, detail.store.id, "delete")}
                            aria-label="הוצאה מהחנות"
                            className="text-[12px] border border-[var(--danger-line)] text-[var(--danger)] px-2 py-1.5">
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>

                    {open && editProduct && (
                      <div className="mt-2 pt-2 border-t border-[var(--line)] flex flex-col gap-1.5">
                        <input value={editProduct.name} maxLength={40} aria-label="שם המוצר"
                          onChange={(e) => setEditProduct((s) => s && { ...s, name: e.target.value })}
                          className="w-full border border-[var(--line)] px-2.5 py-2 text-[13px]" />
                        <div className="flex gap-1.5">
                          <input value={editProduct.price} type="number" inputMode="numeric" aria-label="מחיר"
                            onChange={(e) => setEditProduct((s) => s && { ...s, price: e.target.value })}
                            className="flex-1 border border-[var(--line)] px-2.5 py-2 text-[13px]" />
                          <input value={editProduct.stock} type="number" inputMode="numeric" aria-label="מלאי"
                            onChange={(e) => setEditProduct((s) => s && { ...s, stock: e.target.value })}
                            className="flex-1 border border-[var(--line)] px-2.5 py-2 text-[13px]" />
                        </div>
                        <button
                          onClick={() =>
                            productAction(p.id, detail.store.id, "edit", {
                              name: editProduct.name,
                              price: Number(editProduct.price),
                              stock: Number(editProduct.stock),
                            })
                          }
                          className="bg-[var(--ink)] text-white py-2 text-[13px] font-bold">
                          שמירה
                        </button>
                        <p className="text-[11px] text-[var(--faint)]">
                          שדות: שם · מחיר · מלאי. השינוי יופיע בחנות מיד.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
              {detail.products.length === 0 && <p className="text-xs text-[var(--muted)]">עוד אין מוצרים.</p>}
            </div>

            {/* הזמנות אחרונות */}
            <h3 className="text-sm font-bold mb-1.5">הזמנות אחרונות</h3>
            <div className="flex flex-col gap-1.5">
              {detail.orders.map((o) => (
                <div key={o.id} className="flex items-center gap-2 border border-[var(--line)] p-2 bg-white text-[12px]">
                  <span className="text-[var(--muted)]">#{o.order_number}</span>
                  <span className="flex-1 truncate">
                    {o.items.map((i) => `${i.name}×${i.qty}`).join(", ")}
                  </span>
                  <span className="font-medium">₪{o.total}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 ${
                    o.status === "sent" ? "bg-[var(--warn-bg)] text-[var(--warn-ink)]"
                    : o.status === "paid" ? "bg-[#E4F3E9] text-[var(--ok-ink)]"
                    : o.status === "delivered" ? "bg-[var(--sub)] text-[var(--muted)]"
                    : "bg-[var(--danger-bg)] text-[var(--danger)]"}`}>
                    {o.status === "sent" ? "חדש" : o.status === "paid" ? "שולם" : o.status === "delivered" ? "נמסר" : "בוטל"}
                  </span>
                </div>
              ))}
              {detail.orders.length === 0 && <p className="text-xs text-[var(--muted)]">עוד אין הזמנות.</p>}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </main>
  );
}

/* ---------- helpers ---------- */

function Stat({ label, value, sub, icon }: { label: string; value: number | string; sub: string; icon: string }) {
  return (
    <div className="bg-white border border-[var(--line)] p-3">
      <div className="text-lg">{icon}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      <div className="text-[12px] text-[var(--muted)]">{label} · {sub}</div>
    </div>
  );
}

function Avatar({ s, size }: { s: { avatar_key?: string | null; emoji: string }; size: number }) {
  const url = mediaUrl(s.avatar_key ?? null);
  const px = size * 4;
  return (
    <div className=" bg-[var(--canvas)] flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{ width: px, height: px, fontSize: px * 0.5 }}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : s.emoji}
    </div>
  );
}

/**
 * "רשת" — מאיפה הגיעה כל חנות ומי הביאה את מי.
 * זה מה שמראה אשכולות: כיתה שלמה שנפתחה מחנות אחת, שכונה, תנועת נוער.
 * מי שהביאה חנויות היא נקודת המפתח של האשכול — שווה לדבר איתה.
 */
function NetworkTab({
  stores,
  totals,
  onOpen,
}: {
  stores: AdminStore[];
  totals: Totals;
  onOpen: (id: string) => void;
}) {
  const byId = new Map(stores.map((s) => [s.id, s]));
  const children = new Map<string, AdminStore[]>();
  stores.forEach((s) => {
    // אב שכבר לא קיים (נמחק) — מתייחסים אליה כשורש
    const parent = s.referred_by && byId.has(s.referred_by) ? s.referred_by : null;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), s]);
  });

  const roots = stores.filter((s) => !s.referred_by || !byId.has(s.referred_by));
  const clusterSize = (s: AdminStore): number =>
    1 + (children.get(s.id) ?? []).reduce((sum, c) => sum + clusterSize(c), 0);

  const clusters = roots
    .map((r) => ({ root: r, size: clusterSize(r) }))
    .sort((a, b) => b.size - a.size);

  const withCluster = clusters.filter((c) => c.size > 1);
  const alone = clusters.filter((c) => c.size === 1);

  // כמה מהלחיצות על "לפתוח חנות משלך" הפכו לחנות בפועל
  const conversion = totals.refClicks ? Math.round((totals.referred / totals.refClicks) * 100) : 0;

  const row = (s: AdminStore, depth: number) => (
    <div key={s.id}>
      <button
        onClick={() => onOpen(s.id)}
        className="w-full flex items-center gap-2 py-1.5 text-right"
        style={{ paddingRight: depth * 18 }}
      >
        {depth > 0 && <span className="text-[var(--faint)] text-[12px]">└</span>}
        <Avatar s={s} size={depth ? 7 : 9} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">
            {s.display_name}
            {!s.activated_at && (
              <span className="text-[11px] text-[var(--warn-ink)] font-normal"> · טיוטה</span>
            )}
          </div>
          <div className="text-[11.5px] text-[var(--muted)]">
            {s.brought > 0 ? `הביאה ${s.brought} · ` : ""}
            {s.ref_clicks === 1 ? "לחיצה אחת" : `${s.ref_clicks} לחיצות`} ·{" "}
            {s.products === 1 ? "מוצר אחד" : `${s.products} מוצרים`}
          </div>
        </div>
      </button>
      {(children.get(s.id) ?? []).map((c) => row(c, depth + 1))}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="הגיעו מחנות" value={totals.referred} sub={`מתוך ${totals.stores}`} icon="🔗" />
        <Stat label="לחיצות על 'פתחי חנות'" value={totals.refClicks} sub={`${conversion}% נפתחו`} icon="👆" />
      </div>

      <section className="bg-white border border-[var(--line)] p-3">
        <h2 className="text-sm font-bold">אשכולות</h2>
        <p className="text-[12px] text-[var(--muted)] mb-2">
          חנות שהביאה חנויות אחרות. כאן נמצאות הכיתות והשכונות.
        </p>
        {withCluster.length === 0 && (
          <p className="text-xs text-[var(--muted)] py-3">עוד אף חנות לא הביאה חנות אחרת.</p>
        )}
        {withCluster.map(({ root, size }) => (
          <div key={root.id} className="border-t border-[var(--line)] pt-2 mt-2 first:border-0 first:mt-0 first:pt-0">
            <div className="text-[12px] font-bold text-[var(--ok-ink)] mb-1">אשכול של {size} חנויות</div>
            {row(root, 0)}
          </div>
        ))}
      </section>

      <section className="bg-white border border-[var(--line)] p-3">
        <h2 className="text-sm font-bold mb-2">הגיעו לבד · {alone.length}</h2>
        {alone.slice(0, 20).map(({ root }) => row(root, 0))}
        {alone.length > 20 && (
          <p className="text-[12px] text-[var(--muted)] pt-2">ועוד {alone.length - 20}…</p>
        )}
        {alone.length === 0 && <p className="text-xs text-[var(--muted)] py-2">אין.</p>}
      </section>
    </>
  );
}

/** ממלא את 14 הימים האחרונים גם כשאין כניסות, לגרף רציף */
function buildDays(views: { day: string; views: number }[]) {
  const map = new Map(views.map((v) => [v.day, v.views]));
  const days: { day: string; views: number; pct: number }[] = [];
  let max = 1;
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const v = map.get(d) ?? 0;
    max = Math.max(max, v);
    days.push({ day: d, views: v, pct: 0 });
  }
  days.forEach((d) => (d.pct = Math.round((d.views / max) * 100)));
  return days;
}

function NewsTab({
  news,
  setNews,
  showToast,
}: {
  news: Announcement[];
  setNews: (n: Announcement[]) => void;
  showToast: (m: string) => void;
}) {
  const [emoji, setEmoji] = useState("✨");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, emoji }),
      });
      if (res.ok) {
        const { announcement } = await res.json();
        setNews([announcement, ...news]);
        setTitle("");
        setBody("");
        showToast("פורסם! הבנות יראו את זה בדשבורד 🎉");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/admin/announcements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNews(news.filter((n) => n.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white border border-[var(--line)] p-3 flex flex-col gap-2">
        <span className="text-sm font-bold">עדכון חדש לבנות</span>
        <div className="flex gap-1.5">
          {["✨", "🎉", "🛍️", "🎬", "💡", "🚀"].map((e) => (
            <button key={e} onClick={() => setEmoji(e)}
              className={`w-9 h-9 border-[1.5px] text-lg ${emoji === e ? "border-[var(--ink)]" : "border-[var(--line)]"}`}>
              {e}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
          placeholder="כותרת, למשל: אפשר להעלות וידאו!"
          className="border border-[var(--line)] px-3 py-2.5 text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3}
          placeholder="מה חדש? כתבו בשפה שלהם…"
          className="border border-[var(--line)] px-3 py-2.5 text-sm resize-none" />
        <button onClick={publish} disabled={busy || !title.trim() || !body.trim()}
          className="bg-[var(--ink)] text-white py-2.5 text-sm font-medium disabled:opacity-40">
          {busy ? "מפרסמים…" : "פרסום לכל הדשבורדים"}
        </button>
      </div>

      {news.map((n) => (
        <div key={n.id} className="bg-white border border-[var(--line)] p-3">
          <div className="flex items-start gap-2">
            <span className="text-xl">{n.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{n.title}</div>
              <p className="text-[13px] text-[var(--muted)] whitespace-pre-line mt-0.5">{n.body}</p>
              <div className="text-[11px] text-[var(--muted)] mt-1">
                {new Date(n.created_at).toLocaleDateString("he-IL")}
              </div>
            </div>
            <button onClick={() => remove(n.id)} className="text-[12px] text-[var(--danger)] underline">
              מחיקה
            </button>
          </div>
        </div>
      ))}
      {news.length === 0 && <p className="text-center text-sm text-[var(--muted)] py-6">עוד לא פרסמת עדכונים.</p>}
    </div>
  );
}
