"use client";

// "מה חדש" — העדכונים שמרינה מפרסמת מהחמ"ל מגיעים לכאן.
// נקרא ישירות מהטבלה (RLS: קריאה בלבד). מצב "נקרא" נשמר ב-localStorage.

import { useEffect, useState } from "react";
import Icon from "@/app/icons";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useStore } from "./use-store";

interface Announcement {
  id: string;
  title: string;
  body: string;
  emoji: string;
  created_at: string;
}

const SEEN_KEY = "duchan-news-seen";

export default function WhatsNew() {
  const [news, setNews] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string>("");

  useEffect(() => {
    setSeenAt(localStorage.getItem(SEEN_KEY) ?? "");
    const supa = supabaseBrowser();
    supa
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setNews((data as Announcement[]) ?? []));
  }, []);

  // דוכן חדש לא צריך "מה חדש" על דברים שהיו שם לפני שנפתח
  const { store } = useStore();
  const since = [seenAt, store?.created_at ?? ""].sort().pop() ?? "";
  const unread = news.filter((n) => n.created_at > since).length;

  function openSheet() {
    setOpen(true);
    if (news[0]) {
      localStorage.setItem(SEEN_KEY, news[0].created_at);
      setSeenAt(news[0].created_at);
    }
  }

  if (news.length === 0) return null;

  return (
    <>
      {/* אייקון מצויר כמו שאר הדשבורד (לא אימוג'י), ושטח לחיצה של 44 */}
      <button onClick={openSheet} className="relative w-11 h-11 -my-2 flex items-center justify-end" aria-label="מה חדש">
        <Icon name="sparkle" size={22} />
        {unread > 0 && (
          <span data-gutter-ignore className="absolute top-1 left-3.5 bg-[var(--danger)] text-white text-[11px] font-bold leading-none min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-gutter pt-3 pb-[calc(2rem+env(safe-area-inset-bottom))] max-h-[80%] overflow-y-auto">
            <div className="w-9 h-1 bg-black/15 mx-auto mb-3.5" />
            <h2 className="text-base font-bold mb-3">מה חדש בדוכן ✨</h2>
            <div className="flex flex-col gap-2.5">
              {news.map((n) => (
                <div key={n.id} className="border border-[var(--line)] p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl">{n.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">{n.title}</div>
                      <p className="text-[13px] text-[var(--muted)] whitespace-pre-line mt-0.5 leading-relaxed">
                        {n.body}
                      </p>
                      <div className="text-[11px] text-[var(--muted)] mt-1.5">
                        {new Date(n.created_at).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
