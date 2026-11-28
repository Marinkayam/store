"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "../use-store";
import CityPicker from "@/app/city-picker";
import HomeStall from "@/app/home-stall";
import { localityName } from "@/lib/localities";
import type { MarketStall } from "@/lib/market";
import { mediaUrl } from "@/lib/media";
import { formatPrice } from "@/lib/money";
import { storePath } from "@/lib/short-link";

/**
 * השוק של העיר (0077).
 *
 * מרינה, 11.2026: "שיהיה עיר, ואז יהיה אחד ליד השני, ואז כשנגדל נוכל
 * לסווג את זה בשכונות". שלב 1 של העיר הקהילתית מהאב-טיפוס: בוחרים עיר
 * מהרשימה הרשמית, ההורים מאשרים בלינק, ואז רואים את הדוכנים מאותה עיר
 * ומזמינים חברים. בלי שמות של ילדים: רק שם הדוכן והמוצרים. השוק נראה רק
 * למי שבתוכו.
 *
 * הזמנה מחבר: /market?c=…&from=… שומר את ההזמנה במכשיר, וכאן העיר נבחרת מראש.
 */

type Data = {
  state: "none" | "parent" | "active";
  cityId: number | null;
  parentPath?: string;
  stalls?: MarketStall[];
  unavailable?: boolean;
};

const INVITE_KEY = "duchan-market-invite";

export default function MarketPage() {
  const { store, loading } = useStore();
  const [data, setData] = useState<Data | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    if (!store) return;
    try {
      const r = await fetch(`/api/market?storeId=${store.id}`, { cache: "no-store" });
      setData(r.ok ? await r.json() : { state: "none", cityId: null, unavailable: true });
    } catch {
      setData({ state: "none", cityId: null, unavailable: true });
    }
  }, [store]);
  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  if (loading || (store && !data)) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;
  if (!store || !data) return null;

  const city = localityName(data.cityId);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const parentLink = data.parentPath ? `${origin}${data.parentPath}` : "";
  const parentWa = `https://wa.me/?text=${encodeURIComponent(`היי! רציתי להכניס את הדוכן שלי "${store.display_name}" לשוק של ${city ?? "העיר"}, ליד הדוכנים של ילדים מהעיר. צריך אישור שלכם:\n${parentLink}`)}`;

  return (
    <div>
      <header className="bg-[var(--canvas)] px-gutter pt-6 pb-4 border-b border-[var(--line)]">
        <a href="/dashboard/settings" className="text-[13px] text-[var(--muted)] underline">חזרה</a>
        <h1 className="text-[20px] font-bold mt-1" data-testid="market-title">
          {data.state === "active" && city ? `השוק של ${city}` : "השוק של העיר"}
        </h1>
        <p className="text-[13px] text-[var(--muted)] mt-0.5">
          {data.state === "active" ? "הדוכנים של ילדים מהעיר, אחד ליד השני" : "הדוכן שלכם, ליד הדוכנים של ילדים מהעיר"}
        </p>
      </header>

      <div className="px-gutter pt-5 pb-10 flex flex-col gap-5">
        {data.unavailable ? (
          <p className="text-[13.5px] text-[var(--muted)]">השוק של העיר עוד לא פתוח. נסו שוב מחר.</p>
        ) : choosing || data.state === "none" ? (
          <Choose
            storeId={store.id}
            initialCity={data.cityId}
            onDone={async () => {
              setChoosing(false);
              await load();
            }}
            onCancel={data.state !== "none" ? () => setChoosing(false) : undefined}
          />
        ) : data.state === "parent" ? (
          <section className="bg-white border border-[var(--line)] p-4" data-testid="market-wait-parent">
            <h2 className="text-[16px] font-bold">מחכים לאישור של ההורים</h2>
            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">
              שולחים להורים את הלינק, והם מאשרים שם. מיד אחרי זה הדוכן בשוק של {city}.
            </p>
            <a href={parentWa} target="_blank" rel="noopener noreferrer" className="mt-4 block text-center bg-[var(--whatsapp)] text-white py-3 text-[14px] font-bold" data-testid="market-send-parent">
              לשלוח להורים בוואטסאפ
            </a>
            <button
              onClick={() => navigator.clipboard?.writeText(parentLink).then(() => showToast("הלינק הועתק"), () => {})}
              className="mt-2 w-full min-h-11 text-[13.5px] underline"
            >
              להעתיק את הלינק
            </button>
            <button onClick={() => setChoosing(true)} className="w-full min-h-10 text-[13px] text-[var(--muted)] underline">
              לבחור עיר אחרת
            </button>
          </section>
        ) : (
          <Market data={data} city={city ?? ""} slug={store.slug} storeId={store.id} onLeft={load} onToast={showToast} />
        )}
      </div>
      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">{toast}</div>
      )}
    </div>
  );
}

