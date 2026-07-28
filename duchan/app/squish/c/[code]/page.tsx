import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/media";
import { BRAND, typeLabel, sizeLabel, conditionLabel, type SquishItem } from "@/lib/squish";
import { SquishOutline, TradeBadge, SwapGlyph } from "../../components";

/**
 * גלריה משותפת בקישור.
 *
 * הכלל: **קישור לבדו לא חושף אוסף.** הקוד אקראי, אין אינדוקס, ואין מפת
 * אתר — אבל זה לא מספיק. ההרשאה נבדקת בשרת מול squish_can_view, וכל מי
 * שלא במעגל רואה תצוגה מוגנת: שם הגלריה, כמה יש, וכפתור להצטרף. לא
 * הפריטים.
 *
 * הקריאה נעשית עם service role ומחזירה שדות מפורשים, בדיוק כמו דף החנות
 * הפומבי — כדי שלא ידלוף שדה שנוסף בעתיד.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedCollection({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const db = supabaseAdmin();

  const { data: profile } = await db
    .from("squish_profiles")
    .select("id, user_id, nickname, collection_title, collection_visibility, general_city, completed_trades")
    .eq("collection_code", code)
    .maybeSingle();

  if (!profile) {
    return (
      <Shell>
        <div className="text-center py-16">
          <SquishOutline size={64} />
          <h1 className="t-heading mt-3">הגלריה לא נמצאה</h1>
          <p className="t-sub mt-1.5">אולי הקישור לא שלם.</p>
        </div>
      </Shell>
    );
  }

  // מי מסתכלת, ומה מותר לה לראות. הכל נחתך בשרת.
  const supa = await supabaseServer();
  const { data: auth } = await supa.auth.getUser();
  const viewer = auth.user?.id ?? null;
  const isOwner = viewer === profile.user_id;

  let canView = isOwner;
  if (!canView && viewer) {
    const { data: allowed } = await db.rpc("squish_can_view", {
      p_viewer: viewer,
      p_owner: profile.user_id,
    });
    canView = allowed === true;
  }

  const { count: total } = await db
    .from("squish_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .is("deleted_at", null);

  const { count: openCount } = await db
    .from("squish_items")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .eq("trade_status", "open_for_trade");

  const title = profile.collection_title || `האוסף של ${profile.nickname}`;

  /* ── תצוגה מוגנת: מי שלא במעגל ── */
  /* לא חסימה — הזמנה. מי שהגיעה לכאן קיבלה קישור מחברה, והמסך צריך
     להרגיש כמו דלת שנפתחת ולא כמו שגיאה. */
  if (!canView) {
    return (
      <Shell>
        <div className="text-center py-10 flex flex-col items-center gap-3 px-5">
          <SquishOutline size={72} />
          <h1 className="t-title">{profile.nickname} הזמינה אותך למעגל שלה</h1>
          <p className="t-sub max-w-[20rem]">
            כדי לראות את הסקווישים שפתוחים לטרייד, הצטרפי דרך הקישור האישי
            שקיבלת ממנה.
          </p>
          <p className="t-small text-[var(--muted)] flex items-center gap-2">
            <span>{total ?? 0} סקווישים</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <SwapGlyph />
              {openCount ?? 0} פתוחים לטרייד
            </span>
          </p>
          <a href="/squish/new" className="btn btn-primary w-full max-w-sm mt-2">
            להצטרף למעגל של {profile.nickname}
          </a>
          <p className="t-small text-[var(--muted)]">
            {viewer ? (
              <>
                כבר יש לך אוסף?{" "}
                <a href="/squish/collection" className="underline text-[var(--ink)]">
                  לגלריה שלי
                </a>
              </>
            ) : (
              <>
                כבר יש לך {BRAND}?{" "}
                <a href="/login?next=/squish/collection" className="underline text-[var(--ink)]">
                  התחברי
                </a>
              </>
            )}
          </p>
        </div>
      </Shell>
    );
  }

  /* ── תצוגה מלאה: מי שכן במעגל ── */
  const { data: items } = await db
    .from("squish_items")
    .select(
      "id, name, squishy_type, custom_type, size, condition, condition_note, trade_status, wanted_description, image_key, video_key, poster_key"
    )
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .neq("trade_status", "moved_to_duchan")
    .order("sort_order", { ascending: true });

  const list = (items ?? []) as Partial<SquishItem>[];

  return (
    <Shell>
      <header className="text-center pt-8 pb-4 px-4">
        <h1 className="t-title">{title}</h1>
        <p className="t-small text-[var(--muted)] mt-1.5 flex items-center justify-center gap-2 flex-wrap">
          <span>{profile.nickname}</span>
          {profile.general_city && (
            <>
              <span aria-hidden>·</span>
              <span>📍 {profile.general_city}</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{total ?? 0} סקווישים</span>
        </p>
        {profile.completed_trades > 0 && (
          <p className="t-small text-[var(--muted)] mt-1">
            {profile.completed_trades} טריידים הושלמו
          </p>
        )}
      </header>

      <div className="px-3 pb-10 grid grid-cols-2 gap-2.5">
        {list.map((it) => {
          const poster = mediaUrl(it.poster_key) ?? mediaUrl(it.image_key);
          const open = it.trade_status === "open_for_trade";
          return (
            <div key={it.id} className="bg-white border border-[var(--line)] overflow-hidden flex flex-col">
              <div className="relative aspect-square bg-[var(--cream)] flex items-center justify-center overflow-hidden">
                {poster ? (
                  <img src={poster} alt="" className="w-full h-full object-cover" />
                ) : (
                  <SquishOutline />
                )}
                <span className="absolute top-1.5 start-1.5">
                  <TradeBadge status={it.trade_status!} />
                </span>
              </div>
              <div className="p-2 flex-1 flex flex-col">
                <div className="text-[13px] font-medium truncate">{it.name}</div>
                <div className="text-[11.5px] text-[var(--muted)] truncate">
                  {[
                    it.squishy_type === "other" ? it.custom_type || "אחר" : typeLabel(it.squishy_type!),
                    sizeLabel(it.size!),
                    conditionLabel(it.condition!),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {it.wanted_description && (
                  <div className="text-[11.5px] text-[var(--muted)] mt-1 leading-snug">
                    מחפשת: {it.wanted_description}
                  </div>
                )}
                {open && !isOwner && (
                  <div className="mt-2 border border-dashed border-[var(--line)] py-2 text-center text-[12px] text-[var(--muted)]">
                    להציע טרייד — בקרוב
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!list.length && (
        <p className="text-center t-small text-[var(--muted)] py-14">
          המדף הזה עדיין ריק.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] max-w-md mx-auto">
      {children}
      <p className="text-center text-[11px] text-[var(--muted)] pb-6">
        <a href="/squish" className="underline">{BRAND}</a>
        {" · "}
        <a href="/terms" className="underline">תנאים</a>
      </p>
    </div>
  );
}
