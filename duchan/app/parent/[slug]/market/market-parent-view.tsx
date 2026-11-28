"use client";

import { useState } from "react";
import HomeStall from "@/app/home-stall";

/**
 * דף ההורה לשוק של העיר (0077). פונים להורה ברבים.
 * מה זה, מי יראה את הדוכן, מה לא נחשף, ושני כפתורים: מאשרים / לא עכשיו.
 */
export default function MarketParentView(p: { valid: boolean; slug: string; token: string; name: string; state: string; city: string }) {
  const [state, setState] = useState(p.state);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(approve: boolean) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/parent/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: p.slug, t: p.token, approve }),
      });
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "משהו השתבש. אפשר לנסות שוב");
      else setState(j.state);
    } catch {
      setErr("אין חיבור. אפשר לנסות שוב");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <div className="w-full max-w-md mx-auto px-gutter pt-6 pb-10">
        {!p.valid ? (
          <p className="text-center text-[14px] text-[var(--muted)] mt-16" data-testid="market-parent-invalid">
            הלינק לא תקין. אפשר לבקש שישלחו אותו שוב.
          </p>
        ) : (
          <>
            <HomeStall name={p.name} className="w-full max-w-[280px] mx-auto block" />
            {state === "active" ? (
              <Done title="תודה! הדוכן בשוק של העיר" body={`"${p.name}" עומד עכשיו בשוק של ${p.city}, ליד הדוכנים של ילדים מהעיר.`} testid="market-parent-active" />
            ) : state === "none" ? (
              <Done title="בסדר גמור" body="הדוכן לא בשוק של העיר. הוא ממשיך לעבוד כמו קודם, עם הלינק." testid="market-parent-none" />
            ) : (
              <section data-testid="market-parent-ask">
                <p className="text-[13px] font-bold text-[var(--lavender-deep)] mt-1 text-center">להורים</p>
                <h1 className="text-[24px] font-black leading-tight text-center">
                  &quot;{p.name}&quot; רוצה להיכנס לשוק של {p.city}
                </h1>
                <p className="text-[14px] text-[var(--muted)] leading-relaxed mt-2 text-center">
                  בשוק עומדים זה ליד זה הדוכנים של ילדים מ{p.city}, וכל אחד רואה את הדוכנים של האחרים.
                </p>

                <div className="mt-5 bg-white border border-[var(--line)] p-4 flex flex-col gap-3">
                  <Item title="מי יראה את הדוכן בשוק" body={`רק דוכנים מ${p.city} שההורים שלהם אישרו כמוכם. מי שלא בשוק לא רואה את השוק.`} />
                  <Item title="מה רואים" body="את שם הדוכן והמוצרים, כמו בלינק של הדוכן." />
                  <Item title="מה לא רואים" body="שם פרטי, שם משפחה, טלפון, כתובת, שכונה ובית ספר." />
                  <Item title="ההזמנות" body="עובדות כמו היום, בוואטסאפ. אפשר לצאת מהשוק מתי שרוצים." />
                </div>

                {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">{err}</p>}
                <div className="flex flex-col gap-2 mt-5">
                  <button onClick={() => send(true)} disabled={busy} className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold disabled:opacity-40" data-testid="market-parent-approve">
                    מאשרים
                  </button>
                  <button onClick={() => send(false)} disabled={busy} className="min-h-11 text-[14px] underline" data-testid="market-parent-decline">
                    לא עכשיו
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Item({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-[14px] font-bold leading-snug">{title}</div>
      <div className="text-[13px] text-[var(--muted)] leading-relaxed">{body}</div>
    </div>
  );
}

function Done({ title, body, testid }: { title: string; body: string; testid: string }) {
  return (
    <div className="text-center mt-2" data-testid={testid}>
      <h1 className="text-[24px] font-black leading-tight">{title}</h1>
      <p className="text-[14px] text-[var(--muted)] leading-relaxed mt-2">{body}</p>
    </div>
  );
}
