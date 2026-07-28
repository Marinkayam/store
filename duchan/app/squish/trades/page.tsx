"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CANCEL_REASONS, REPORT_REASONS, track, type Trade } from "@/lib/squish-trade";
import { squishError } from "@/lib/squish-errors";
import { EmptyCollection } from "../components";
import { Media, TwoSides } from "../trade-parts";
import Feedback from "../feedback";

/**
 * טריידים — קיבלתי · שלחתי · סגורים.
 *
 * הכלל של המסך הזה: אף פעם לא מוצג סטטוס טכני. הילדה רואה מה קורה
 * ומה הפעולה הבאה שלה, ולא "countered" או "ready_for_whatsapp".
 */

type Tab = "received" | "sent" | "closed";
const CLOSED: Trade["status"][] = ["completed", "declined", "cancelled", "reported"];

export default function TradesPage() {
  return (
    <Suspense fallback={<div className="p-6 t-small text-[var(--muted)]">רגע…</div>}>
      <Trades />
    </Suspense>
  );
}

function Trades() {
  const params = useSearchParams();
  const urlTab = params.get("tab");
  const [tab, setTab] = useState<Tab>(
    urlTab === "sent" ? "sent" : urlTab === "closed" ? "closed" : "received"
  );
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/squish/trades");
    const d = await res.json().catch(() => null);
    const list: Trade[] = d?.trades ?? [];
    setTrades(list);
    setLoading(false);
    /* סימון "נצפה" נעשה כאן ולא בתוך כל כרטיס: אפקט שרץ בתוך רכיב
       שמתרנדר מחדש היה מפספס לפעמים, וזה מה שהשאיר הצעות במצב "נשלחה"
       גם אחרי שהמקבלת פתחה אותן. */
    const unseen = list.filter((t) => t.role === "receiver" && t.status === "sent");
    if (unseen.length) {
      const supa = supabaseBrowser();
      await Promise.all(unseen.map((t) => supa.rpc("squish_mark_viewed", { p_proposal: t.id })));
      unseen.forEach((t) => track("squish_trade_viewed", { id: t.id }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 2600);
  };

  /** כל פעולה עוברת בפונקציה בשרת. הסטטוס אף פעם לא נקבע כאן. */
  async function call(fn: string, args: Record<string, unknown>, id: string, ok: string) {
    setBusy(id);
    const { data, error } = await supabaseBrowser().rpc(fn, args);
    setBusy(null);
    if (error) {
      console.error(`[squish] ${fn} failed:`, error.message);
      showToast(squishError(error.message));
      await load();
      return null;
    }
    showToast(ok);
    await load();
    return data;
  }

  if (loading) return <div className="p-6 t-small text-[var(--muted)]">רגע…</div>;

  const received = trades.filter((t) => t.role === "receiver" && !CLOSED.includes(t.status) && t.status !== "ready_for_whatsapp");
  const sent = trades.filter((t) => t.role === "sender" && !CLOSED.includes(t.status) && t.status !== "ready_for_whatsapp");
  const closed = trades.filter((t) => CLOSED.includes(t.status) || t.status === "ready_for_whatsapp");
  const shown = tab === "received" ? received : tab === "sent" ? sent : closed;

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "received", label: "קיבלתי", n: received.length },
    { key: "sent", label: "שלחתי", n: sent.length },
    { key: "closed", label: "סגורים", n: closed.length },
  ];

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="t-heading">טריידים</h1>

      <div className="flex gap-3 border-b border-[var(--line)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`pb-2 px-1 text-[13.5px] border-b-2 -mb-px ${
              tab === t.key ? "border-[var(--ink)] font-medium" : "border-transparent text-[var(--muted)]"
            }`}
          >
            {t.label} {t.n > 0 && <span className="text-[12px]">{t.n}</span>}
          </button>
        ))}
      </div>

      {!shown.length ? (
        <EmptyState tab={tab} />
      ) : (
        shown.map((t) => (
          <TradeCard key={t.id} t={t} busy={busy === t.id} call={call} onToast={showToast} reload={load} />
        ))
      )}

      {/* שאלה אחת, על הרגע שהכי טרי. טרייד שנסגר קודם להצעה ראשונה. */}
      {trades.some((t) => t.status === "completed" || t.status === "cancelled") ? (
        <Feedback moment="trade_closed" />
      ) : trades.some((t) => t.role === "sender") ? (
        <Feedback moment="first_proposal" />
      ) : null}

      {toast && (
        <div className="fixed bottom-24 right-1/2 translate-x-1/2 bg-[var(--ink)] text-white px-4 py-2.5 text-[13px] z-[90] max-w-[20rem] text-center leading-relaxed">
          {toast}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  if (tab === "received")
    return (
      <EmptyCollection
        title="עוד לא קיבלת הצעה"
        body="שתפי את האוסף שלך כדי שחברות יראו מה פתוח לטרייד."
        cta="לאוסף שלי"
        href="/squish/collection"
      />
    );
  if (tab === "sent")
    return (
      <EmptyCollection
        title="עוד לא הצעת טרייד"
        body='ב"לגלות" מחכים סקווישים מהמעגל שלך.'
        cta="ללגלות"
        href="/squish/discover"
      />
    );
  return (
    <EmptyCollection
      title="הטרייד הראשון שלך עוד בדרך"
      body="כששתיכן מסכימות על ההצעה, אפשר להמשיך לתיאום."
      cta="ללגלות"
      href="/squish/discover"
    />
  );
}

function TradeCard({
  t,
  busy,
  call,
  onToast,
  reload,
}: {
  t: Trade;
  busy: boolean;
  call: (fn: string, args: Record<string, unknown>, id: string, ok: string) => Promise<unknown>;
  onToast: (m: string) => void;
  reload: () => Promise<void>;
}) {
  const [counter, setCounter] = useState(false);
  const [keep, setKeep] = useState<string[]>(t.offered.map((o) => o.id));
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [parentAck, setParentAck] = useState(t.parentAck);

  const headline =
    t.role === "receiver"
      ? `${t.other.nickname} רוצה את ${t.requested.name} שלך`
      : `ביקשת את ${t.requested.name} של ${t.other.nickname}`;

  /** מה קורה עכשיו, בשפה של הילדה ולא בשם הסטטוס. */
  const state = (() => {
    if (t.status === "completed") return "הטרייד הושלם 🎉";
    if (t.status === "declined") return "ההצעה נדחתה";
    if (t.status === "cancelled") return "הטרייד בוטל";
    if (t.status === "reported") return "דיווחת על בעיה, אנחנו בודקות";
    if (t.status === "ready_for_whatsapp") {
      if (t.iConfirmedDone && !t.theyConfirmedDone) return `סימנת שהטרייד הושלם, מחכים ל${t.other.nickname}`;
      return "שתיכן אישרתן, אפשר לסגור את הטרייד";
    }
    if (t.iApproved && t.theyApproved) return "שתיכן אישרתן";
    if (!t.iApproved) return `${t.other.nickname} מחכה לתשובה שלך`;
    return `מחכה לתשובה של ${t.other.nickname}`;
  })();

  return (
    <div className="bg-white border border-[var(--line)] p-3 flex flex-col gap-2.5">
      <div>
        <div className="text-[13.5px] font-bold leading-snug">{headline}</div>
        <div className="t-small text-[var(--muted)] mt-0.5">
          {state}
          {t.connection_context ? ` · ${t.connection_context}` : ""}
        </div>
      </div>

      <TwoSides
        leftLabel={t.role === "receiver" ? "היא מציעה" : "את נותנת"}
        left={t.offered}
        rightLabel={t.role === "receiver" ? "היא רוצה" : "את מקבלת"}
        right={[t.requested]}
      />

      {/* ── הצעה נגדית: אפשר רק לצמצם ── */}
      {counter && (
        <div className="border border-[var(--line)] p-2.5">
          <div className="t-small font-medium">אילו מהם מתאימים לך?</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            אפשר להוריד פריטים מההצעה. אי אפשר לבחור פריטים אחרים מהאוסף
            שלה — רק היא בוחרת מה להציע.
          </p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {t.offered.map((o) => {
              const on = keep.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => setKeep((k) => (on ? k.filter((x) => x !== o.id) : [...k, o.id]))}
                  aria-pressed={on}
                  aria-label={`להשאיר: ${o.name}`}
                  className={`squish-card text-start ${on ? "" : "opacity-40"}`}
                >
                  <div className="aspect-square bg-[var(--cream)] overflow-hidden flex items-center justify-center">
                    <Media item={o} />
                  </div>
                  <div className="text-[11.5px] truncate pt-1">{o.name}</div>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-2.5">
            <button
              disabled={!keep.length || busy}
              onClick={async () => {
                await call("squish_counter_proposal", { p_proposal: t.id, p_keep: keep }, t.id, "ההצעה עודכנה");
                track("squish_trade_countered", { id: t.id });
                setCounter(false);
              }}
              className="btn btn-primary flex-1 t-small"
            >
              לשלוח הצעה מעודכנת
            </button>
            <button onClick={() => setCounter(false)} className="btn btn-secondary px-4 t-small">
              ביטול
            </button>
          </div>
        </div>
      )}

      {/* ── פעולות ── */}
      {!counter && !CLOSED.includes(t.status) && t.status !== "ready_for_whatsapp" && (
        <div className="flex gap-2 flex-wrap">
          {!t.iApproved && (
            <button
              disabled={busy}
              onClick={async () => {
                const r = await call(
                  "squish_approve_version",
                  { p_proposal: t.id, p_version: t.version_id },
                  t.id,
                  "אישרת את ההצעה"
                );
                track("squish_trade_approved", { id: t.id });
                if (r === "accepted") {
                  await call("squish_accept_and_reserve_trade", { p_proposal: t.id }, t.id, "הטרייד נשמר, אפשר לתאם");
                  track("squish_trade_reserved", { id: t.id });
                }
              }}
              className="btn btn-primary flex-1 t-small"
            >
              מתאים לי
            </button>
          )}
          {t.iApproved && t.theyApproved && (
            <button
              disabled={busy}
              onClick={async () => {
                await call("squish_accept_and_reserve_trade", { p_proposal: t.id }, t.id, "הטרייד נשמר");
              }}
              className="btn btn-primary flex-1 t-small"
            >
              לשמור את הטרייד
            </button>
          )}
          {t.offered.length > 1 && (
            <button onClick={() => setCounter(true)} className="btn btn-secondary t-small px-4">
              לשנות את ההצעה
            </button>
          )}
          {t.role === "receiver" ? (
            <button
              disabled={busy}
              onClick={() => call("squish_decline_proposal", { p_proposal: t.id }, t.id, "ההצעה נדחתה")}
              className="border border-[var(--danger-line)] text-[var(--danger)] px-3 py-2 text-[13px]"
            >
              לא הפעם
            </button>
          ) : (
            <button onClick={() => setCancelOpen(true)} className="border border-[var(--line)] text-[var(--muted)] px-3 py-2 text-[13px]">
              לבטל
            </button>
          )}
        </div>
      )}

      {/* ── מוכן לוואטסאפ ── */}
      {t.status === "ready_for_whatsapp" && (
        <div className="bg-[var(--ok-bg)] border border-[var(--ok-line)] p-3">
          <div className="text-[13px] font-bold">הטרייד מוכן לסגירה</div>
          <p className="text-[12.5px] leading-relaxed mt-1">
            קובעות מקום וזמן <b>רק בידיעת ההורים</b>.
          </p>
          <label className="flex items-start gap-2 mt-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={parentAck}
              aria-label="ההורה שלי יודע"
              onChange={async (e) => {
                setParentAck(e.target.checked);
                if (e.target.checked) await supabaseBrowser().rpc("squish_ack_parent", { p_proposal: t.id });
              }}
              className="mt-0.5 w-4 h-4 shrink-0"
            />
            אני מאשרת שההורה שלי יודע שהטרייד מוכן לתיאום.
          </label>
          <button
            disabled={!parentAck}
            onClick={async () => {
              const res = await fetch("/api/squish/trades/whatsapp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proposalId: t.id }),
              });
              const d = await res.json();
              if (!res.ok) return onToast(d.error ?? "לא הצלחנו לפתוח וואטסאפ");
              track("squish_whatsapp_opened", { id: t.id });
              window.location.href = d.url;
            }}
            className="btn btn-primary w-full mt-2.5 disabled:opacity-40"
          >
            להמשיך ל-WhatsApp
          </button>

          <div className="flex gap-2 mt-2">
            <button
              disabled={t.iConfirmedDone || busy}
              onClick={async () => {
                const r = await call("squish_confirm_completion", { p_proposal: t.id }, t.id,
                  "סימנת שהטרייד הושלם");
                if (r === "completed") {
                  track("squish_trade_completed", { id: t.id });
                  onToast("טרייד הושלם! הסקווישים עברו לאוסף החדש שלהם 🎉");
                }
              }}
              className="btn btn-secondary flex-1 t-small"
            >
              {t.iConfirmedDone ? "סימנת שהושלם ✓" : "הטרייד הושלם"}
            </button>
            <button onClick={() => setReportOpen(true)} className="btn btn-secondary px-3 t-small">
              הייתה בעיה
            </button>
          </div>
          <button onClick={() => setCancelOpen(true)} className="t-small text-[var(--muted)] underline mt-2">
            הטרייד לא קרה, לבטל
          </button>
        </div>
      )}

      {/* ── ביטול ודיווח ── */}
      {cancelOpen && (
        <Reasons
          title="למה מבטלות?"
          options={CANCEL_REASONS}
          onPick={async (reason) => {
            setCancelOpen(false);
            await call("squish_cancel_trade", { p_proposal: t.id, p_reason: reason }, t.id, "הטרייד בוטל והפריטים שוחררו");
            track("squish_trade_cancelled", { id: t.id, reason });
          }}
          onClose={() => setCancelOpen(false)}
        />
      )}
      {reportOpen && (
        <Reasons
          title="מה קרה?"
          options={REPORT_REASONS}
          onPick={async (reason) => {
            setReportOpen(false);
            await call("squish_report_trade", { p_proposal: t.id, p_reason: reason, p_details: null }, t.id,
              "הדיווח נשמר. רק אנחנו רואות אותו.");
            track("squish_trade_reported", { id: t.id, reason });
            await reload();
          }}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}

function Reasons({
  title,
  options,
  onPick,
  onClose,
}: {
  title: string;
  options: { key: string; label: string }[];
  onPick: (k: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="border border-[var(--line)] p-2.5">
      <div className="t-small font-medium mb-1.5">{title}</div>
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onPick(o.key)}
            className="border border-[var(--line)] px-3 py-2 text-[13px] text-start"
          >
            {o.label}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="t-small text-[var(--muted)] underline mt-2">
        חזרה
      </button>
    </div>
  );
}
