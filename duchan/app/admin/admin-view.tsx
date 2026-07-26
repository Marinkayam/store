"use client";

// מרכז הניהול של מרינה. ארבעה אזורים:
// סקירה (מספרים חיים) · חנויות (תיק חנות + וואטסאפ) · מה מוכרות (גלריה) · עדכונים (הודעות לבנות)

import { useCallback, useEffect, useMemo, useState } from "react";
import { displayPhone } from "@/lib/phone";
import { milestones, reachedCount } from "@/lib/milestones";

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
  ai_enabled: boolean | null;
  ai_credits: number | null;
  created_at: string;
  activated_at: string | null;
  payment_claimed_at: string | null;
  payment_method: string | null;
  payment_ref: string | null;
  payment_amount: number | null;
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
  active: "bg-[#E4F3E9] text-[#1F7A42]",
  paused: "bg-[#FFF3E0] text-[#A85B00]",
  blocked: "bg-[#FBE9EA] text-[#D2373B]",
};
const STATUS_LABEL: Record<string, string> = { active: "פעילה", paused: "מושהית", blocked: "חסומה" };

/* ---------- component ---------- */

type Tab = "overview" | "stores" | "network" | "explore" | "news";

const METHOD_LABEL: Record<string, string> = {
  bit: "ביט",
  paybox: "פייבוקס",
  other: "אחר",
  gift: "מתנה",
};

