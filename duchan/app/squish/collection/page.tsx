"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaUrl, squareImage, MediaError } from "@/lib/media";
import { uploadBlob } from "@/lib/upload-client";
import { COVERS, coverCss } from "@/lib/covers";
import {
  MIN_ITEMS,
  SQUISH_EMOJIS,
  type SquishItem,
  type SquishProfile,
  type SquishyType,
  type Wish,
} from "@/lib/squish";
import { byType, bySeries, collectionBadges, summary } from "@/lib/squish-badges";
import {
  Badges,
  Breakdown,
  CollectionSummary,
  FavoriteCard,
  SeriesRow,
  WishlistRow,
} from "../collection-parts";
import WishEditor from "../wish-editor";
import { EmptyCollection, SquishyCard, SwapGlyph } from "../components";
import Feedback from "../feedback";
import { StickerIntro } from "../stickers";
import { track } from "@/lib/squish-analytics";

/**
 * האוסף שלי — חדר האוסף.
 *
 * מבנה הפרופיל זהה לדוכן: קאבר, תמונת פרופיל עגולה שיושבת עליו, כותרת,
 * תיאור — והכל נערך במקום שבו הוא מופיע. מתחת, המדף עצמו: התמונות
 * גדולות, בלי מסגרות, עם קו עץ דק בין השורות.
 *
 * שני דברים שהמסך הזה חייב לתת מיד: לשתף, ולראות איך זה נראה לחברה.
 */

type Filter = "all" | "open_for_trade" | "keep" | "traded";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "open_for_trade", label: "פתוחים לטרייד" },
  { key: "keep", label: "שלי בלבד" },
  { key: "traded", label: "הוחלפו" },
];

