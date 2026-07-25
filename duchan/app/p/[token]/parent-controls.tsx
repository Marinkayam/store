"use client";

import { useState } from "react";

export default function ParentControls({
  token,
  initialStatus,
  slug,
}: {
  token: string;
  initialStatus: "active" | "paused" | "blocked";
  slug: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function setStoreStatus(next: "active" | "paused") {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, status: next }),
      });
      if (!res.ok) {
        setErr("משהו השתבש — נסו שוב");
        return;
      }
      setStatus(next);
    } finally {
      setBusy(false);
    }
  }

  if (status === "blocked") {
    return <p className="text-sm text-[#D2373B]">החנות הושבתה על ידי הנהלת דוכן.</p>;
  }

  return (
    <div className="w-full max-w-xs flex flex-col gap-2.5">
      <a
        href={`/s/${slug}`}
        className="border border-[#E6E7EC] bg-white rounded-xl py-3 text-sm font-medium"
      >
        צפייה בחנות
      </a>
      {status === "active" ? (
        <button
          onClick={() => setStoreStatus("paused")}
          disabled={busy}
          className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "רגע…" : "השהיית החנות"}
        </button>
      ) : (
        <>
          <p className="text-sm text-[#1F7A42]">החנות מושהית — היא מציגה "החנות סגורה כרגע".</p>
          <button
            onClick={() => setStoreStatus("active")}
            disabled={busy}
            className="bg-[#15161B] text-white rounded-xl py-3 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "רגע…" : "הפעלה מחדש"}
          </button>
        </>
      )}
      {err && <p className="text-xs text-[#D2373B]">{err}</p>}
    </div>
  );
}