export default function AdminView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [totals, setTotals] = useState<Totals | null>(null);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<StoreDetail | null>(null);
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
    showToast(activate ? "החנות הופעלה — הלינק פתוח 🎉" : "ההפעלה בוטלה");
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

  async function restoreProduct(productId: string, storeId: string) {
    await fetch("/api/admin/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, action: "restore" }),
    });
    openDetail(storeId);
    showToast("המוצר שוחזר לחנות");
  }

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return stores;
    return stores.filter(
      (s) => s.display_name.includes(q) || s.slug.includes(q) || (s.parent_email ?? "").includes(q)
    );
  }, [stores, search]);

  const waLink = (s: { contact_phone: string; display_name: string }) =>
    `https://wa.me/${s.contact_phone}?text=${encodeURIComponent(
      `היי! כאן מרינה מדוכן 👋\nראיתי את "${s.display_name}" ורציתי לומר שלום 💜`
    )}`;

  return (
    <main className="min-h-screen bg-[#F5F6F9]">
      <div className="max-w-2xl mx-auto p-4 flex flex-col gap-4 pb-16">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-bold">דוכן · חמ"ל 👑</h1>
          {totals && (
            <span className="text-xs text-[#7A7D8A]">
              {totals.activeStores}/{totals.stores} חנויות פעילות
            </span>
          )}
        </header>

        <div className="flex bg-[#DCDCE4] rounded-xl p-0.5 sticky top-2 z-20 shadow-sm">
          {([
            ["overview", "סקירה"],
            ["stores", "חנויות"],
            ["network", "רשת"],
            ["explore", "מה מוכרות"],
            ["news", "עדכונים"],
          ] as [Tab, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition ${tab === k ? "bg-white shadow-sm" : "text-[#7A7D8A]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── סקירה ── */}
        {tab === "overview" && totals && (
          <>
            {/* ממתינות להפעלה — הדבר היחיד שחוסם כסף וילדה מרוצה. תמיד ראשון. */}
            {totals.pendingActivation > 0 && (
              <section className="bg-[#FFF9EE] border border-[#F5E3C2] rounded-xl p-3">
                <h2 className="text-sm font-bold mb-2 text-[#A85B00]">
                  ⏳ ממתינות לאישור תשלום · {totals.pendingActivation}
                </h2>
                <div className="flex flex-col gap-2">
                  {stores
                    .filter((s) => !s.activated_at && s.payment_claimed_at)
                    .map((s) => (
                      <div key={s.id} className="bg-white border border-[#F5E3C2] rounded-lg p-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar s={s} size={9} />
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => { setTab("stores"); openDetail(s.id); }}
                              className="text-[13px] font-bold truncate block text-right"
                            >
                              {s.display_name}
                            </button>
                            <div className="text-[11px] text-[#7A7D8A]">
                              הצהירה {new Date(s.payment_claimed_at!).toLocaleDateString("he-IL")}
                              {s.payment_method && ` · ${METHOD_LABEL[s.payment_method] ?? s.payment_method}`}
                              {s.payment_ref && ` · ${s.payment_ref}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => setActivation(s.id, true, 200)}
                            className="flex-1 bg-[#15161B] text-white rounded-lg py-2 text-[11.5px] font-bold"
                          >
                            אישור והפעלה
                          </button>
                          <a
                            href={waLink(s)}
                            target="_blank"
                            className="flex-1 border border-[#E6E7EC] rounded-lg py-2 text-[11.5px] font-medium text-center"
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

            <section className="bg-white border border-[#E6E7EC] rounded-xl p-3">
              <h2 className="text-sm font-bold mb-2">הכי נצפות השבוע</h2>
              {[...stores]
                .sort((a, b) => b.views7d - a.views7d)
                .slice(0, 5)
                .map((s) => (
                  <button key={s.id} onClick={() => { setTab("stores"); openDetail(s.id); }}
                    className="w-full flex items-center gap-2.5 py-1.5 text-right">
                    <Avatar s={s} size={8} />
                    <span className="flex-1 text-[13px] font-medium truncate">{s.display_name}</span>
                    <span className="text-[12px] text-[#7A7D8A]">{s.views7d} כניסות · ₪{s.revenue}</span>
                  </button>
                ))}
              {stores.length === 0 && <p className="text-xs text-[#7A7D8A] py-3">עוד אין חנויות.</p>}
            </section>

            <section className="bg-white border border-[#E6E7EC] rounded-xl p-3">
              <h2 className="text-sm font-bold mb-2">דורשות תשומת לב</h2>
              {stores.filter((s) => s.ordersNew > 0 || (s.products === 0 && s.status === "active")).slice(0, 6).map((s) => (
                <button key={s.id} onClick={() => { setTab("stores"); openDetail(s.id); }}
                  className="w-full flex items-center gap-2.5 py-1.5 text-right">
                  <Avatar s={s} size={8} />
                  <span className="flex-1 text-[13px] truncate">{s.display_name}</span>
                  <span className="text-[11px] text-[#A85B00]">
                    {s.ordersNew > 0 ? `${s.ordersNew} הזמנות מחכות` : "חנות ריקה"}
                  </span>
                </button>
              ))}
              {stores.every((s) => s.ordersNew === 0 && !(s.products === 0 && s.status === "active")) && (
                <p className="text-xs text-[#7A7D8A] py-2">הכל מטופל ✨</p>
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
              placeholder="חיפוש לפי שם, לינק או אימייל…"
              className="w-full border border-[#E6E7EC] bg-white rounded-xl px-4 py-2.5 text-sm"
            />
            <div className="flex flex-col gap-2">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => openDetail(s.id)}
                  className="bg-white border border-[#E6E7EC] rounded-xl p-3 text-right hover:border-[#15161B] transition">
                  <div className="flex items-center gap-2.5">
                    <Avatar s={s} size={10} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">{s.display_name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_PILL[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                        {s.claim_token && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EDEEF1] text-[#6B6E7A]">לא נתבעה</span>
                        )}
                        {!s.activated_at && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${s.payment_claimed_at ? "bg-[#FFF3E0] text-[#A85B00]" : "bg-[#EDEEF1] text-[#6B6E7A]"}`}>
                            {s.payment_claimed_at ? "ממתינה לאישור" : "טיוטה"}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#7A7D8A] mt-0.5">
                        {s.views7d} כניסות השבוע · {s.products} מוצרים · {s.ordersTotal} הזמנות · ₪{s.revenue}
                        {s.ordersNew > 0 && <b className="text-[#A85B00]"> · {s.ordersNew} חדשות</b>}
                      </div>
                      <div className="text-[11px] text-[#7A7D8A] mt-0.5">
                        🎯 מסע: {reachedCount(milestones({
                          products: s.products, orders: s.ordersTotal, paidOrders: s.ordersPaid,
                          revenue: s.revenue, views: s.viewsTotal,
                        }))}/7
                        {s.ai_enabled && <span className="text-[#1F7A42]"> · ✨ פרימיום</span>}
                      </div>
                    </div>
                    <span className="text-[#7A7D8A]">‹</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-[#7A7D8A] py-8">לא נמצאו חנויות.</p>
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
            {explore.length === 0 && <p className="text-center text-sm text-[#7A7D8A] py-10">עוד אין חנויות פעילות.</p>}
            {explore.map((s) => (
              <div key={s.id} className="bg-white border border-[#E6E7EC] rounded-xl p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <Avatar s={s} size={10} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{s.display_name}</div>
                    {s.tagline && <div className="text-[11px] text-[#7A7D8A] truncate">{s.tagline}</div>}
                  </div>
                  <a href={`/s/${s.slug}`} target="_blank"
                    className="border border-[#E6E7EC] rounded-lg px-3 py-1.5 text-[11px] whitespace-nowrap">
                    לחנות ←
                  </a>
                </div>
                {s.products.length === 0 ? (
                  <p className="text-[11px] text-[#7A7D8A]">עוד אין מוצרים.</p>
                ) : (
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {s.products.map((p, i) => {
                      const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
                      const out = p.track_stock && p.stock === 0;
                      return (
                        <div key={i} className={`min-w-20 w-20 ${out ? "opacity-45" : ""}`}>
                          <div className="w-20 h-20 rounded-lg bg-[#F5F6F9] flex items-center justify-center text-2xl overflow-hidden relative">
                            {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                            {p.video_key && (
                              <span className="absolute bottom-0.5 left-1 text-[8px] bg-black/60 text-white px-1 rounded">▶</span>
                            )}
                          </div>
                          <div className="text-[10px] truncate mt-0.5">{p.name}</div>
                          <div className="text-[10px] font-bold">₪{p.price}</div>
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
          <div className="fixed bottom-0 inset-x-0 max-w-2xl mx-auto z-50 bg-white rounded-t-3xl px-4 pt-3 pb-8 max-h-[92%] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-1 rounded bg-black/15 mx-auto" />
              <button
                onClick={() => setDetail(null)}
                aria-label="סגירה"
                className="absolute top-3 left-4 w-8 h-8 rounded-full bg-[#F5F6F9] text-[#7A7D8A] text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 mb-1">
              <Avatar s={detail.store} size={12} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold truncate">{detail.store.display_name}</h2>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_PILL[detail.store.status]}`}>
                    {STATUS_LABEL[detail.store.status]}
                  </span>
                </div>
                <div className="text-[11px] text-[#7A7D8A]" dir="ltr">
                  /s/{detail.store.slug} · {displayPhone(detail.store.contact_phone)} · {detail.store.parent_email || "—"}
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 my-3 flex-wrap">
              <a href={waLink(detail.store)} target="_blank"
                className="bg-[#25D366] text-white rounded-lg px-3.5 py-2 text-xs font-medium">
                💬 וואטסאפ לבעלת החנות
              </a>
              <a href={`/s/${detail.store.slug}`} target="_blank"
                className="border border-[#E6E7EC] rounded-lg px-3.5 py-2 text-xs font-medium">
                צפייה בחנות
              </a>
              {(["active", "paused", "blocked"] as const)
                .filter((st) => st !== detail.store.status)
                .map((st) => (
                  <button key={st} onClick={() => setStatus(detail.store.id, st)}
                    className={`border rounded-lg px-3.5 py-2 text-xs font-medium ${st === "blocked" ? "border-[#F0CFD0] text-[#D2373B]" : "border-[#E6E7EC]"}`}>
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
                className="w-full text-right text-[11px] text-[#1F7A42] bg-[#F6FBF7] border border-[#CBE8D4] rounded-lg px-3 py-2 mb-3"
              >
                🔗 החנות עוד לא נתבעה — לחיצה מעתיקה את לינק התביעה
              </button>
            )}

            {/* הפעלה ותשלום */}
            <div
              className={`rounded-xl p-3 mb-3 border ${
                detail.store.activated_at
                  ? "bg-[#F6FBF7] border-[#CBE8D4]"
                  : detail.store.payment_claimed_at
                    ? "bg-[#FFF9EE] border-[#F5E3C2]"
                    : "bg-[#F5F6F9] border-[#E6E7EC]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-bold flex-1">
                  {detail.store.activated_at
                    ? `🚀 באוויר מאז ${new Date(detail.store.activated_at).toLocaleDateString("he-IL")}`
                    : detail.store.payment_claimed_at
                      ? "⏳ הצהירה ששילמה — ממתינה לאישור"
                      : "📝 טיוטה — הלינק סגור"}
                </span>
                {detail.store.activated_at ? (
                  <button
                    onClick={() => setActivation(detail.store.id, false)}
                    className="border border-[#E6E7EC] bg-white rounded-lg px-2.5 py-1.5 text-[11px]"
                  >
                    ביטול הפעלה
                  </button>
                ) : (
                  <button
                    onClick={() => setActivation(detail.store.id, true, 200)}
                    className="bg-[#15161B] text-white rounded-lg px-3 py-1.5 text-[11px] font-medium"
                  >
                    אישור והפעלה
                  </button>
                )}
              </div>
              <div className="text-[11px] text-[#7A7D8A] mt-1.5">
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

            {/* מסע + פרימיום */}
            <div className="bg-[#F5F6F9] rounded-xl p-3 mb-3">
              <div className="text-[11px] text-[#7A7D8A] mb-2">המסע שלה</div>
              <div className="flex flex-wrap gap-1.5">
                {milestones({
                  products: detail.store.products, orders: detail.store.ordersTotal,
                  paidOrders: detail.store.ordersPaid, revenue: detail.store.revenue,
                  views: detail.store.viewsTotal,
                }).map((ms) => (
                  <span key={ms.key} title={ms.title}
                    className={`text-[11px] px-2 py-1 rounded-lg border ${ms.reached ? "bg-[#F6FBF7] border-[#CBE8D4]" : "bg-white border-[#E6E7EC] opacity-50"}`}>
                    <span className={ms.reached ? "" : "grayscale"}>{ms.emoji}</span> {ms.title}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#E6E7EC]">
                <span className="text-[12px] flex-1">
                  ✨ כתיבה אוטומטית (פרימיום)
                  {detail.store.ai_enabled && (
                    <span className="text-[#7A7D8A]">
                      {" · "}{detail.store.ai_credits === null ? "ללא הגבלה" : `${detail.store.ai_credits} נשארו`}
                    </span>
                  )}
                </span>
                {detail.store.ai_enabled ? (
                  <>
                    <button onClick={() => setAi(detail.store.id, true, (detail.store.ai_credits ?? 0) + 50)}
                      className="border border-[#E6E7EC] bg-white rounded-lg px-2.5 py-1.5 text-[11px]">+50</button>
                    <button onClick={() => setAi(detail.store.id, false)}
                      className="border border-[#E6E7EC] bg-white rounded-lg px-2.5 py-1.5 text-[11px]">כיבוי</button>
                  </>
                ) : (
                  <button onClick={() => setAi(detail.store.id, true, 50)}
                    className="bg-[#15161B] text-white rounded-lg px-3 py-1.5 text-[11px] font-medium">
                    הפעלה · 50 תיאורים
                  </button>
                )}
              </div>
            </div>

            {/* כניסות 14 יום */}
            <div className="bg-[#F5F6F9] rounded-xl p-3 mb-3">
              <div className="text-[11px] text-[#7A7D8A] mb-2">כניסות · 14 ימים אחרונים</div>
              <div className="flex items-end gap-1 h-14">
                {buildDays(detail.views).map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.day}: ${d.views}`}>
                    <div className="w-full bg-[#15161B] rounded-sm min-h-[2px]"
                      style={{ height: `${d.pct}%`, opacity: d.views ? 1 : 0.12 }} />
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-[#7A7D8A] mt-1.5">
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
                return (
                  <div key={p.id}
                    className={`flex items-center gap-2.5 border border-[#E6E7EC] rounded-lg p-2 ${p.deleted_at ? "bg-[#FAFAFB] opacity-70" : "bg-white"}`}>
                    <div className="w-9 h-9 rounded-md bg-[#F5F6F9] flex items-center justify-center text-lg overflow-hidden">
                      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-[#7A7D8A]">
                        ₪{p.price}
                        {p.track_stock ? ` · מלאי ${p.stock}` : " · בלי מעקב"}
                        {p.is_visible === false && " · מוסתר"}
                        {p.deleted_at && ` · נמחק ${new Date(p.deleted_at).toLocaleDateString("he-IL")}`}
                      </div>
                    </div>
                    {p.deleted_at && (
                      <button onClick={() => restoreProduct(p.id, detail.store.id)}
                        className="text-[11px] border border-[#E6E7EC] rounded-lg px-2.5 py-1.5">
                        שחזור
                      </button>
                    )}
                  </div>
                );
              })}
              {detail.products.length === 0 && <p className="text-xs text-[#7A7D8A]">עוד אין מוצרים.</p>}
            </div>

            {/* הזמנות אחרונות */}
            <h3 className="text-sm font-bold mb-1.5">הזמנות אחרונות</h3>
            <div className="flex flex-col gap-1.5">
              {detail.orders.map((o) => (
                <div key={o.id} className="flex items-center gap-2 border border-[#E6E7EC] rounded-lg p-2 bg-white text-[12px]">
                  <span className="text-[#7A7D8A]">#{o.order_number}</span>
                  <span className="flex-1 truncate">
                    {o.items.map((i) => `${i.name}×${i.qty}`).join(", ")}
                  </span>
                  <span className="font-medium">₪{o.total}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    o.status === "sent" ? "bg-[#FFF3E0] text-[#A85B00]"
                    : o.status === "paid" ? "bg-[#E4F3E9] text-[#1F7A42]"
                    : o.status === "delivered" ? "bg-[#EDEEF1] text-[#6B6E7A]"
                    : "bg-[#FBE9EA] text-[#D2373B]"}`}>
                    {o.status === "sent" ? "חדש" : o.status === "paid" ? "שולם" : o.status === "delivered" ? "נמסר" : "בוטל"}
                  </span>
                </div>
              ))}
              {detail.orders.length === 0 && <p className="text-xs text-[#7A7D8A]">עוד אין הזמנות.</p>}
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-1/2 translate-x-1/2 bg-[#1B1C22] text-white px-4 py-2.5 rounded-3xl text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </main>
  );
}

/* ---------- helpers ---------- */

function Stat({ label, value, sub, icon }: { label: string; value: number | string; sub: string; icon: string }) {
  return (
    <div className="bg-white border border-[#E6E7EC] rounded-xl p-3">
      <div className="text-lg">{icon}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      <div className="text-[11px] text-[#7A7D8A]">{label} · {sub}</div>
    </div>
  );
}

function Avatar({ s, size }: { s: { avatar_key?: string | null; emoji: string }; size: number }) {
  const url = mediaUrl(s.avatar_key ?? null);
  const px = size * 4;
  return (
    <div className="rounded-full bg-[#F5F6F9] flex items-center justify-center overflow-hidden flex-shrink-0"
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

  // כמה מהלחיצות על "פתחי חנות משלך" הפכו לחנות בפועל
  const conversion = totals.refClicks ? Math.round((totals.referred / totals.refClicks) * 100) : 0;

  const row = (s: AdminStore, depth: number) => (
    <div key={s.id}>
      <button
        onClick={() => onOpen(s.id)}
        className="w-full flex items-center gap-2 py-1.5 text-right"
        style={{ paddingRight: depth * 18 }}
      >
        {depth > 0 && <span className="text-[#C9CBD3] text-[11px]">└</span>}
        <Avatar s={s} size={depth ? 7 : 9} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate">
            {s.display_name}
            {!s.activated_at && (
              <span className="text-[10px] text-[#A85B00] font-normal"> · טיוטה</span>
            )}
          </div>
          <div className="text-[10.5px] text-[#7A7D8A]">
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

      <section className="bg-white border border-[#E6E7EC] rounded-xl p-3">
        <h2 className="text-sm font-bold">אשכולות</h2>
        <p className="text-[11px] text-[#7A7D8A] mb-2">
          חנות שהביאה חנויות אחרות. כאן נמצאות הכיתות והשכונות.
        </p>
        {withCluster.length === 0 && (
          <p className="text-xs text-[#7A7D8A] py-3">עוד אף חנות לא הביאה חנות אחרת.</p>
        )}
        {withCluster.map(({ root, size }) => (
          <div key={root.id} className="border-t border-[#F0F1F4] pt-2 mt-2 first:border-0 first:mt-0 first:pt-0">
            <div className="text-[11px] font-bold text-[#1F7A42] mb-1">אשכול של {size} חנויות</div>
            {row(root, 0)}
          </div>
        ))}
      </section>

      <section className="bg-white border border-[#E6E7EC] rounded-xl p-3">
        <h2 className="text-sm font-bold mb-2">הגיעו לבד · {alone.length}</h2>
        {alone.slice(0, 20).map(({ root }) => row(root, 0))}
        {alone.length > 20 && (
          <p className="text-[11px] text-[#7A7D8A] pt-2">ועוד {alone.length - 20}…</p>
        )}
        {alone.length === 0 && <p className="text-xs text-[#7A7D8A] py-2">אין.</p>}
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
      <div className="bg-white border border-[#E6E7EC] rounded-xl p-3 flex flex-col gap-2">
        <span className="text-sm font-bold">עדכון חדש לבנות</span>
        <div className="flex gap-1.5">
          {["✨", "🎉", "🛍️", "🎬", "💡", "🚀"].map((e) => (
            <button key={e} onClick={() => setEmoji(e)}
              className={`w-9 h-9 rounded-lg border-[1.5px] text-lg ${emoji === e ? "border-[#15161B]" : "border-[#E6E7EC]"}`}>
              {e}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
          placeholder="כותרת — למשל: אפשר להעלות וידאו!"
          className="border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3}
          placeholder="מה חדש? כתבי לבנות בשפה שלהן…"
          className="border border-[#E6E7EC] rounded-lg px-3 py-2.5 text-sm resize-none" />
        <button onClick={publish} disabled={busy || !title.trim() || !body.trim()}
          className="bg-[#15161B] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
          {busy ? "מפרסמים…" : "פרסום לכל הדשבורדים"}
        </button>
      </div>

      {news.map((n) => (
        <div key={n.id} className="bg-white border border-[#E6E7EC] rounded-xl p-3">
          <div className="flex items-start gap-2">
            <span className="text-xl">{n.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{n.title}</div>
              <p className="text-[13px] text-[#3A3C46] whitespace-pre-line mt-0.5">{n.body}</p>
              <div className="text-[10px] text-[#7A7D8A] mt-1">
                {new Date(n.created_at).toLocaleDateString("he-IL")}
              </div>
            </div>
            <button onClick={() => remove(n.id)} className="text-[11px] text-[#D2373B] underline">
              מחיקה
            </button>
          </div>
        </div>
      ))}
      {news.length === 0 && <p className="text-center text-sm text-[#7A7D8A] py-6">עוד לא פרסמת עדכונים.</p>}
    </div>
  );
}