export default function MyCollection() {
  const router = useRouter();
  const [profile, setProfile] = useState<SquishProfile | null>(null);
  const [items, setItems] = useState<SquishItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [dirty, setDirty] = useState(false);
  const [style, setStyle] = useState(false);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [joined, setJoined] = useState(0);
  const [typeFilter, setTypeFilter] = useState<SquishyType | null>(null);
  // "מדף" או "אלבום". נשמר מקומית — זו העדפת תצוגה, לא נתון של האוסף.
  const [view, setView] = useState<"shelf" | "album">("shelf");
  useEffect(() => {
    const v = localStorage.getItem("squish-view");
    if (v === "album" || v === "shelf") setView(v);
  }, []);
  const pickView = (v: "shelf" | "album") => {
    setView(v);
    localStorage.setItem("squish-view", v);
  };
  const coverRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supa = supabaseBrowser();
    /* סינון מפורש לפי המשתמשת: ה-RLS מחזיר גם פרופילים ופריטים של
       החברות במעגל, וקריאה בלי התנאי הזה מציגה את האוסף שלהן. */
    const { data: auth } = await supa.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const { data: p } = await supa
      .from("squish_profiles")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    setProfile((p as SquishProfile) ?? null);
    if (p) {
      const { data } = await supa
        .from("squish_items")
        .select("*")
        .eq("owner_user_id", auth.user.id)
        .eq("profile_id", (p as SquishProfile).id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      setItems((data as SquishItem[]) ?? []);
      const { data: w } = await supa
        .from("squish_wishlist")
        .select("*")
        .eq("owner_user_id", auth.user.id)
        .order("sort_order", { ascending: true });
      setWishes((w as Wish[]) ?? []);
      const { count: joined } = await supa
        .from("squish_invites")
        .select("id", { count: "exact", head: true })
        .eq("inviter_user_id", auth.user.id)
        .not("joined_user_id", "is", null);
      setJoined(joined ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* "האוסף פעיל" — שלושה פריטים ואחד פתוח לטרייד. זה השלב שממנו הילדה
     יכולה גם להציע וגם לקבל, ולכן זה השלב שנמדד ולא "נרשמה". */
  const activated = items.length >= MIN_ITEMS
    && items.some((i) => i.trade_status === "open_for_trade");
  useEffect(() => {
    if (activated) track("squish_collection_activated", { items: items.length });
  }, [activated, items.length]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  const patch = (p: Partial<SquishProfile>) => {
    setProfile((pr) => (pr ? { ...pr, ...p } : pr));
    setDirty(true);
  };

  async function save() {
    if (!profile) return;
    const supa = supabaseBrowser();
    const { error } = await supa
      .from("squish_profiles")
      .update({
        collection_title: profile.collection_title?.trim() || null,
        about: profile.about?.trim() || null,
        emoji: profile.emoji,
        cover_preset: profile.cover_preset,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);
    if (error) {
      console.error("[squish] profile save failed:", error.message);
      showToast("השמירה נכשלה, לנסות שוב");
      return;
    }
    setDirty(false);
    showToast("נשמר ✨");
  }

  async function upload(file: File, what: "cover" | "avatar") {
    if (!profile) return;
    try {
      const blob = await squareImage(file, what === "cover" ? 1200 : 600);
      const up = await uploadBlob("squish", blob);
      if ("error" in up) throw new Error(up.error);
      const supa = supabaseBrowser();
      const col = what === "cover" ? { cover_key: up.key } : { avatar_key: up.key };
      await supa.from("squish_profiles").update(col).eq("id", profile.id);
      setProfile({ ...profile, ...col });
      showToast(what === "cover" ? "הקאבר עודכן" : "התמונה עודכנה");
    } catch (e) {
      showToast(e instanceof MediaError ? e.message : "ההעלאה נכשלה");
    }
  }

  if (loading) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  if (!profile)
    return (
      <EmptyCollection
        title="המדף שלך עדיין ריק"
        body="צלמי את הסקווישי הראשון שלך ותתחילי לבנות את האוסף."
        cta="להוסיף סקווישי"
        href="/squish/new"
      />
    );

  const openCount = items.filter((i) => i.trade_status === "open_for_trade").length;
  const ready = items.length >= MIN_ITEMS;
  const shown =
    filter === "all"
      ? items
      : filter === "traded"
        ? items.filter((i) => i.trade_status === "traded" || i.trade_status === "moved_to_duchan")
        : items.filter((i) => i.trade_status === filter);
  const visible = typeFilter ? shown.filter((i) => i.squishy_type === typeFilter) : shown;
  const stats = summary(items);
  const types = byType(items);
  const series = bySeries(items);
  // בלי completedTrades התג "טרייד ראשון" היה נשאר נעול לנצח, גם אחרי
  // שהטרייד באמת הושלם.
  const badges = collectionBadges({
    items,
    joinedViaInvite: joined,
    completedTrades: profile.completed_trades,
  });
  const favorite = items.find((i) => i.id === profile.favorite_item_id) ?? null;
  const avatar = mediaUrl(profile.avatar_key);
  const cover = mediaUrl(profile.cover_key);

  return (
    <div>
      <input ref={coverRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "cover")} />
      <input ref={avatarRef} type="file" accept="image/*" hidden
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "avatar")} />

      {/* קאבר + תמונת פרופיל, בדיוק כמו בדוכן */}
      <button
        onClick={() => coverRef.current?.click()}
        aria-label="החלפת תמונת הקאבר"
        className="block w-full h-32 overflow-hidden relative"
        style={cover ? undefined : { background: coverCss(profile.cover_preset) }}
      >
        {cover && <img src={cover} alt="" className="w-full h-full object-cover" />}
        <span className="absolute bottom-1.5 start-1.5 bg-black/45 text-white text-[11px] px-2 py-1">
          ✎ קאבר
        </span>
      </button>

      <div className="px-4 -mt-9 text-center">
        <button
          onClick={() => avatarRef.current?.click()}
          aria-label="החלפת תמונת הפרופיל"
          className="relative inline-block w-[72px] h-[72px] align-middle"
        >
          <span
            className="flex w-full h-full items-center justify-center text-4xl overflow-hidden bg-[var(--cream)]"
            style={{ borderRadius: "999px", border: "3px solid var(--canvas)" }}
          >
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : profile.emoji}
          </span>
          <span
            className="absolute -bottom-0.5 -start-0.5 w-6 h-6 flex items-center justify-center text-[11px] bg-[var(--ink)] text-white z-10"
            style={{ borderRadius: "999px", border: "2px solid var(--canvas)" }}
            aria-hidden
          >
            ✎
          </span>
        </button>

        {/* שם האוסף ראשי, הכינוי משני. הכינוי שייך לילדה, השם שייך
            לאוסף — וזה האוסף שמוצג לחברות. */}
        <input
          value={profile.collection_title ?? ""}
          maxLength={40}
          aria-label="שם האוסף"
          placeholder={`האוסף של ${profile.nickname}`}
          onChange={(e) => patch({ collection_title: e.target.value })}
          className="editable block w-full text-center font-bold text-[19px] mt-1.5"
        />
        <p className="t-small text-[var(--muted)] mt-0.5">האוסף של {profile.nickname}</p>

        {/* שיתוף וצפייה כחברה — שתי הפעולות הראשיות של המסך */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              const url = `${window.location.origin}/squish/c/${profile.collection_code}`;
              navigator.clipboard.writeText(url);
              showToast(ready ? "הקישור לגלריה הועתק" : "הקישור הועתק, אבל צריך 3 סקווישים");
            }}
            className="flex-1 bg-[var(--ink)] text-white py-2.5 text-[13px] font-medium"
          >
            לשתף את הגלריה
          </button>
          <a
            href={`/squish/c/${profile.collection_code}?as=friend`}
            className="flex-1 bg-white border border-[var(--line)] py-2.5 text-[13px] font-medium text-center"
          >
            לראות כמו חברה
          </a>
        </div>
      </div>

      <div className="p-4 pt-4 flex flex-col gap-5">
        <CollectionSummary s={stats} />
        {favorite && (
          <FavoriteCard item={favorite} onOpen={() => router.push(`/squish/item/${favorite.id}`)} />
        )}
        <WishlistRow wishes={wishes} />
        <WishEditor wishes={wishes} profileId={profile.id} onChange={setWishes} onToast={showToast} />

        {!ready && (
          <div className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3 text-[12.5px] leading-relaxed">
            <b>
              {items.length === MIN_ITEMS - 1
                ? "עוד סקווישי אחד והגלריה שלך מוכנה"
                : `עוד ${MIN_ITEMS - items.length} סקווישים והגלריה שלך מוכנה`}
            </b>
            <br />
            עד אז אי אפשר לשתף את הקישור, להיכנס ל&quot;לגלות&quot; או להציע טרייד.
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="t-label">המדף שלי</div>
          <div className="flex border border-[var(--line)]">
            {(["shelf", "album"] as const).map((v) => (
              <button
                key={v}
                onClick={() => pickView(v)}
                aria-pressed={view === v}
                className={`px-3 py-1.5 text-[12px] ${
                  view === v ? "bg-[var(--ink)] text-white font-medium" : "bg-white text-[var(--muted)]"
                }`}
              >
                {v === "shelf" ? "מדף" : "אלבום"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
          {FILTERS.map((f) => {
            const n =
              f.key === "all"
                ? items.length
                : f.key === "traded"
                  ? items.filter((i) => i.trade_status === "traded" || i.trade_status === "moved_to_duchan").length
                  : items.filter((i) => i.trade_status === f.key).length;
            if (!n && f.key !== "all") return null;
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={`shrink-0 px-1 pb-1.5 text-[13px] border-b-2 ${
                  on
                    ? "border-[var(--ink)] text-[var(--ink)] font-medium"
                    : "border-transparent text-[var(--muted)]"
                }`}
              >
                {f.label} {n}
              </button>
            );
          })}
        </div>

        {visible.length ? (
          /* שורות של שניים, וקו מדף מתחת לכל שורה. חלוקה לשורות ולא
             מחלקה על כל פריט זוגי: אחרת שורה אחרונה עם פריט בודד מקבלת
             חצי קו והמדף נראה שבור. */
          <div className="flex flex-col gap-7">
            {Array.from({ length: Math.ceil(visible.length / 2) }, (_, row) => (
              <div key={row} className={`grid grid-cols-2 gap-x-3 ${view === "shelf" ? "squish-shelf" : ""}`}>
                {visible.slice(row * 2, row * 2 + 2).map((it) => (
                  <SquishyCard
                    key={it.id}
                    item={it}
                    isFavorite={it.id === profile.favorite_item_id}
                    onClick={() => router.push(`/squish/item/${it.id}`)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center t-small text-[var(--muted)] py-10">
            אין כאן סקווישים במצב הזה.
          </p>
        )}

        <a href="/squish/new" className="btn btn-primary mt-1">
          + להוסיף סקווישי
        </a>

        <Breakdown types={types} active={typeFilter} onPick={setTypeFilter} />
        <SeriesRow series={series} />
        <Badges badges={badges} />

        {/* עיצוב הגלריה — משני, נפתח בלחיצה */}
        <button
          onClick={() => setStyle((v) => !v)}
          className="t-small text-[var(--muted)] underline text-center py-1"
        >
          {style ? "לסגור את העיצוב" : "לעצב את הגלריה"}
        </button>
        {style && (
          <div className="bg-white border border-[var(--line)] p-3">
            <div className="t-label mb-1.5">רקע לקאבר</div>
            <div className="flex gap-1.5 flex-wrap">
              {COVERS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => patch({ cover_preset: c.key, cover_key: null })}
                  aria-label={`רקע ${c.label}`}
                  className={`w-11 h-8 border-2 ${
                    profile.cover_preset === c.key && !cover ? "border-[var(--ink)]" : "border-[var(--line)]"
                  }`}
                  style={{ background: c.css }}
                />
              ))}
            </div>
            <div className="t-label mt-3 mb-1.5">אמוג׳י לתמונת הפרופיל</div>
            <div className="flex gap-1.5 flex-wrap">
              {SQUISH_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => patch({ emoji: e })}
                  aria-label={`אמוג׳י ${e}`}
                  className={`w-9 h-9 border-[1.5px] bg-white text-lg ${
                    profile.emoji === e && !avatar ? "border-[var(--ink)]" : "border-[var(--line)]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {dirty && (
          <button onClick={save} className="bg-[var(--ink)] text-white py-3 text-sm font-bold">
            שמירת שינויים
          </button>
        )}

        {/* שאלה אחת אחרי שהאוסף כבר קיים באמת. מוצגת פעם אחת בלבד,
            ורק כשדגל הפיילוט דלוק. */}
        <StickerIntro items={items.length} />
        {activated && <Feedback moment="collection_activated" />}
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
