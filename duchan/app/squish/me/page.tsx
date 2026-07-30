"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  SQUISH_VISIBILITY,
  squishCode,
  INVITE_DAYS,
  INVITE_MAX_USES,
  type SquishProfile,
  type SquishVisibility,
} from "@/lib/squish";
import { track } from "@/lib/squish-analytics";
import { ConnectionContext, SwapGlyph } from "../components";
import { DeleteCollection } from "../safety";

/**
 * "שלי" — כאן מנהלים את המעגל: מי בפנים, איך מזמינים, ומי רואה מה.
 *
 * המסך רזה בכוונה, אחרי שירדו ממנו שלושה דברים:
 *
 * - **כרטיס "הגלריה שלי"** — שכפול של טאב האוסף שיושב באותו ניווט.
 * - **קישור הגלריה** — האוסף עצמו כבר מציע "לשתף עם חברה", ושני
 *   מסלולי שיתוף לאותו דבר זה בדיוק הבלבול שילדה לא צריכה. הקישור
 *   שנשאר כאן הוא קישור *ההזמנה* — הדלת היחידה למעגל.
 * - **"קבוצות"** — הבטחה לפיצ'ר שלא קיים. כשתהיה קבוצה, יהיה מקטע.
 */
export default function MyArea() {
  const [profile, setProfile] = useState<SquishProfile | null>(null);
  const [invite, setInvite] = useState<
    { code: string; label: string | null; uses: number; max_uses: number | null; expires_at: string | null } | null
  >(null);
  const [label, setLabel] = useState("");
  const [friends, setFriends] = useState<
    { nickname: string; code: string; items: number; open: number; context: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [hasStore, setHasStore] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const supa = supabaseBrowser();
    (async () => {
      /* חייבים לסנן לפי המשתמשת במפורש. מרגע שיש חברות במעגל, ה-RLS
         מחזיר גם את הפרופילים שלהן — ואז maybeSingle נכשל על יותר
         משורה אחת, והמסך נראה כאילו אין בכלל אוסף. */
      const { data: auth } = await supa.auth.getUser();
      if (!auth.user) { setLoading(false); return; }
      const { data: p } = await supa
        .from("squish_profiles")
        .select("*")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      setProfile((p as SquishProfile) ?? null);
      if (p) {
        /* רק קישור חי. קישור שבוטל נשאר בדאטהבייס למעקב, אבל אין טעם
           להציג אותו כאילו אפשר לשלוח אותו. */
        const { data: inv } = await supa
          .from("squish_invites")
          .select("code, label, uses, max_uses, expires_at")
          .is("revoked_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setInvite((inv as typeof invite) ?? null);
        const fr = await fetch("/api/squish/friends").then((r) => r.json()).catch(() => null);
        setFriends(fr?.friends ?? []);
        /* ה-RLS על stores מחזיר רק את הדוכנים שלה — שורה אחת = יש דוכן */
        const { data: st } = await supa.from("stores").select("id").limit(1);
        setHasStore(!!st?.length);
      }
      setLoading(false);
    })();
  }, []);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  /** קישור הזמנה אישי, נוצר בפעם הראשונה שמבקשים אותו */
  async function makeInvite() {
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) return;
    const code = squishCode(8);
    /* התוקף והתקרה נקבעים בדאטהבייס (ברירות מחדל ב-0032), לא כאן —
       כדי שקישור שנוצר בעקיפה של המסך יקבל בדיוק אותם גבולות. */
    const { data, error } = await supa
      .from("squish_invites")
      .insert({ code, inviter_user_id: auth.user.id, label: label.trim() || null })
      .select("code, label, uses, max_uses, expires_at")
      .maybeSingle();
    if (error) {
      showToast("לא הצלחנו ליצור קישור, לנסות שוב");
      return;
    }
    track("squish_invite_created");
    setLabel("");
    setInvite((data as typeof invite) ?? null);
  }

  async function revokeInvite() {
    if (!invite) return;
    const supa = supabaseBrowser();
    const { error } = await supa.rpc("squish_revoke_invite", { p_code: invite.code });
    if (error) {
      showToast("לא הצלחנו לבטל, לנסות שוב");
      return;
    }
    setInvite(null);
    showToast("הקישור בוטל. מי שכבר הצטרפה נשארת במעגל.");
  }

  async function setVisibility(v: SquishVisibility) {
    if (!profile) return;
    const supa = supabaseBrowser();
    const { error } = await supa
      .from("squish_profiles")
      .update({ collection_visibility: v })
      .eq("id", profile.id);
    if (error) {
      showToast("השמירה נכשלה, לנסות שוב");
      return;
    }
    setProfile({ ...profile, collection_visibility: v });
    showToast("נשמר");
  }

  if (loading) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;
  if (!profile)
    return (
      <div className="p-8 text-center t-small text-[var(--muted)] leading-relaxed">
        עוד אין לך אוסף.
        <br />
        <a href="/squish/new" className="underline text-[var(--ink)]">להתחיל אחד ←</a>
      </div>
    );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = invite ? `${origin}/squish/join/${invite.code}` : null;

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col gap-4">
      <header className="px-1 pt-2">
        <h1 className="t-heading">שלי</h1>
      </header>

      {/* החברות קודם: הן הסיבה שהמסך קיים */}
      <section className="bg-white p-4 rounded-[var(--r)]">
        <div className="t-label">החברות במעגל שלי</div>
        {friends.length ? (
          <div className="flex flex-col gap-2 mt-2.5">
            {friends.map((f) => (
              <a
                key={f.code}
                href={`/squish/c/${f.code}`}
                className="flex items-center gap-3 bg-[var(--canvas)] px-3 py-2.5 rounded-[var(--r)]"
              >
                <span className="w-9 h-9 shrink-0 bg-[var(--cream)] flex items-center justify-center"
                  style={{ borderRadius: "999px" }}>
                  <SwapGlyph size={14} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate">
                    האוסף של {f.nickname}
                  </span>
                  <span className="block text-[12px] text-[var(--muted)]">
                    {f.items} סקווישים · {f.open} פתוחים לטרייד
                  </span>
                  <ConnectionContext text={f.context} />
                </span>
                <span className="t-small">←</span>
              </a>
            ))}
          </div>
        ) : (
          <p className="t-small text-[var(--muted)] leading-relaxed mt-1.5">
            עדיין אין חברות במעגל שלך. שלחי קישור הזמנה — כשחברה תצטרף,
            הגלריה שלה תופיע כאן.
          </p>
        )}
      </section>

      {/* הדלת היחידה למעגל */}
      <section className="bg-white p-4 rounded-[var(--r)]">
        <div className="t-label">להזמין חברה למעגל</div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
          מי שנכנסת דרך הקישור מצטרפת למעגל שלך, ואז אתן רואות מה יש
          אחת לשנייה ויכולות להציע טריידים.
        </p>
        {inviteUrl && invite ? (
          <>
            {invite.label && (
              <div className="text-[13px] font-medium mt-2">{invite.label}</div>
            )}
            <div className="text-[12px] text-[var(--muted)] font-mono my-1.5 break-all" dir="ltr">
              {inviteUrl}
            </div>
            <p className="text-[12px] text-[var(--muted)] mb-2">
              {invite.max_uses
                ? `הצטרפו ${invite.uses} מתוך ${invite.max_uses}`
                : `הצטרפו ${invite.uses}`}
              {invite.expires_at &&
                ` · פג ב-${new Date(invite.expires_at).toLocaleDateString("he-IL")}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  showToast("קישור ההזמנה הועתק");
                }}
                className="flex-1 border border-[var(--line)] py-2.5 text-[12px] font-medium rounded-[var(--r)]"
              >
                העתקה
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${profile.nickname} פתחה אוסף בסקוויש קלאב והזמינה אותך למעגל שלה. הצטרפי כדי לראות אם יש לכן סקווישים שמתאימים לטרייד: ${inviteUrl}`
                )}`}
                className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12px] font-medium text-center rounded-[var(--r)]"
              >
                להזמין חברה
              </a>
            </div>
            <button
              onClick={revokeInvite}
              className="t-small text-[var(--muted)] underline mt-2.5"
            >
              לבטל את הקישור
            </button>
          </>
        ) : (
          <>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="שם לקישור (לא חובה): חוג ריקוד"
              aria-label="שם לקישור"
              maxLength={30}
              className="w-full border border-[var(--line)] px-3 py-2.5 text-[13px] mt-2 rounded-[var(--r)]"
            />
            <button onClick={makeInvite} className="btn btn-secondary mt-2 t-small w-full">
              ליצור קישור הזמנה
            </button>
            <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-2">
              הקישור פעיל {INVITE_DAYS} יום ועד {INVITE_MAX_USES} חברות. אפשר ליצור
              חדש בכל רגע.
            </p>
          </>
        )}
      </section>

      {/* אפליקציה בלי חנות: מוסיפים למסך הבית. באייפון אין הצעה
          אוטומטית להתקנה — אם לא מראים את הדרך, היא לא קיימת. */}
      <section className="bg-white p-4 rounded-[var(--r)]">
        <div className="t-label">סקוויש קלאב כמו אפליקציה</div>
        <p className="text-[12.5px] text-[var(--muted)] leading-relaxed mt-1">
          מוסיפים למסך הבית, ואז המועדון נפתח בלחיצה אחת — עם אייקון
          משלו, בלי דפדפן מסביב.
        </p>
        <button
          onClick={() => setShowInstall(true)}
          className="btn btn-secondary mt-2 t-small w-full"
        >
          איך מוסיפים למסך הבית?
        </button>
      </section>

      {showInstall && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setShowInstall(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-4 pt-3 pb-6 max-h-[85%] overflow-y-auto rounded-t-2xl">
            <div className="w-9 h-1 bg-black/15 mx-auto mb-3.5" style={{ borderRadius: "999px" }} />
            <div className="flex items-start justify-between mb-1">
              <h2 className="t-heading">הוספה למסך הבית</h2>
              <button
                onClick={() => setShowInstall(false)}
                aria-label="סגירה"
                className="w-7 h-7 shrink-0 flex items-center justify-center text-[var(--muted)]"
              >
                ✕
              </button>
            </div>

            <div className="mt-3">
              <div className="t-small font-bold mb-1.5">באייפון</div>
              <ol className="flex flex-col gap-1.5 text-[13.5px] leading-relaxed list-none">
                <li>1 · פותחים את סקוויש קלאב ב<b>ספארי</b></li>
                <li>2 · לוחצים על כפתור השיתוף — הריבוע עם החץ למעלה</li>
                <li>3 · גוללים ובוחרים <b>«הוספה למסך הבית»</b></li>
                <li>4 · לוחצים <b>הוספה</b> — וזהו, יש אייקון</li>
              </ol>
            </div>

            <div className="mt-4">
              <div className="t-small font-bold mb-1.5">באנדרואיד</div>
              <ol className="flex flex-col gap-1.5 text-[13.5px] leading-relaxed list-none">
                <li>1 · פותחים את סקוויש קלאב ב<b>כרום</b></li>
                <li>2 · לוחצים על התפריט ⋮ למעלה</li>
                <li>3 · בוחרים <b>«הוספה למסך הבית»</b></li>
              </ol>
            </div>

            <button
              onClick={() => setShowInstall(false)}
              className="btn btn-primary w-full mt-4"
            >
              הבנתי
            </button>
          </div>
        </>
      )}

      {/* הגדרות */}
      <section className="bg-white p-4 rounded-[var(--r)]">
        <div className="t-label">הגדרות</div>
        <div className="text-[13px] font-medium mt-1.5">מי רואה את הגלריה שלי</div>
        <div className="flex flex-col gap-1.5 mt-2">
          {SQUISH_VISIBILITY.map((v) => (
            <button
              key={v.key}
              onClick={() => setVisibility(v.key)}
              aria-pressed={profile.collection_visibility === v.key}
              className={`flex items-center gap-2.5 border-[1.5px] px-3 py-2.5 text-start rounded-[var(--r)] ${
                profile.collection_visibility === v.key
                  ? "border-[var(--ink)] bg-[var(--canvas)]"
                  : "border-[var(--line)]"
              }`}
            >
              <span
                className={`w-4 h-4 shrink-0 flex items-center justify-center text-[10px] ${
                  profile.collection_visibility === v.key
                    ? "bg-[var(--ink)] text-white"
                    : "border border-[#D3D5DC]"
                }`}
                style={{ borderRadius: "999px" }}
              >
                {profile.collection_visibility === v.key ? "✓" : ""}
              </span>
              <span className="text-[13px] font-medium flex-1">{v.label}</span>
              <span className="text-[12px] text-[var(--muted)]">{v.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-2.5">
          הגלריה לא מופיעה בגוגל ואי אפשר לחפש אותה. קישור לבדו לא פותח אותה
          למי שלא במעגל.
        </p>
        {hasStore ? (
          <a href="/dashboard" className="block text-center t-small underline mt-3">
            לדוכן שלי ←
          </a>
        ) : (
          <p className="text-center t-small text-[var(--muted)] mt-3">
            יש לך דברים למכור?{" "}
            <a href="/onboarding" className="underline text-[var(--ink)]">
              פותחים דוכן ←
            </a>
          </p>
        )}
      </section>

      {/* מחיקה יושבת אחרונה, שקטה, ולא בתוך כרטיס עם כותרת גדולה.
          היא צריכה להיות אפשרית, לא מזמינה. */}
      <section className="px-4 pb-2 flex flex-col">
        <DeleteCollection />
      </section>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90] rounded-full">
          {toast}
        </div>
      )}
    </div>
  );
}