function Choose({ storeId, initialCity, onDone, onCancel }: { storeId: string; initialCity: number | null; onDone: () => void; onCancel?: () => void }) {
  const [city, setCity] = useState<number | null>(initialCity);
  const [invite, setInvite] = useState<{ c: number; from?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // הזמנה מחבר (/market?c=…): העיר נבחרת מראש
  useEffect(() => {
    try {
      const inv = JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null");
      if (inv?.c && localityName(Number(inv.c))) {
        setInvite({ c: Number(inv.c), from: inv.from });
        setCity(Number(inv.c));
      }
    } catch {}
  }, []);

  async function submit() {
    if (!city) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, cityId: city, ...(invite && invite.c === city && invite.from ? { invitedBy: invite.from } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "לא נשמר. אפשר לנסות שוב");
      else {
        try {
          localStorage.removeItem(INVITE_KEY);
        } catch {}
        onDone();
      }
    } catch {
      setErr("אין חיבור. אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" data-testid="market-choose">
      <div className="text-center">
        <HomeStall name="השוק של העיר" className="w-full max-w-[240px] mx-auto block" />
        <p className="text-[14px] leading-relaxed mt-1">
          הדוכן שלכם יעמוד ליד הדוכנים של ילדים מהעיר. אתם רואים את הדוכנים שלהם, והם רואים את שלכם.
        </p>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
          רואים רק את שם הדוכן והמוצרים. בלי שמות, בלי שכונה ובלי כתובת. ההורים מאשרים לפני שהדוכן נכנס.
        </p>
      </div>

      <CityPicker value={city} onChange={setCity} label="באיזו עיר?" />
      {invite && invite.c === city && <p className="text-[12.5px] text-[var(--muted)] -mt-2" data-testid="market-invited">הזמינו אתכם לשוק של {localityName(city)}</p>}

      {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
      <button onClick={submit} disabled={!city || busy} className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold disabled:opacity-40" data-testid="market-submit">
        להמשיך: אישור של ההורים
      </button>
      {onCancel && (
        <button onClick={onCancel} className="min-h-10 text-[13px] underline text-[var(--muted)]">
          ביטול
        </button>
      )}
    </section>
  );
}

function Market({
  data,
  city,
  slug,
  storeId,
  onLeft,
  onToast,
}: {
  data: Data;
  city: string;
  slug: string;
  storeId: string;
  onLeft: () => void;
  onToast: (m: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const stalls = data.stalls ?? [];
  const others = stalls.filter((s) => !s.mine).length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteText = `יש לי דוכן בשוק של ${city}! בואו לפתוח דוכן לידי:\n${origin}/market?c=${data.cityId}&from=${slug}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteText });
      } catch {}
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, "_blank", "noopener");
  }

  async function leave() {
    await fetch("/api/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, action: "leave" }) });
    onToast("יצאתם מהשוק");
    onLeft();
  }

  return (
    <>
      <section className="bg-white border border-[var(--line)] p-4" data-testid="market-invite">
        <h2 className="text-[15px] font-bold">{others ? `${others} ${others === 1 ? "דוכן" : "דוכנים"} מ${city}` : "אתם הראשונים בשוק!"}</h2>
        <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-1">
          {others ? "מזמינים עוד חברים מהעיר, והשוק גדל." : "מזמינים חברים מהעיר לפתוח דוכן לידכם."}
        </p>
        <button onClick={share} className="mt-3 w-full bg-[var(--ink)] text-white py-3 text-[14px] font-bold" data-testid="market-invite-btn">
          להזמין חברים
        </button>
      </section>

      <ul className="grid grid-cols-2 gap-3" data-testid="market-stalls">
        {stalls.map((s) => (
          <li key={s.slug} className={`bg-white border ${s.mine ? "border-[var(--ink)]" : "border-[var(--line)]"}`} data-testid="market-stall">
            <a href={storePath(s.slug)} target="_blank" rel="noopener noreferrer" className="block p-2">
              <HomeStall name={s.name} className="w-full block" />
              <div className="text-[13px] font-bold truncate mt-1">{s.mine ? `${s.name} (שלכם)` : s.name}</div>
              {s.away && <div className="text-[11.5px] text-[var(--muted)]">בחופשה</div>}
              {s.products.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {s.products.map((p, i) => {
                    const src = mediaUrl(p.image_key);
                    return src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt={p.name} loading="lazy" className="w-1/3 aspect-square object-cover bg-[var(--sub)]" />
                    ) : (
                      <span key={i} className="w-1/3 aspect-square bg-[var(--sub)] text-[10px] leading-tight p-1 overflow-hidden" title={p.name}>
                        {p.name}
                      </span>
                    );
                  })}
                </div>
              )}
              {s.products[0] && <div className="text-[11.5px] text-[var(--muted)] mt-1 truncate">מ-₪{formatPrice(Math.min(...s.products.map((p) => p.price)))}</div>}
            </a>
          </li>
        ))}
      </ul>

      <div className="text-center">
        {leaving ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px]">לצאת מהשוק? הדוכן ימשיך לעבוד עם הלינק.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={leave} className="min-h-10 px-4 border border-[var(--line)] bg-white text-[13px]" data-testid="market-leave-yes">לצאת</button>
              <button onClick={() => setLeaving(false)} className="min-h-10 px-4 text-[13px] underline">להישאר</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setLeaving(true)} className="min-h-10 text-[12.5px] text-[var(--muted)] underline" data-testid="market-leave">
            לצאת מהשוק של העיר
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-[var(--faint)] text-center leading-relaxed">רק מי שבשוק רואה את השוק</p>
    </>
  );
}
