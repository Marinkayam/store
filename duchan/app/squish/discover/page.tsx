"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/media";
import {
  conditionLabel,
  MIN_ITEMS,
  sizeLabel,
  typeLabel,
  type SquishItem,
} from "@/lib/squish";
import { ConnectionContext, EmptyCollection, SquishOutline, SwapGlyph } from "../components";

/**
 * לגלות — כרטיס אחד בכל פעם, והכרטיס הוא הסקווישי ולא הילדה.
 *
 * הפריטים מגיעים מהשרת, שמחשב מי במעגל. לעולם לא שולחים לדפדפן רשימה
 * מלאה ומסננים אותה שם. אין כאן GPS, בית ספר או חיפוש פומבי — רק חברות
 * ישירות, וחברות של חברות אם ככה הוגדר.
 *
 * החלקה נתמכת, אבל אף פעם לא לבדה: שני הכפתורים גלויים תמיד.
 */

interface Card {
  item: Partial<SquishItem>;
  owner: { nickname: string; code: string };
  context: string;
  interested: boolean;
}

export default function Discover() {
  const [cards, setCards] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "no-collection" | "no-circle">("loading");
  const [toast, setToast] = useState("");
  const [drag, setDrag] = useState(0);
  const [start, setStart] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/squish/discover");
    if (!res.ok) return setState("no-collection");
    const d = await res.json();
    if (d.reason === "no-collection") return setState("no-collection");
    setCards(d.cards ?? []);
    setState(d.circle ? "ready" : "no-circle");
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1800);
  };

  const current = cards[i];
  const next = () => {
    setDrag(0);
    setI((v) => v + 1);
  };

  async function interested() {
    if (!current) return;
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) return;
    const { error } = await supa
      .from("squish_interests")
      .insert({ item_id: current.item.id!, user_id: auth.user.id });
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.error("[squish] interest failed:", error.message);
      showToast("לא הצלחנו לשמור, לנסות שוב");
      return;
    }
    setCards((c) => c.map((x, ix) => (ix === i ? { ...x, interested: true } : x)));
    showToast(`${current.owner.nickname} תראה שזה מעניין אותך`);
  }

  const onUp = () => {
    if (Math.abs(drag) > 90) {
      if (drag > 0) interested();
      else next();
    }
    setDrag(0);
    setStart(null);
  };

  if (state === "loading") return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  if (state === "no-collection")
    return (
      <EmptyCollection
        title="קודם בונים אוסף"
        body={`צריך ${MIN_ITEMS} סקווישים באוסף שלך לפני שנכנסים לגלות, כדי שיהיה לך גם מה להציע בתמורה.`}
        cta="להתחיל את האוסף שלי"
        href="/squish/new"
      />
    );

  if (!cards.length || !current)
    return (
      <EmptyCollection
        title={state === "no-circle" ? "עדיין אין גלריות במעגל שלך" : "ראית הכל להיום"}
        body={
          state === "no-circle"
            ? "הזמיני חברה שאוספת סקווישים, ותוכלו לראות מה יש אחת לשנייה."
            : "ראית את כל הסקווישים שפתוחים עכשיו לטרייד. כשחברה תוסיף משהו חדש, הוא יופיע כאן."
        }
        cta={state === "no-circle" ? "להזמין חברה" : "לאוסף שלי"}
        href={state === "no-circle" ? "/squish/me" : "/squish/collection"}
      />
    );

  const poster = mediaUrl(current.item.poster_key) ?? mediaUrl(current.item.image_key);
  const video = mediaUrl(current.item.video_key);

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="t-heading">לגלות</h1>
        <span className="t-small text-[var(--muted)]">
          {i + 1} מתוך {cards.length}
        </span>
      </div>

      <div
        key={current.item.id}
        className="squish-reveal bg-white border border-[var(--line)] overflow-hidden select-none touch-pan-y"
        style={{
          transform: `translateX(${drag}px) rotate(${drag / 40}deg)`,
          transition: start === null ? "transform 0.2s ease" : "none",
        }}
        onPointerDown={(e) => setStart(e.clientX)}
        onPointerMove={(e) => start !== null && setDrag(e.clientX - start)}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="relative aspect-[3/4] bg-[var(--cream)] flex items-center justify-center overflow-hidden">
          {video ? (
            <video src={video} poster={poster ?? undefined} muted loop playsInline autoPlay className="w-full h-full object-cover" />
          ) : poster ? (
            <img src={poster} alt="" className="w-full h-full object-cover" draggable={false} />
          ) : (
            <SquishOutline size={80} />
          )}
          <span
            className="absolute top-2 start-2 w-7 h-7 bg-[var(--lavender)] text-white flex items-center justify-center"
            style={{ borderRadius: "999px" }}
            aria-label="פתוח לטרייד"
          >
            <SwapGlyph size={15} />
          </span>
        </div>

        <div className="p-3.5">
          <div className="t-heading">{current.item.name}</div>
          <div className="t-small text-[var(--muted)] mt-1">
            {[
              current.item.squishy_type === "other"
                ? current.item.custom_type || "אחר"
                : typeLabel(current.item.squishy_type!),
              sizeLabel(current.item.size!),
              conditionLabel(current.item.condition!),
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {current.item.condition_note && (
            <div className="t-small text-[var(--muted)] mt-1">{current.item.condition_note}</div>
          )}
          {current.item.wanted_description && (
            <div className="mt-2.5 border-t border-[var(--line)] pt-2.5">
              <div className="t-label">מחפשת</div>
              <div className="t-small mt-0.5">{current.item.wanted_description}</div>
            </div>
          )}
          <div className="mt-2.5 border-t border-[var(--line)] pt-2.5 flex flex-col gap-1">
            <a href={`/squish/c/${current.owner.code}`} className="t-small font-medium underline">
              מהאוסף של {current.owner.nickname}
            </a>
            <ConnectionContext text={current.context} />
          </div>
        </div>
      </div>

      <div className="flex gap-2.5 mt-3.5">
        <button onClick={next} className="flex-1 bg-white border border-[var(--line)] py-3 text-[14px] font-medium">
          לדלג
        </button>
        <button
          onClick={interested}
          disabled={current.interested}
          className="flex-[1.6] bg-[var(--ink)] text-white py-3 text-[14px] font-bold disabled:opacity-45"
        >
          {current.interested ? "סימנת ✓" : "מעניין אותי"}
        </button>
      </div>
      {current.interested ? (
        <div className="bg-white border-[1.5px] border-[var(--lavender)] p-3 mt-2.5 text-center">
          <div className="t-small font-medium">רוצה להציע טרייד?</div>
          <a href={`/squish/trades/new?item=${current.item.id}`} className="btn btn-primary mt-2 t-small">
            לבחור מה להציע
          </a>
          <button onClick={next} className="block w-full t-small underline text-[var(--muted)] mt-2">
            אחר כך, לסקווישי הבא ←
          </button>
        </div>
      ) : (
        <a
          href={`/squish/c/${current.owner.code}`}
          className="block text-center t-small underline text-[var(--muted)] mt-2.5"
        >
          לצפייה בכל האוסף שלה ←
        </a>
      )}

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
