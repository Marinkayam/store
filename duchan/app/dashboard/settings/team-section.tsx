"use client";

import { useCallback, useEffect, useState } from "react";
import type { Store } from "@/lib/types";
import { STORE_PICK_KEY } from "../use-store";

/**
 * 👥 צוות הדוכן (0057) — מקטע ב"הדוכן שלי".
 *
 * ראש הדוכן: מזמין/ה לפי מספר טלפון (נשלח בוואטסאפ), רואה הזמנות פתוחות,
 * מוציא/ה שותפים, בוחר/ת לאן מגיעות ההזמנות, ומעביר/ה ראשות (השותף/ה
 * צריך/ה לאשר). שותף/ה: רואה את הצוות, יכול/ה לצאת, ומאשר/ת ראשות.
 *
 * כל פעולה עוברת ב-/api/team. כאן אין שום כתיבה ישירה לדאטהבייס.
 */
type Person = { userId: string; role: "owner" | "partner"; phone: string; ordersPhone: boolean; me: boolean };
type Invite = { id: string; phone: string; expiresAt: string; token: string };
type Team = { role: "owner" | "partner"; me: string; people: Person[]; invites: Invite[]; maxPartners: number; transferTo: string | null };

export default function TeamSection({ store, onToast }: { store: Store; onToast: (m: string) => void }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [justInvited, setJustInvited] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/team?storeId=${store.id}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "לא הצלחנו לטעון את הצוות");
      return;
    }
    setTeam(d);
  }, [store.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}, ok?: string) {
    if (busy) return null;
    setBusy(true);
    try {
      const r = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, storeId: store.id, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        onToast(d.error ?? "משהו השתבש, לנסות שוב");
        return null;
      }
      if (ok) onToast(ok);
      await load();
      return d;
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const joinUrl = (token: string) => `${origin}/join/${token}`;
  const inviteText = (token: string) =>
    `היי! 👋 בואו לנהל איתי את הדוכן "${store.display_name}" 🛍️\nנכנסים עם הטלפון שלכם, כאן:\n${joinUrl(token)}`;
  const sendWa = (token: string) => window.open(`https://wa.me/?text=${encodeURIComponent(inviteText(token))}`, "_blank");

  async function invite() {
    const d = await act("invite", { phone }, undefined);
    if (d?.token) {
      setPhone("");
      setJustInvited(d.token);
      onToast(d.renewed ? "ההזמנה חודשה ✨" : "ההזמנה מוכנה — עכשיו שולחים 💌");
    }
  }

  /** אחרי יציאה / העברה — הדשבורד נטען מחדש על הדוכן הנכון */
  function reloadDashboard(leftStore = false) {
    if (leftStore) {
      try {
        localStorage.removeItem(STORE_PICK_KEY);
      } catch {}
    }
    window.location.assign("/dashboard/settings");
  }

  if (error) return <p className="text-[13px] text-[var(--danger)] px-1" data-testid="team-error">{error}</p>;
  if (!team) return <p className="text-[12.5px] text-[var(--muted)] px-1">רגע…</p>;

  const isOwner = team.role === "owner";
  const partners = team.people.filter((p) => p.role === "partner");
  const room = team.maxPartners - partners.length - team.invites.length;
  const transferTarget = team.people.find((p) => p.userId === team.transferTo);
  const iAmAskedToLead = team.transferTo === team.me;

  return (
    <div className="flex flex-col gap-3" data-testid="team-section">
      {/* בקשת ראשות שמחכה לי */}
      {iAmAskedToLead && (
        <div className="bg-[var(--warn-bg)] border border-[var(--warn-line)] p-3.5" data-testid="transfer-ask">
          <div className="text-[14px] font-bold">👑 מבקשים שתהיו ראש הדוכן</div>
          <p className="text-[12.5px] text-[var(--warn-ink)] leading-relaxed mt-1">
            ראש הדוכן מחליט/ה מי בצוות, לאן מגיעות ההזמנות ואיך משלמים. ראש הדוכן הנוכחי/ת יישאר/תישאר בצוות כשותף/ה.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <button
              disabled={busy}
              onClick={async () => (await act("accept_transfer", {}, "עכשיו את/ה ראש הדוכן 👑")) && reloadDashboard()}
              data-testid="transfer-accept"
              className="fx-press bg-[var(--ink)] text-white py-2.5 text-[13px] font-bold"
            >
              כן, אני ראש הדוכן
            </button>
            <button
              disabled={busy}
              onClick={() => act("decline_transfer", {}, "בסדר, הכל נשאר כמו שהיה")}
              data-testid="transfer-decline"
              className="border border-[var(--line)] bg-white py-2.5 text-[13px]"
            >
              לא עכשיו
            </button>
          </div>
        </div>
      )}

      {/* מי בצוות */}
      <div className="bg-white border border-[var(--line)]">
        <div className="px-3.5 pt-3.5 pb-2 text-[13.5px] font-bold">מי מנהל את הדוכן</div>
        {team.people.map((p) => (
          <div key={p.userId} className="px-3.5 py-3 border-t border-[var(--sand)]" data-testid={`team-person-${p.role}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-[20px]" aria-hidden>{p.role === "owner" ? "👑" : "🤝"}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold">
                  {p.role === "owner" ? "ראש הדוכן" : "שותף/ה"}
                  {p.me && <span className="font-normal text-[var(--muted)]"> · זה אני</span>}
                </span>
                <span className="block text-[12px] text-[var(--muted)]" dir="ltr" style={{ textAlign: "right" }}>{p.phone}</span>
              </span>
              {p.ordersPhone && (
                <span className="text-[11px] font-bold px-2 py-1 bg-[var(--ok-bg)] text-[var(--ok-ink)]" data-testid="orders-phone-badge">
                  📲 ההזמנות מגיעות לכאן
                </span>
              )}
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {!p.ordersPhone && (
                  <button
                    disabled={busy}
                    onClick={() => act("orders_phone", { userId: p.userId }, "מעכשיו ההזמנות מגיעות לטלפון הזה 📲")}
                    data-testid="set-orders-phone"
                    className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                  >
                    📲 שההזמנות יגיעו לכאן
                  </button>
                )}
                {p.role === "partner" && team.transferTo !== p.userId && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      window.confirm("להעביר את הראשות? השותף/ה יצטרכו לאשר, ואת/ה נשאר/ת בצוות כשותף/ה.") &&
                      act("transfer", { userId: p.userId }, "שלחנו בקשה. הראשות תעבור כשהשותף/ה יאשרו")
                    }
                    data-testid="transfer-start"
                    className="border border-[var(--line)] px-2.5 py-1.5 text-[12px]"
                  >
                    👑 להעביר ראשות
                  </button>
                )}
                {p.role === "partner" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      window.confirm("להוציא מהצוות? הגישה לדוכן נסגרת מיד. המוצרים וההזמנות נשארים.") &&
                      act("remove", { userId: p.userId }, "השותף/ה יצאו מהצוות")
                    }
                    data-testid="team-remove"
                    className="border border-[var(--danger)] text-[var(--danger)] px-2.5 py-1.5 text-[12px]"
                  >
                    להוציא מהצוות
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* בקשת ראשות שראש הדוכן שלח/ה ומחכה */}
      {isOwner && transferTarget && (
        <div className="bg-[var(--canvas)] border border-[var(--line)] p-3.5 text-[12.5px]" data-testid="transfer-pending">
          ⏳ ביקשת להעביר את הראשות ל-<span dir="ltr">{transferTarget.phone}</span>. מחכים לאישור.{" "}
          <button disabled={busy} onClick={() => act("cancel_transfer", {}, "הבקשה בוטלה")} className="underline" data-testid="transfer-cancel">
            לבטל
          </button>
        </div>
      )}

      {/* הזמנה לשותף/ה — רק ראש הדוכן */}
      {isOwner && (
        <div className="bg-white border border-[var(--line)] p-3.5">
          <div className="text-[13.5px] font-bold">🤝 להוסיף שותף/ה</div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed mt-0.5">
            חבר/ה, אח או אחות. כל אחד נכנס עם הטלפון שלו, ורק המספר שהזמנתם יכול להצטרף.
          </p>
          {room > 0 ? (
            <div className="flex gap-2 mt-2.5">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                inputMode="tel"
                placeholder="050-0000000"
                aria-label="הטלפון של השותף/ה"
                className="flex-1 min-w-0 border border-[var(--line)] px-3 py-2.5 text-[14px]"
                dir="ltr"
              />
              <button
                disabled={busy || phone.trim().length < 9}
                onClick={invite}
                data-testid="team-invite"
                className="shrink-0 bg-[var(--ink)] text-white px-4 text-[13px] font-bold disabled:opacity-50"
              >
                להזמין
              </button>
            </div>
          ) : (
            <p className="text-[12.5px] text-[var(--warn-ink)] mt-2" data-testid="team-full">
              הצוות מלא: ראש הדוכן ועוד {team.maxPartners} שותפים{team.invites.length ? " (כולל הזמנות שמחכות)" : ""}.
            </p>
          )}
        </div>
      )}

      {/* הזמנות שמחכות */}
      {isOwner && team.invites.length > 0 && (
        <div className="bg-white border border-[var(--line)]">
          <div className="px-3.5 pt-3.5 pb-2 text-[13.5px] font-bold">💌 הזמנות שמחכות</div>
          {team.invites.map((i) => (
            <div
              key={i.id}
              className={`px-3.5 py-3 border-t border-[var(--sand)] ${justInvited === i.token ? "bg-[var(--warn-bg)]" : ""}`}
              data-testid="team-invite-row"
            >
              <div className="text-[13px]">
                ל-<span dir="ltr">{i.phone}</span>
                <span className="text-[11.5px] text-[var(--muted)]">
                  {" "}· בתוקף עד {new Date(i.expiresAt).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button
                  onClick={() => sendWa(i.token)}
                  data-testid="invite-whatsapp"
                  className="fx-press bg-[var(--whatsapp)] text-white px-3 py-2 text-[12.5px] font-bold"
                >
                  💬 לשלוח בוואטסאפ
                </button>
                <button
                  onClick={() =>
                    navigator.clipboard?.writeText(joinUrl(i.token)).then(
                      () => onToast("הלינק להצטרפות הועתק"),
                      () => onToast("לא הצלחנו להעתיק")
                    )
                  }
                  data-testid="invite-copy"
                  className="border border-[var(--line)] px-3 py-2 text-[12.5px]"
                >
                  📋 העתקת הלינק
                </button>
                <button
                  disabled={busy}
                  onClick={() => act("cancel_invite", { inviteId: i.id }, "ההזמנה בוטלה")}
                  data-testid="invite-cancel"
                  className="px-2 py-2 text-[12.5px] text-[var(--muted)] underline"
                >
                  לבטל
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* מה כל אחד יכול */}
      <div className="bg-[var(--canvas)] border border-[var(--line)] p-3.5 text-[12.5px] leading-relaxed" data-testid="team-rules">
        <div className="font-bold mb-1">מי יכול מה</div>
        <div>🤝 <b>כולם:</b> מוצרים, הזמנות, עיצוב, קופונים, משלוחים ושיתוף.</div>
        <div className="mt-0.5">👑 <b>רק ראש הדוכן:</b> מי בצוות, לאן מגיעות ההזמנות, איך משלמים, והתשלום על הדוכן.</div>
      </div>

      {/* שותף/ה: לצאת */}
      {!isOwner && (
        <button
          disabled={busy}
          onClick={async () =>
            window.confirm(`לצאת מהדוכן "${store.display_name}"? אפשר לחזור רק בהזמנה חדשה.`) &&
            (await act("leave", {}, "יצאת מהדוכן")) &&
            reloadDashboard(true)
          }
          data-testid="team-leave"
          className="w-full border border-[var(--danger)] text-[var(--danger)] py-3 text-[13px] font-bold"
        >
          לצאת מהדוכן
        </button>
      )}
    </div>
  );
}
