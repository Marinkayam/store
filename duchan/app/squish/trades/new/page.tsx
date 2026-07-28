"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/media";
import { conditionLabel, sizeLabel, typeLabel, type SquishItem, type Wish } from "@/lib/squish";
import { compareOffer, track } from "@/lib/squish-trade";
import { squishError } from "@/lib/squish-errors";
import { SquishOutline } from "../../components";
import { Media, TwoSides } from "../../trade-parts";

/**
 * בניית ההצעה: בוחרים עד שלושה מהאוסף שלי מול סקווישי אחד שלה.
 *
 * שני מסכים בכוונה — בחירה, ואז אישור. שליחה ישירות מהרשת גורמת
 * לשלוח בטעות, וזו הצעה שמגיעה למישהי אמיתית.
 */
export default function NewTradePage() {
  return (
    <Suspense fallback={<div className="p-6 t-small text-[var(--muted)]">רגע…</div>}>
      <NewTrade />
    </Suspense>
  );
}

function NewTrade() {
  const router = useRouter();
  const params = useSearchParams();
  const itemId = params.get("item");
  const [data, setData] = useState<{
    requested: SquishItem;
    owner: { nickname: string };
    wishes: Wish[];
    mine: SquishItem[];
  } | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/squish/offerable?item=${itemId}`);
    const d = await res.json();
    if (!res.ok) return setErr(d.error ?? "משהו השתבש");
    setData(d);
    track("squish_trade_started", { item: String(itemId) });
  }, [itemId]);

  useEffect(() => {
    if (itemId) load();
    else setErr("חסר סקווישי");
  }, [itemId, load]);

  async function send() {
    setBusy(true);
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("squish_send_proposal", {
      p_requested: itemId,
      p_offered: picked,
    });
    setBusy(false);
    if (error) {
      console.error("[squish] send proposal failed:", error.message);
      setErr(squishError(error.message));
      return;
    }
    track("squish_trade_sent", { items: picked.length });
    router.push("/squish/trades?tab=sent");
  }

  if (err)
    return (
      <div className="p-8 text-center flex flex-col items-center gap-3">
        <SquishOutline size={56} />
        <p className="t-body">{err}</p>
        <a href="/squish/discover" className="btn btn-secondary w-full max-w-xs">
          חזרה ללגלות
        </a>
      </div>
    );
  if (!data) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  const chosen = data.mine.filter((i) => picked.includes(i.id));

  if (step === 2)
    return (
      <main className="px-4 py-5 flex flex-col gap-4">
        <h1 className="t-title">זה הטרייד שאת מציעה</h1>

        <TwoSides
          leftLabel="את מקבלת"
          left={[data.requested]}
          rightLabel="את נותנת"
          right={chosen}
        />

        <div className="bg-white border border-[var(--line)] p-3">
          <div className="t-label mb-1.5">מה שכדאי לשים לב אליו</div>
          <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed">
            {compareOffer(data.requested, chosen, data.wishes).map((n, i) => (
              <li key={i}>· {n}</li>
            ))}
          </ul>
          <p className="text-[12px] text-[var(--muted)] mt-2 font-medium">
            אתן מחליטות אם הטרייד מתאים לכן.
          </p>
        </div>

        <button onClick={send} disabled={busy} className="btn btn-primary">
          {busy ? "שולחות…" : "לשלוח הצעה"}
        </button>
        <button onClick={() => setStep(1)} className="btn btn-secondary">
          → לשנות את הבחירה
        </button>
      </main>
    );

  return (
    <main className="px-4 py-5 flex flex-col gap-4 pb-28">
      <h1 className="t-title">מה תרצי להציע?</h1>

      <section>
        <div className="t-label mb-1.5">את רוצה את</div>
        <div className="squish-card">
          <div className="relative aspect-[4/3] bg-[var(--cream)] flex items-center justify-center overflow-hidden">
            <Media item={data.requested} />
          </div>
          <div className="pt-2">
            <div className="t-heading">{data.requested.name}</div>
            <div className="t-small text-[var(--muted)]">
              מהאוסף של {data.owner.nickname} ·{" "}
              {[typeLabel(data.requested.squishy_type), sizeLabel(data.requested.size), conditionLabel(data.requested.condition)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="t-label mb-1.5">בחרי עד 3 סקווישים מהאוסף שלך</div>
        <div className="grid grid-cols-3 gap-2.5">
          {data.mine.map((i) => {
            const on = picked.includes(i.id);
            return (
              <button
                key={i.id}
                onClick={() => {
                  setPicked((p) =>
                    on ? p.filter((x) => x !== i.id) : p.length >= 3 ? p : [...p, i.id]
                  );
                  track("squish_trade_offer_selected", { item: i.id });
                }}
                aria-pressed={on}
                aria-label={`להציע: ${i.name}`}
                className="squish-card text-start"
              >
                <div
                  className="relative aspect-square bg-[var(--cream)] flex items-center justify-center overflow-hidden"
                  style={on ? { outline: "3px solid var(--lavender)", outlineOffset: "-3px" } : undefined}
                >
                  <Media item={i} />
                  {on && (
                    <span
                      className="absolute top-1 start-1 w-5 h-5 bg-[var(--lavender)] text-white text-[11px] flex items-center justify-center"
                      style={{ borderRadius: "999px" }}
                    >
                      ✓
                    </span>
                  )}
                </div>
                <div className="pt-1 text-[12px] truncate">{i.name}</div>
              </button>
            );
          })}
        </div>
        {!data.mine.length && (
          <p className="t-small text-[var(--muted)] py-6 text-center">
            אין באוסף שלך פריטים זמינים להצעה כרגע.
          </p>
        )}
      </section>

      {/* סיכום קבוע בתחתית — תמיד רואים מה נבחר */}
      <div className="fixed bottom-16 inset-x-0 max-w-md mx-auto bg-white border-t border-[var(--line)] px-4 py-3 z-30">
        <div className="flex items-center justify-between gap-3">
          <span className="t-small">
            {picked.length ? `נבחרו ${picked.length} מתוך 3` : "עוד לא בחרת"}
          </span>
          <button
            onClick={() => setStep(2)}
            disabled={!picked.length}
            className="bg-[var(--ink)] text-white px-5 py-2.5 text-[13px] font-bold disabled:opacity-40"
          >
            לבדוק את ההצעה
          </button>
        </div>
      </div>
    </main>
  );
}
