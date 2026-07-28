"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MIN_ITEMS, type SquishItem, type SquishProfile } from "@/lib/squish";
import { CollectionGrid, EmptyCollection, SwapGlyph } from "../components";

/**
 * האוסף שלי — המדף.
 *
 * זו הגלריה ולא מסך ניהול מלאי: התמונות גדולות, השורה הראשונה אומרת כמה
 * יש וכמה פתוחים לטרייד, והסינון קטן ומשני.
 */

type Filter = "all" | "open_for_trade" | "keep" | "traded";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "open_for_trade", label: "פתוחים לטרייד" },
  { key: "keep", label: "נשארים אצלי" },
  { key: "traded", label: "הוחלפו" },
];

export default function MyCollection() {
  const router = useRouter();
  const [profile, setProfile] = useState<SquishProfile | null>(null);
  const [items, setItems] = useState<SquishItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const supa = supabaseBrowser();
    const { data: p } = await supa.from("squish_profiles").select("*").maybeSingle();
    setProfile((p as SquishProfile) ?? null);
    if (p) {
      const { data } = await supa
        .from("squish_items")
        .select("*")
        .eq("profile_id", (p as SquishProfile).id)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      setItems((data as SquishItem[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  };

  if (loading) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  if (!profile)
    return (
      <EmptyCollection
        title="עוד אין לך אוסף"
        body="מצלמים שלושה סקווישים, וזה כבר נראה כמו גלריה."
        cta="להתחיל את האוסף שלי"
        href="/squish/new"
      />
    );

  const openCount = items.filter((i) => i.trade_status === "open_for_trade").length;
  const shown =
    filter === "all"
      ? items
      : filter === "traded"
        ? items.filter((i) => i.trade_status === "traded" || i.trade_status === "moved_to_duchan")
        : items.filter((i) => i.trade_status === filter);

  return (
    <div>
      <header className="bg-white px-4 pt-6 pb-3 border-b border-[var(--line)]">
        <h1 className="t-heading">{profile.collection_title || `האוסף של ${profile.nickname}`}</h1>
        <p className="t-small text-[var(--muted)] mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{items.length} סקווישים</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 text-[var(--ink)]">
            <SwapGlyph />
            {openCount} פתוחים לטרייד
          </span>
        </p>
      </header>

      <div className="p-3 flex flex-col gap-3">
        {items.length < MIN_ITEMS && (
          <div className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3 text-[12.5px] leading-relaxed">
            <b>
              {items.length === MIN_ITEMS - 1
                ? "עוד סקווישי אחד והגלריה שלך מוכנה"
                : `עוד ${MIN_ITEMS - items.length} סקווישים והגלריה שלך מוכנה`}
            </b>
            <br />
            עד אז אי אפשר להיכנס ל&quot;לגלות&quot;, לשתף את הקישור או להציע טרייד.
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => {
            const n =
              f.key === "all"
                ? items.length
                : f.key === "traded"
                  ? items.filter((i) => i.trade_status === "traded" || i.trade_status === "moved_to_duchan").length
                  : items.filter((i) => i.trade_status === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 text-[12px] border ${
                  filter === f.key
                    ? "bg-[var(--ink)] text-white border-[var(--ink)] font-medium"
                    : "bg-white border-[var(--line)]"
                }`}
              >
                {f.label} · {n}
              </button>
            );
          })}
        </div>

        {shown.length ? (
          <CollectionGrid items={shown} onOpen={(it) => router.push(`/squish/item/${it.id}`)} />
        ) : (
          <p className="text-center t-small text-[var(--muted)] py-10">
            אין כאן סקווישים במצב הזה.
          </p>
        )}

        <a href="/squish/new" className="btn btn-primary">
          + להוסיף סקווישי
        </a>

        <button
          onClick={() => {
            const url = `${window.location.origin}/squish/c/${profile.collection_code}`;
            navigator.clipboard.writeText(url);
            showToast("הקישור לגלריה הועתק");
          }}
          disabled={items.length < MIN_ITEMS}
          className="btn btn-secondary disabled:opacity-40"
        >
          העתקת הקישור לגלריה
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
