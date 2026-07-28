"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  MIN_ITEMS,
  SQUISH_VISIBILITY,
  squishCode,
  type SquishProfile,
  type SquishVisibility,
} from "@/lib/squish";
import { track } from "@/lib/squish-analytics";
import { ConnectionContext, SwapGlyph } from "../components";
import { DeleteCollection } from "../safety";

/**
 * "שלי" — אזור אחד שמחזיק את הגלריה, החברות, הקבוצות, הקישורים וההגדרות.
 *
 * זו הבקשה של מרינה: במקום שישה טאבים ראשיים, ארבעה בלבד, וכאן מרוכז כל
 * מה שמסביב. כל אזור הוא כרטיס עם כותרת, כדי שאפשר לסרוק אותו בעין.
 */
export default function MyArea() {
  const [profile, setProfile] = useState<SquishProfile | null>(null);
  const [count, setCount] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [invite, setInvite] = useState<string | null>(null);
  const [friends, setFriends] = useState<
    { nickname: string; code: string; items: number; open: number; context: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
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
        const { data: items } = await supa
          .from("squish_items")
          .select("trade_status")
          .eq("owner_user_id", auth.user.id)
          .eq("profile_id", (p as SquishProfile).id)
          .is("deleted_at", null);
        setCount(items?.length ?? 0);
        setOpenCount((items ?? []).filter((i) => i.trade_status === "open_for_trade").length);
        const { data: inv } = await supa
          .from("squish_invites")
          .select("code")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        setInvite(inv?.code ?? null);
        const fr = await fetch("/api/squish/friends").then((r) => r.json()).catch(() => null);
        setFriends(fr?.friends ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const copy = (url: string, msg: string) => {
    navigator.clipboard.writeText(url);
    showToast(msg);
  };

  /** קישור הזמנה אישי, נוצר בפעם הראשונה שמבקשים אותו */
  async function makeInvite() {
    const supa = supabaseBrowser();
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) return;
    const code = squishCode(8);
    const { error } = await supa
      .from("squish_invites")
      .insert({ code, inviter_user_id: auth.user.id });
    if (error) {
      showToast("לא הצלחנו ליצור קישור, לנסות שוב");
      return;
    }
    track("squish_invite_created");
    setInvite(code);
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
  const galleryUrl = `${origin}/squish/c/${profile.collection_code}`;
  const inviteUrl = invite ? `${origin}/squish/join/${invite}` : null;
  const ready = count >= MIN_ITEMS;

  return (
    <div className="p-3 flex flex-col gap-3">
      <header className="px-1 pt-3">
        <h1 className="t-heading">שלי</h1>
      </header>

      {/* הגלריה שלי */}
      <section className="bg-white border border-[var(--line)] p-3">
        <div className="t-label">הגלריה שלי</div>
        <div className="text-[14px] font-bold mt-1">
          {profile.collection_title || `האוסף של ${profile.nickname}`}
        </div>
        <p className="t-small text-[var(--muted)] mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{count} סקווישים</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <SwapGlyph />
            {openCount} פתוחים לטרייד
          </span>
        </p>
        <a href="/squish/collection" className="btn btn-secondary mt-2.5 t-small">
          לפתוח את הגלריה
        </a>
      </section>

      {/* קישורים והזמנות */}
      <section className="bg-white border border-[var(--line)] p-3">
        <div className="t-label">קישורים והזמנות</div>

        <div className="mt-2">
          <div className="text-[13px] font-medium">הקישור לגלריה שלי</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            רק מי שבמעגל שלך רואה את הגלריה. מי שלא, רואה הצעה להצטרף.
          </p>
          {ready ? (
            <>
              <div className="text-[12px] text-[var(--muted)] font-mono my-1.5 break-all" dir="ltr">
                {galleryUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(galleryUrl, "הקישור לגלריה הועתק")}
                  className="flex-1 border border-[var(--line)] py-2.5 text-[12px] font-medium"
                >
                  העתקה
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`תראי את אוסף הסקווישים שלי! ${galleryUrl}`)}`}
                  className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12px] font-medium text-center"
                >
                  שליחה לחברה
                </a>
              </div>
            </>
          ) : (
            <p className="text-[12px] text-[var(--warn-ink)] bg-[var(--warn-bg)] border border-[var(--warn-line)] p-2 mt-1.5 leading-relaxed">
              צריך {MIN_ITEMS} סקווישים באוסף לפני ששולחים את הקישור.
            </p>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--line)]">
          <div className="text-[13px] font-medium">קישור הזמנה אישי</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            מי שנכנסת דרכו מצטרפת למעגל שלך, ואז אתן רואות מה יש אחת לשנייה.
          </p>
          {inviteUrl ? (
            <>
              <div className="text-[12px] text-[var(--muted)] font-mono my-1.5 break-all" dir="ltr">
                {inviteUrl}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => copy(inviteUrl, "קישור ההזמנה הועתק")}
                  className="flex-1 border border-[var(--line)] py-2.5 text-[12px] font-medium"
                >
                  העתקה
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `${profile.nickname} פתחה אוסף בסקוויש קלאב והזמינה אותך למעגל שלה. הצטרפי כדי לראות אם יש לכן סקווישים שמתאימים לטרייד: ${inviteUrl}`
                  )}`}
                  className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[12px] font-medium text-center"
                >
                  להזמין חברה
                </a>
              </div>
            </>
          ) : (
            <button onClick={makeInvite} className="btn btn-secondary mt-1.5 t-small">
              ליצור קישור הזמנה
            </button>
          )}
        </div>
      </section>

      {/* הגלריות של החברות שלי */}
      <section className="bg-white border border-[var(--line)] p-3">
        <div className="t-label">הגלריות של החברות שלי</div>
        {friends.length ? (
          <div className="flex flex-col gap-1.5 mt-2">
            {friends.map((f) => (
              <a
                key={f.code}
                href={`/squish/c/${f.code}`}
                className="flex items-center gap-3 border border-[var(--line)] px-3 py-2.5"
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
          <>
            <p className="t-small text-[var(--muted)] leading-relaxed mt-1.5">
              עדיין אין חברות במעגל שלך. כשחברה תצטרף דרך הקישור, הגלריה שלה
              תופיע כאן.
            </p>
            <div className="mt-2">
              <ConnectionContext text="כל חיבור מסביר למה הוא קיים, בלי מספרי טלפון" />
            </div>
          </>
        )}
      </section>

      {/* קבוצות */}
      <section className="bg-white border border-[var(--line)] p-3">
        <div className="t-label">קבוצות</div>
        <p className="t-small text-[var(--muted)] leading-relaxed mt-1.5">
          קבוצה פרטית נפתחת אחרי שיש שלוש חברות במעגל שלך. הכניסה בהזמנה בלבד.
        </p>
      </section>

      {/* הגדרות */}
      <section className="bg-white border border-[var(--line)] p-3">
        <div className="t-label">הגדרות</div>
        <div className="text-[13px] font-medium mt-1.5">מי רואה את הגלריה שלי</div>
        <div className="flex flex-col gap-1.5 mt-1.5">
          {SQUISH_VISIBILITY.map((v) => (
            <button
              key={v.key}
              onClick={() => setVisibility(v.key)}
              aria-pressed={profile.collection_visibility === v.key}
              className={`flex items-center gap-2.5 border-[1.5px] px-3 py-2.5 text-start ${
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
              >
                {profile.collection_visibility === v.key ? "✓" : ""}
              </span>
              <span className="text-[13px] font-medium flex-1">{v.label}</span>
              <span className="text-[12px] text-[var(--muted)]">{v.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-2">
          הגלריה לא מופיעה בגוגל ואי אפשר לחפש אותה. קישור לבדו לא פותח אותה
          למי שלא במעגל.
        </p>
        <a href="/dashboard" className="block text-center t-small underline mt-3">
          לדוכן שלי ←
        </a>
      </section>

      {/* מחיקה יושבת אחרונה, שקטה, ולא בתוך כרטיס עם כותרת גדולה.
          היא צריכה להיות אפשרית, לא מזמינה. */}
      <section className="px-4 pb-2 flex flex-col">
        <DeleteCollection />
      </section>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
