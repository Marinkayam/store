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

export default function AdminView() {
  const [stores, setStores] = useState<AdminStore[]>([]);
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
    </main>
  );
}
