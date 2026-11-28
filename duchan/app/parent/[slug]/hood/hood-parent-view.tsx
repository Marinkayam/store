"use client";

import { useState } from "react";
import HomeStall from "@/app/home-stall";

/**
 * דף ההורה לשוק של השכונה (0077). פונים להורה ברבים.
 * מה זה, מי יראה את הדוכן, מה לא נחשף, ושני כפתורים: מאשרים / לא עכשיו.
 * כשהשכונה לא ברשימה, ההורה כותב את השם, ואנחנו בודקים אותו.
 */
export default function HoodParentView(p: {
  valid: boolean;
  slug: string;
  token: string;
  name: string;
  state: string;
  city: string;
  hood: string | null;
}) {
  const [state, setState] = useState(p.state);
  const [hoodName, setHoodName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const needsName = state === "parent" && !p.hood;

  async function send(approve: boolean) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/parent/hood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: p.slug, t: p.token, approve, name: hoodName }),
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
          <p className="text-center text-[14px] text-[var(--muted)] mt-16" data-testid="hood-parent-invalid">
            הלינק לא תקין. אפשר לבקש שישלחו אותו שוב.
          </p>
        ) : (
          <>
            <HomeStall name={p.name} className="w-full max-w-[280px] mx-auto block" />
            {state === "active" ? (
              <Done title="תודה! הדוכן בשוק של השכונה" body={`"${p.name}" נמצא עכשיו ב${p.hood ?? "שוק של השכונה"}, ליד הדוכנים של השכנים.`} testid="hood-parent-active" />
            ) : state === "review" ? (
              <Done title="תודה! קיבלנו" body="אנחנו בודקים את שם השכונה, ואחר כך הדוכן ייכנס לשוק. לא צריך לעשות שום דבר נוסף." testid="hood-parent-review" />
            ) : state === "none" ? (
              <Done title="בסדר גמור" body="הדוכן לא בשוק של השכונה. הוא ממשיך לעבוד כמו קודם, עם הלינק." testid="hood-parent-none" />
            ) : state === "rejected" ? (
              <Done title="לא מצאנו את השכונה" body="אפשר לבקש מהילדים לבחור שוב שכונה מהרשימה." testid="hood-parent-rejected" />
            ) : (
              <section data-testid="hood-parent-ask">
                <p className="text-[13px] font-bold text-[var(--lavender-deep)] mt-1 text-center">להורים</p>
                <h1 className="text-[24px] font-black leading-tight text-center">
                  &quot;{p.name}&quot; רוצה להיכנס לשוק של השכונה
                </h1>
                <p className="text-[14px] text-[var(--muted)] leading-relaxed mt-2 text-center">
                  {p.hood ? `${p.hood}, ${p.city}.` : `ב${p.city}.`} בשוק עומדים הדוכנים של ילדים מהשכונה, וכל אחד רואה את הדוכנים של השכנים.
                </p>

                <div className="mt-5 bg-white border border-[var(--line)] p-4 flex flex-col gap-3">
                  <Item title="מי יראה את הדוכן" body="רק דוכנים מאותה שכונה, שההורים שלהם אישרו כמוכם. מי שלא בשוק לא רואה אותו." />
                  <Item title="מה רואים" body="את שם הדוכן והמוצרים, כמו בלינק של הדוכן." />
                  <Item title="מה לא רואים" body="שם פרטי, שם משפחה, טלפון, כתובת, רחוב ובית ספר." />
                  <Item title="ההזמנות" body="עובדות כמו היום, בוואטסאפ. אפשר לצאת מהשוק מתי שרוצים." />
                </div>

                {needsName && (
                  <label className="block mt-4 text-[14px] font-bold">
                    השכונה לא הייתה ברשימה. איך קוראים לה?
                    <input
                      value={hoodName}
                      onChange={(e) => setHoodName(e.target.value)}
                      maxLength={40}
                      placeholder="למשל: נווה אילן"
                      className="mt-1.5 w-full border border-[var(--line)] bg-white px-3.5 py-3 text-[15px] font-normal"
                      data-testid="hood-parent-name"
                    />
                    <span className="block text-[12.5px] text-[var(--muted)] font-normal mt-1">רק שם השכונה, בלי רחוב. אנחנו בודקים אותו לפני שהדוכן נכנס.</span>
                  </label>
                )}

                {err && <p role="alert" className="text-[13px] text-[var(--danger)] mt-3">{err}</p>}
                <div className="flex flex-col gap-2 mt-5">
                  <button
                    onClick={() => send(true)}
                    disabled={busy || (needsName && hoodName.trim().length < 2)}
                    className="bg-[var(--ink)] text-white py-3.5 text-[15px] font-bold disabled:opacity-40"
                    data-testid="hood-parent-approve"
                  >
                    מאשרים
                  </button>
                  <button onClick={() => send(false)} disabled={busy} className="min-h-11 text-[14px] underline" data-testid="hood-parent-decline">
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
