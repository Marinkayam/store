"use client";

// "מה חדש" — העדכונים שמרינה מפרסמת מהחמ"ל מגיעים לכאן.
// נקרא ישירות מהטבלה (RLS: קריאה בלבד). מצב "נקרא" נשמר ב-localStorage.

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

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

  const unread = news.filter((n) => n.created_at > seenAt).length;

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
      <button onClick={openSheet} className="relative text-xl leading-none p-1" aria-label="מה חדש">
        ✨
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 bg-[var(--danger)] text-white text-[9px] font-bold min-w-4 h-4 px-1 flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-black/45 z-40" onClick={() => setOpen(false)} />
          <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto z-50 bg-white px-4 pt-3 pb-8 max-h-[80%] overflow-y-auto">
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
