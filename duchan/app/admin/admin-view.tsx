"use client";

import { useCallback, useEffect, useState } from "react";

interface AdminStore {
  id: string;
  slug: string;
  display_name: string;
  emoji: string;
  status: "active" | "paused" | "blocked";
  parent_email: string;
  claim_token: string | null;
  media_bytes: number;
  created_at: string;
}

interface ExploreProduct {
  name: string;
  price: number;
  image_key: string | null;
  poster_key: string | null;
  video_key: string | null;
  track_stock: boolean;
  stock: number;
}

interface ExploreStore {
  id: string;
  slug: string;
  display_name: string;
  emoji: string;
  tagline: string | null;
  avatar_key: string | null;
  products: ExploreProduct[];
}

const mediaUrl = (key: string | null) =>
  key ? `${(process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/$/, "")}/${key}` : null;

export default function AdminView() {
  const [tab, setTab] = useState<"manage" | "explore">("manage");
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [explore, setExplore] = useState<ExploreStore[]>([]);
  const [newName, setNewName] = useState("");
  const [claimLink, setClaimLink] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/stores");
    if (res.ok) setStores((await res.json()).stores);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== "explore") return;
    fetch("/api/admin/explore").then(async (res) => {
      if (res.ok) setExplore((await res.json()).stores);
    });
  }, [tab]);

  async function createStore() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setClaimLink(`${window.location.origin}/claim/${data.claimToken}`);
        setNewName("");
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    await fetch("/api/admin/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: id, status }),
    });
    refresh();
  }

  return (
    <main className="min-h-screen bg-[#F5F6F9] max-w-lg mx-auto p-4 flex flex-col gap-4">
      <h1 className="text-lg font-bold">אדמין · {stores.length} חנויות</h1>

      <div className="flex bg-[#DCDCE4] rounded-xl p-0.5">
        <button
          onClick={() => setTab("manage")}
          className={`flex-1 py-2 rounded-lg text-[13px] font-medium ${tab === "manage" ? "bg-white shadow-sm" : "text-[#7A7D8A]"}`}
        >
          ניהול
        </button>
        <button
          onClick={() => setTab("explore")}
          className={`flex-1 py-2 rounded-lg text-[13px] font-medium ${tab === "explore" ? "bg-white shadow-sm" : "text-[#7A7D8A]"}`}
        >
          מה מוכרות 🛍️
        </button>
      </div>

      {tab === "explore" && (
        <div className="flex flex-col gap-3">
          {explore.length === 0 && (
            <p className="text-center text-sm text-[#7A7D8A] py-10">עוד אין חנויות פעילות.</p>
          )}
          {explore.map((s) => (
            <div key={s.id} className="bg-white border border-[#E6E7EC] rounded-xl p-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#F5F6F9] flex items-center justify-center text-xl overflow-hidden">
                  {mediaUrl(s.avatar_key) ? (
                    <img src={mediaUrl(s.avatar_key)!} alt="" className="w-full h-full object-cover" />
                  ) : (
                    s.emoji
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{s.display_name}</div>
                  {s.tagline && <div className="text-[11px] text-[#7A7D8A] truncate">{s.tagline}</div>}
                </div>
                <a
                  href={`/s/${s.slug}`}
                  target="_blank"
                  className="border border-[#E6E7EC] rounded-lg px-3 py-1.5 text-[11px] whitespace-nowrap"
                >
                  לחנות ←
                </a>
              </div>
              {s.products.length === 0 ? (
                <p className="text-[11px] text-[#7A7D8A]">עוד אין מוצרים.</p>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {s.products.map((p, i) => {
                    const img = mediaUrl(p.poster_key) ?? mediaUrl(p.image_key);
                    const out = p.track_stock && p.stock === 0;
                    return (
                      <div key={i} className={`min-w-20 w-20 ${out ? "opacity-45" : ""}`}>
                        <div className="w-20 h-20 rounded-lg bg-[#F5F6F9] flex items-center justify-center text-2xl overflow-hidden relative">
                          {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : "🛍️"}
                          {p.video_key && (
                            <span className="absolute bottom-0.5 left-1 text-[8px] bg-black/60 text-white px-1 rounded">▶</span>
                          )}
                        </div>
                        <div className="text-[10px] truncate mt-0.5">{p.name}</div>
                        <div className="text-[10px] font-bold">₪{p.price}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "manage" && (<>
      <div className="bg-white border border-[#E6E7EC] rounded-xl p-3 flex flex-col gap-2">
        <span className="text-xs font-medium">יצירת חנות (לינק חד-פעמי לתביעה)</span>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם החנות"
            className="flex-1 border border-[#E6E7EC] rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={createStore}
            disabled={busy}
            className="bg-[#15161B] text-white rounded-lg px-4 text-xs font-medium disabled:opacity-50"
          >
            יצירה
          </button>
        </div>
        {claimLink && (
          <button
            onClick={() => navigator.clipboard.writeText(claimLink)}
            className="text-[11px] text-[#1F7A42] underline text-left"
            dir="ltr"
          >
            {claimLink} (לחיצה = העתקה)
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {stores.map((s) => (
          <div key={s.id} className="bg-white border border-[#E6E7EC] rounded-xl p-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="font-medium">
                {s.emoji} {s.display_name}
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  s.status === "active"
                    ? "bg-[#E4F3E9] text-[#1F7A42]"
                    : s.status === "paused"
                      ? "bg-[#FFF3E0] text-[#A85B00]"
                      : "bg-[#FBE9EA] text-[#D2373B]"
                }`}
              >
                {s.status}
              </span>
            </div>
            <div className="text-[11px] text-[#7A7D8A] mt-1" dir="ltr">
              /s/{s.slug} · {s.parent_email || "—"} · {(s.media_bytes / 1024 / 1024).toFixed(1)}MB
              {s.claim_token ? " · לא נתבעה" : ""}
            </div>
            <div className="flex gap-1.5 mt-2">
              {(["active", "paused", "blocked"] as const)
                .filter((st) => st !== s.status)
                .map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatus(s.id, st)}
                    className="border border-[#E6E7EC] rounded-lg px-3 py-1.5 text-[11px]"
                  >
                    {st === "active" ? "הפעלה" : st === "paused" ? "השהיה" : "חסימה"}
                  </button>
                ))}
              <a href={`/s/${s.slug}`} className="border border-[#E6E7EC] rounded-lg px-3 py-1.5 text-[11px]">
                צפייה
              </a>
            </div>
          </div>
        ))}
      </div>
      </>)}
    </main>
  );
}
