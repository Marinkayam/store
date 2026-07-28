"use client";

import { useCallback, useEffect, useState } from "react";
import { REPORT_REASONS } from "@/lib/squish-trade";

/**
 * מודרציה של סקוויש קלאב — עמוד אחד, ארבעה חלקים.
 *
 * דיווחים · חשבונות עם כמה דיווחים · טריידים תקועים · יומן פעולות.
 *
 * מכוון להיות פשוט: זה כלי לפיילוט של עשרים ילדות, לא מוצר מודרציה.
 * מה שחשוב בו זה שכל פעולה עוברת בשרת, נרשמת ביומן, ומשחררת פריטים
 * למצב שממנו הגיעו.
 */

const ITEM_REASON_LABELS: Record<string, string> = {
  not_squishy: "לא סקווישי",
  inappropriate: "תוכן לא מתאים",
  someone_elses_photo: "תמונה של מישהי אחרת",
  shows_a_person: "מופיע בה אדם",
  other: "אחר",
};
const TRADE_REASON_LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));

const STATE_LABEL: Record<string, string> = {
  open: "פתוח",
  reviewed: "נבדק",
  resolved: "טופל",
};

interface Report {
  kind: "trade" | "item";
  id: string;
  targetId: string;
  reporter: string;
  reported: string;
  reportedUser: string | null;
  reason: string;
  details: string | null;
  state: string;
  admin_note: string | null;
  created_at: string;
}
interface Repeat {
  user_id: string;
  nickname: string;
  code: string | null;
  reports: number;
  suspended: boolean;
}
interface Stuck {
  id: string;
  sender: string;
  receiver: string;
  reserved_at: string;
  items: { name: string; now: string; back_to: string }[];
}
interface Account {
  user_id: string;
  nickname: string;
  code: string;
  suspended_at: string;
  reason: string | null;
}
interface Action {
  id: string;
  admin_label: string;
  action: string;
  target: string;
  note: string | null;
  created_at: string;
}
interface Data {
  reports: Report[];
  repeat: Repeat[];
  stuck: Stuck[];
  accounts: Account[];
  actions: Action[];
}

type Filter = "open" | "reviewed" | "resolved" | "all";

