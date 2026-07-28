"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/squish-analytics";

/**
 * כלי הבטיחות של המשתמשת.
 *
 * שלושה עקרונות בעיצוב שלהם:
 *
 * 1. **הם לא צועקים.** הכפתורים שקטים ויושבים בתחתית המסך, כי הרוב
 *    המוחלט של הילדות לא יצטרכו אותם אף פעם — ומסך שמתחיל ב"לחסום"
 *    מלמד שיש ממה לפחד.
 * 2. **הם תמיד שם.** אבל מי שכן צריכה, צריכה עכשיו, ולא אחרי שתמצא
 *    תפריט הגדרות.
 * 3. **הן לא מקבלות מזהה משתמש.** הפעולה נשלחת עם קוד הגלריה, והשרת
 *    מתרגם. מזהה משתמש לא יוצא לדפדפן באף מסך של סקוויש קלאב.
 */

async function safety(body: Record<string, unknown>): Promise<string | null> {
  const r = await fetch("/api/squish/safety", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => null);
  return r.ok ? null : (d?.error ?? "לא הצלחנו, לנסות שוב");
}

/* ══════ חסימה והסרה מהמעגל ══════ */

export function FriendSafety({ code, nickname }: { code: string; nickname: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<"block" | "remove" | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: "block" | "remove_connection") {
    setBusy(true);
    const e = await safety({ action, code });
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    track(action === "block" ? "squish_user_blocked" : "squish_connection_removed");
    router.push("/squish/collection");
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="t-small text-[var(--muted)] underline self-start"
      >
        משהו לא בסדר כאן?
      </button>
    );

  return (
    <div className="border border-[var(--line)] p-3 flex flex-col gap-2">
      {err && <p className="t-small text-[var(--danger)]">{err}</p>}

      {confirm === null && (
        <>
          <div className="t-small font-medium">מה תרצי לעשות?</div>
          <button
            onClick={() => setConfirm("remove")}
            className="border border-[var(--line)] px-3 py-2 text-[13px] text-start"
          >
            להסיר את {nickname} מהמעגל שלי
            <span className="block t-small text-[var(--muted)]">
              לא תראו יותר אחת את האוסף של השנייה. אפשר להתחבר שוב דרך קישור.
            </span>
          </button>
          <button
            onClick={() => setConfirm("block")}
            className="border border-[var(--danger-line)] text-[var(--danger)] px-3 py-2 text-[13px] text-start"
          >
            לחסום את {nickname}
            <span className="block t-small text-[var(--muted)]">
              היא לא תוכל לראות אותך, להציע לך טרייד או למצוא אותך בלגלות.
            </span>
          </button>
          <button onClick={() => setOpen(false)} className="t-small text-[var(--muted)] underline">
            חזרה
          </button>
        </>
      )}

      {confirm === "remove" && (
        <Confirm
          title={`להסיר את ${nickname} מהמעגל?`}
          body="טריידים פתוחים ביניכן ייסגרו, והסקווישים ששמורים בהם יחזרו למצב שהיו בו."
          cta="כן, להסיר"
          busy={busy}
          onYes={() => run("remove_connection")}
          onNo={() => setConfirm(null)}
        />
      )}
      {confirm === "block" && (
        <Confirm
          title={`לחסום את ${nickname}?`}
          body="היא לא תדע שחסמת. טריידים פתוחים ביניכן ייסגרו, והסקווישים ששמורים בהם ישוחררו."
          cta="כן, לחסום"
          danger
          busy={busy}
          onYes={() => run("block")}
          onNo={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ══════ דיווח על פריט ══════ */

const ITEM_REASONS = [
  { key: "not_squishy", label: "זה בכלל לא סקווישי" },
  { key: "inappropriate", label: "התוכן לא מתאים" },
  { key: "someone_elses_photo", label: "זו תמונה של מישהי אחרת" },
  { key: "shows_a_person", label: "מופיע בתמונה אדם" },
  { key: "other", label: "משהו אחר" },
];

export function ReportItem({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  if (done)
    return (
      <p className="t-small text-[var(--muted)]">
        הדיווח נשלח. רק אנחנו רואות אותו, ולא נגלה מי דיווחה.
      </p>
    );

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="t-small text-[var(--muted)] underline self-start">
        לדווח על התמונה או הסרטון
      </button>
    );

  return (
    <div className="border border-[var(--line)] p-3 flex flex-col gap-1.5">
      <div className="t-small font-medium">מה לא בסדר?</div>
      {err && <p className="t-small text-[var(--danger)]">{err}</p>}
      {ITEM_REASONS.map((r) => (
        <button
          key={r.key}
          onClick={async () => {
            const e = await safety({ action: "report_item", itemId, reason: r.key });
            if (e) {
              setErr(e);
              return;
            }
            track("squish_item_reported", { reason: r.key });
            setDone(true);
          }}
          className="border border-[var(--line)] px-3 py-2 text-[13px] text-start"
        >
          {r.label}
        </button>
      ))}
      <button onClick={() => setOpen(false)} className="t-small text-[var(--muted)] underline mt-1">
        חזרה
      </button>
    </div>
  );
}

/* ══════ מחיקת האוסף ══════ */

export function DeleteCollection() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (step === 0)
    return (
      <button onClick={() => setStep(1)} className="t-small text-[var(--muted)] underline self-start">
        למחוק את האוסף שלי
      </button>
    );

  return (
    <div className="border border-[var(--danger-line)] p-3 flex flex-col gap-2">
      {err && <p className="t-small text-[var(--danger)]">{err}</p>}
      <Confirm
        title="למחוק את כל האוסף?"
        body="כל הסקווישים, רשימת המבוקשים והמעגל שלך יימחקו. טריידים פתוחים ייסגרו והפריטים של החברות ישוחררו. אי אפשר לבטל את זה. הדוכן שלך לא נמחק."
        cta="כן, למחוק הכל"
        danger
        busy={busy}
        onYes={async () => {
          setBusy(true);
          const e = await safety({ action: "delete_profile" });
          setBusy(false);
          if (e) {
            setErr(e);
            return;
          }
          track("squish_profile_deleted");
          router.push("/squish");
        }}
        onNo={() => setStep(0)}
      />
    </div>
  );
}

/* ══════ ══════ */

function Confirm({
  title,
  body,
  cta,
  danger,
  busy,
  onYes,
  onNo,
}: {
  title: string;
  body: string;
  cta: string;
  danger?: boolean;
  busy: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="t-small font-medium">{title}</div>
      <p className="text-[12px] text-[var(--muted)] leading-relaxed">{body}</p>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={onYes}
          className={`flex-1 px-3 py-2 text-[13px] font-medium ${
            danger ? "bg-[var(--danger)] text-white" : "bg-[var(--ink)] text-white"
          }`}
        >
          {busy ? "רגע…" : cta}
        </button>
        <button onClick={onNo} className="border border-[var(--line)] px-4 text-[13px]">
          לא
        </button>
      </div>
    </div>
  );
}
