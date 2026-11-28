"use client";

import { useCallback, useEffect, useState } from "react";
import { useStore } from "../use-store";
import CityPicker from "@/app/city-picker";
import HomeStall from "@/app/home-stall";
import { localityName } from "@/lib/localities";
import { hoodTitle, type HoodStall } from "@/lib/hood";
import { mediaUrl } from "@/lib/media";
import { formatPrice } from "@/lib/money";
import { storePath } from "@/lib/short-link";

/**
 * השוק של השכונה (0077).
 *
 * מרינה, 11.2026: "בוא נעשה בשכונה". שלב 1 של העיר הקהילתית מהאב-טיפוס:
 * בוחרים עיר ושכונה מרשימה, ההורים מאשרים בלינק, ואז רואים את הדוכנים של
 * השכנים ומזמינים עוד שכנים. בלי רחוב ובלי בית, ובלי שמות של ילדים: רק
 * שם הדוכן והמוצרים. השוק נראה רק למי שבתוכו.
 *
 * הזמנה משכן: /hood?h=…&from=… שומר את ההזמנה במכשיר, וכאן היא נבחרת מראש.
 */

type Data = {
  state: "none" | "parent" | "review" | "active" | "rejected";
  cityId: number | null;
  hood?: { id: string; name: string } | null;
  requestedName?: string | null;
  parentPath?: string;
  stalls?: HoodStall[];
  unavailable?: boolean;
};

const INVITE_KEY = "duchan-hood-invite";

export default function HoodPage() {
  const { store, loading } = useStore();
  const [data, setData] = useState<Data | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    if (!store) return;
    try {
      const r = await fetch(`/api/hood?storeId=${store.id}`, { cache: "no-store" });
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

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const parentLink = data.parentPath ? `${origin}${data.parentPath}` : "";
  const parentWa = `https://wa.me/?text=${encodeURIComponent(`היי! רציתי להכניס את הדוכן שלי "${store.display_name}" לשוק של השכונה, ליד הדוכנים של השכנים. צריך אישור שלכם:\n${parentLink}`)}`;
  const title = data.hood ? hoodTitle(data.hood.name) : "השוק של השכונה";

  return (
    <div>
      <header className="bg-[var(--canvas)] px-gutter pt-6 pb-4 border-b border-[var(--line)]">
        <a href="/dashboard/settings" className="text-[13px] text-[var(--muted)] underline">חזרה</a>
        <h1 className="text-[20px] font-bold mt-1" data-testid="hood-title">{data.state === "active" ? title : "השוק של השכונה"}</h1>
        <p className="text-[13px] text-[var(--muted)] mt-0.5">
          {data.state === "active" ? `${localityName(data.cityId) ?? ""} · הדוכנים של השכנים` : "הדוכן שלכם, ליד הדוכנים של ילדים מהשכונה"}
        </p>
      </header>

      <div className="px-gutter pt-5 pb-10 flex flex-col gap-5">
        {data.unavailable ? (
          <p className="text-[13.5px] text-[var(--muted)]">השוק של השכונה עוד לא פתוח. נסו שוב מחר.</p>
        ) : choosing || data.state === "none" || data.state === "rejected" ? (
          <Choose
            storeId={store.id}
            initialCity={data.cityId}
            rejected={data.state === "rejected" && !choosing}
            onDone={async () => {
              setChoosing(false);
              await load();
            }}
            onCancel={data.state !== "none" && data.state !== "rejected" ? () => setChoosing(false) : undefined}
          />
        ) : data.state === "parent" ? (
          <section className="bg-white border border-[var(--line)] p-4" data-testid="hood-wait-parent">
            <h2 className="text-[16px] font-bold">מחכים לאישור של ההורים</h2>
            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">
              {data.hood ? `${hoodTitle(data.hood.name)}, ${localityName(data.cityId) ?? ""}. ` : ""}
              שולחים להורים את הלינק, והם מאשרים שם. מיד אחרי זה הדוכן בשוק.
            </p>
            <a href={parentWa} target="_blank" rel="noopener noreferrer" className="mt-4 block text-center bg-[var(--whatsapp)] text-white py-3 text-[14px] font-bold" data-testid="hood-send-parent">
              לשלוח להורים בוואטסאפ
            </a>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(parentLink).then(() => showToast("הלינק הועתק"), () => {});
              }}
              className="mt-2 w-full min-h-11 text-[13.5px] underline"
            >
              להעתיק את הלינק
            </button>
            <button onClick={() => setChoosing(true)} className="w-full min-h-10 text-[13px] text-[var(--muted)] underline">
              לבחור שכונה אחרת
            </button>
          </section>
        ) : data.state === "review" ? (
          <section className="bg-white border border-[var(--line)] p-4" data-testid="hood-review">
            <h2 className="text-[16px] font-bold">ההורים אישרו!</h2>
            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">
              השכונה שלכם עוד לא הייתה ברשימה, אז אנחנו בודקים את השם. אחרי זה הדוכן ייכנס לשוק, ולא צריך לעשות שום דבר.
            </p>
          </section>
        ) : (
          <Market data={data} storeName={store.display_name} slug={store.slug} storeId={store.id} onLeft={load} onToast={showToast} />
        )}
      </div>
      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">{toast}</div>
      )}
    </div>
  );
}