export default function SquishAdmin() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/squish");
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const show = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await fetch("/api/admin/squish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      show("הפעולה נכשלה");
      return;
    }
    show(ok);
    await load();
  }

  if (!data) return <div className="p-6 text-sm text-[var(--muted)]">רגע…</div>;

  const reports = data.reports.filter((r) => filter === "all" || r.state === filter);
  const openCount = data.reports.filter((r) => r.state === "open").length;

  return (
    <div className="min-h-screen bg-[var(--canvas)] max-w-3xl mx-auto p-4 flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[19px] font-bold">סקוויש קלאב — מודרציה</h1>
        <a href="/admin" className="text-[13px] underline text-[var(--muted)]">לחמ"ל →</a>
      </div>

      {/* ── דיווחים ── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-[15px] font-bold">דיווחים</h2>
          {openCount > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 bg-[var(--danger-bg)] text-[var(--danger)]">
              {openCount} פתוחים
            </span>
          )}
          <div className="flex gap-1.5 mr-auto">
            {(["open", "reviewed", "resolved", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-[12px] border ${
                  filter === f
                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                    : "bg-white border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {f === "all" ? "הכל" : STATE_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {!reports.length && (
          <p className="text-[13px] text-[var(--muted)] bg-white border border-[var(--line)] p-3">
            אין דיווחים בסינון הזה.
          </p>
        )}

        {reports.map((r) => (
          <div key={r.id} className="bg-white border border-[var(--line)] p-3 flex flex-col gap-1.5">
            <div className="flex justify-between items-center text-[12px] text-[var(--muted)]">
              <span>
                {r.kind === "trade" ? "טרייד" : "פריט"} · {new Date(r.created_at).toLocaleString("he-IL")}
              </span>
              <span className="font-medium">{STATE_LABEL[r.state] ?? r.state}</span>
            </div>
            <div className="text-[13.5px]">
              <b>{r.reporter}</b> דיווחה על <b>{r.reported}</b>
            </div>
            <div className="text-[13px]">
              סיבה:{" "}
              {r.kind === "trade"
                ? TRADE_REASON_LABELS[r.reason] ?? r.reason
                : ITEM_REASON_LABELS[r.reason] ?? r.reason}
            </div>
            {r.details && (
              <div className="text-[12.5px] text-[var(--muted)] italic">"{r.details}"</div>
            )}
            <div className="text-[11px] text-[var(--faint)] font-mono" dir="ltr">
              {r.kind === "trade" ? "proposal" : "item"} {r.targetId.slice(0, 8)}
            </div>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {(["open", "reviewed", "resolved"] as const)
                .filter((s) => s !== r.state)
                .map((s) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() =>
                      act({ action: "report_state", reportId: r.id, kind: r.kind, state: s }, "עודכן")
                    }
                    className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                  >
                    לסמן {STATE_LABEL[s]}
                  </button>
                ))}
              {r.kind === "trade" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    act(
                      { action: "cancel_trade", proposalId: r.targetId, note: `מדיווח ${r.id.slice(0, 8)}` },
                      "הטרייד בוטל והפריטים שוחררו"
                    )
                  }
                  className="border border-[var(--danger-line)] text-[var(--danger)] px-2.5 py-1.5 text-[12px]"
                >
                  לבטל את הטרייד ולשחרר
                </button>
              )}
              {r.reportedUser && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const note = prompt("סיבת ההשהיה (נשמרת ביומן):") ?? "";
                    if (note) act({ action: "suspend", userId: r.reportedUser, note }, "החשבון הושהה");
                  }}
                  className="border border-[var(--danger-line)] text-[var(--danger)] px-2.5 py-1.5 text-[12px]"
                >
                  להשהות את החשבון
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* ── חשבונות עם כמה דיווחים ── */}
      {data.repeat.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold">חשבונות עם יותר מדיווח אחד</h2>
          {data.repeat.map((a) => (
            <div key={a.user_id} className="bg-white border border-[var(--line)] p-3 flex items-center gap-2">
              <span className="flex-1 text-[13.5px]">
                <b>{a.nickname}</b> · {a.reports} דיווחים
                {a.suspended && <span className="text-[var(--danger)]"> · מושהית</span>}
              </span>
              {a.code && (
                <a href={`/squish/c/${a.code}`} target="_blank" rel="noreferrer" className="text-[12px] underline">
                  לאוסף
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── טריידים תקועים ── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">טריידים ששמורים מעל שלושה ימים</h2>
        {!data.stuck.length && (
          <p className="text-[13px] text-[var(--muted)] bg-white border border-[var(--line)] p-3">
            אין טריידים תקועים.
          </p>
        )}
        {data.stuck.map((s) => (
          <div key={s.id} className="bg-white border border-[var(--line)] p-3 flex flex-col gap-1.5">
            <div className="text-[13.5px]">
              <b>{s.sender}</b> ↔ <b>{s.receiver}</b>
            </div>
            <div className="text-[12px] text-[var(--muted)]">
              שמור מאז {new Date(s.reserved_at).toLocaleString("he-IL")}
            </div>
            {/* מה בדיוק ישתחרר, ולאן — כדי שלא יהיו הפתעות */}
            <div className="text-[12.5px] flex flex-col gap-0.5">
              {s.items.map((i, k) => (
                <span key={k}>
                  {i.name}: {i.now} → <b>{i.back_to}</b>
                </span>
              ))}
            </div>
            <button
              disabled={busy}
              onClick={() => {
                const note = prompt("הערה לשחרור (נשמרת ביומן):") ?? "";
                act({ action: "cancel_trade", proposalId: s.id, note }, "שוחרר");
              }}
              className="border border-[var(--line)] px-3 py-2 text-[12.5px] self-start"
            >
              לשחרר את הטרייד
            </button>
          </div>
        ))}
      </section>

      {/* ── מושהים ── */}
      {data.accounts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-bold">חשבונות מושהים</h2>
          {data.accounts.map((a) => (
            <div key={a.user_id} className="bg-white border border-[var(--line)] p-3 flex items-center gap-2">
              <span className="flex-1 text-[13.5px]">
                <b>{a.nickname}</b>
                {a.reason && <span className="text-[var(--muted)]"> · {a.reason}</span>}
              </span>
              <button
                disabled={busy}
                onClick={() => act({ action: "restore", userId: a.user_id }, "החשבון הוחזר")}
                className="border border-[var(--line)] px-3 py-1.5 text-[12px]"
              >
                להחזיר
              </button>
            </div>
          ))}
        </section>
      )}

      {/* ── יומן ── */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">יומן פעולות</h2>
        <div className="bg-white border border-[var(--line)] p-3 flex flex-col gap-1 text-[12.5px]">
          {!data.actions.length && <span className="text-[var(--muted)]">עוד לא נעשו פעולות.</span>}
          {data.actions.map((a) => (
            <div key={a.id} className="flex gap-2">
              <span className="text-[var(--muted)]">
                {new Date(a.created_at).toLocaleString("he-IL")}
              </span>
              <span className="font-medium">{a.action}</span>
              <span>{a.target}</span>
              {a.note && <span className="text-[var(--muted)]">· {a.note}</span>}
            </div>
          ))}
        </div>
      </section>

      {toast && (
        <div className="fixed bottom-8 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90]">
          {toast}
        </div>
      )}
    </div>
  );
}