function Choose({
  storeId,
  initialCity,
  rejected,
  onDone,
  onCancel,
}: {
  storeId: string;
  initialCity: number | null;
  rejected: boolean;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [city, setCity] = useState<number | null>(initialCity);
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [pick, setPick] = useState<string | null>(null); // מזהה שכונה, או "other"
  const [invite, setInvite] = useState<{ id: string; from?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // הזמנה משכן (/hood?h=…): העיר והשכונה נבחרות מראש
  useEffect(() => {
    let inv: { h?: string; from?: string } | null = null;
    try {
      inv = JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null");
    } catch {}
    if (!inv?.h) return;
    fetch(`/api/hood?storeId=${storeId}&invite=${inv.h}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.hood) return;
        setInvite({ id: j.hood.id, from: inv!.from });
        setCity(j.hood.cityId);
        setPick(j.hood.id);
      })
      .catch(() => {});
  }, [storeId]);

  useEffect(() => {
    if (!city) {
      setList(null);
      return;
    }
    setList(null);
    fetch(`/api/hood?storeId=${storeId}&cityId=${city}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setList(j.items ?? []))
      .catch(() => setList([]));
  }, [city, storeId]);

  async function submit() {
    if (!city || !pick) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/hood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          cityId: city,
          ...(pick === "other" ? { other: true } : { neighborhoodId: pick }),
          ...(invite && invite.id === pick && invite.from ? { invitedBy: invite.from } : {}),
        }),
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
    <section className="flex flex-col gap-4" data-testid="hood-choose">
      {rejected ? (
        <p className="bg-white border border-[var(--line)] p-3.5 text-[13.5px] leading-relaxed">
          לא מצאנו את השכונה שכתבתם. אפשר לבחור שכונה מהרשימה, או לכתוב שוב עם ההורים.
        </p>
      ) : (
        <div className="text-center">
          <HomeStall name="השוק של השכונה" className="w-full max-w-[240px] mx-auto block" />
          <p className="text-[14px] leading-relaxed mt-1">
            הדוכן שלכם יעמוד ליד הדוכנים של ילדים מהשכונה. אתם רואים את הדוכנים שלהם, והם רואים את שלכם.
          </p>
          <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
            רואים רק את שם הדוכן והמוצרים. בלי שמות, בלי רחוב ובלי כתובת. ההורים מאשרים לפני שהדוכן נכנס.
          </p>
        </div>
      )}

      <CityPicker value={city} onChange={(id) => { setCity(id); setPick(null); }} label="באיזו עיר?" />

      {city && (
        <fieldset>
          <legend className="text-[14px] font-bold mb-2">באיזו שכונה ב{localityName(city)}?</legend>
          {list === null ? (
            <p className="text-[13px] text-[var(--muted)]">רגע…</p>
          ) : (
            <div className="flex flex-col gap-2" role="radiogroup">
              {list.length === 0 && (
                <p className="text-[13px] text-[var(--muted)] leading-relaxed" data-testid="hood-first">
                  עוד אין שכונות ב{localityName(city)}. אתם הראשונים! ההורים יכתבו את שם השכונה.
                </p>
              )}
              {list.map((h) => (
                <Choice key={h.id} on={pick === h.id} onClick={() => setPick(h.id)} testid="hood-option">
                  {hoodTitle(h.name)}
                  {invite?.id === h.id && <span className="text-[12px] text-[var(--muted)] font-normal"> · הזמינו אתכם לכאן</span>}
                </Choice>
              ))}
              <Choice on={pick === "other"} onClick={() => setPick("other")} testid="hood-other">
                {list.length ? "השכונה שלנו לא ברשימה" : "להוסיף את השכונה שלנו"}
              </Choice>
              {pick === "other" && (
                <p className="text-[12.5px] text-[var(--muted)] leading-relaxed">ההורים יכתבו את שם השכונה כשהם מאשרים, ואנחנו נבדוק אותו.</p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {err && <p role="alert" className="text-[13px] text-[var(--danger)]">{err}</p>}
      <button
        onClick={submit}
        disabled={!city || !pick || busy}
        className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold disabled:opacity-40"
        data-testid="hood-submit"
      >
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

function Choice({ on, onClick, testid, children }: { on: boolean; onClick: () => void; testid: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      data-testid={testid}
      className={`min-h-12 px-4 text-right text-[14px] border ${on ? "border-[var(--ink)] bg-white font-bold" : "border-[var(--line)] bg-white"}`}
    >
      {children}
    </button>
  );
}

function Market({
  data,
  storeName,
  slug,
  storeId,
  onLeft,
  onToast,
}: {
  data: Data;
  storeName: string;
  slug: string;
  storeId: string;
  onLeft: () => void;
  onToast: (m: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const stalls = data.stalls ?? [];
  const others = stalls.filter((s) => !s.mine).length;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const invite = `${origin}/hood?h=${data.hood!.id}&from=${slug}`;
  const inviteText = `יש לי דוכן בשוק של השכונה! בואו לפתוח דוכן לידי:\n${invite}`;

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: inviteText });
        return;
      } catch {
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(inviteText)}`, "_blank", "noopener");
  }

  async function leave() {
    await fetch("/api/hood", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, action: "leave" }) });
    onToast("יצאתם מהשוק");
    onLeft();
  }

  return (
    <>
      <section className="bg-white border border-[var(--line)] p-4" data-testid="hood-invite">
        <h2 className="text-[15px] font-bold">{others ? `${others} ${others === 1 ? "דוכן" : "דוכנים"} של שכנים` : "אתם הראשונים בשוק!"}</h2>
        <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-1">
          {others ? "מזמינים עוד שכנים, והשוק גדל." : "מזמינים חברים מהשכונה לפתוח דוכן לידכם."}
        </p>
        <button onClick={share} className="mt-3 w-full bg-[var(--ink)] text-white py-3 text-[14px] font-bold" data-testid="hood-invite-btn">
          להזמין שכנים
        </button>
      </section>

      <ul className="grid grid-cols-2 gap-3" data-testid="hood-stalls">
        {stalls.map((s) => (
          <li key={s.slug} className={`bg-white border ${s.mine ? "border-[var(--ink)]" : "border-[var(--line)]"}`} data-testid="hood-stall">
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
              <button onClick={leave} className="min-h-10 px-4 border border-[var(--line)] bg-white text-[13px]" data-testid="hood-leave-yes">לצאת</button>
              <button onClick={() => setLeaving(false)} className="min-h-10 px-4 text-[13px] underline">להישאר</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setLeaving(true)} className="min-h-10 text-[12.5px] text-[var(--muted)] underline" data-testid="hood-leave">
            לצאת מהשוק של השכונה
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-[var(--faint)] text-center leading-relaxed">
        {storeName} · רק מי שבשוק רואה את השוק
      </p>
    </>
  );
}
