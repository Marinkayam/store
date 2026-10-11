import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { diagnose, KIND_LABEL, KIND_TONE, type EventRow, type LoginKind } from "@/lib/login-events";
import { findStuck, storesByPhone } from "@/lib/stuck-logins";

// GET /api/admin/login-flow            — תמונת מצב: מי ניסה, מי נכנס, מי תקוע ולמה
// GET /api/admin/login-flow?phone=...  — הציר המלא של מספר אחד + מה קרה ומה עושים
//
// מרינה: "יש יוזרים שמנסים להיכנס עם סמס ולא מצליחים, ודרך האדמין קשה לי
// לתת להם מענה כי אין לי פלואו רציף." כל שורה כאן באה מ-login_events (0063),
// והאבחון ("מה קרה") מחושב ב-lib/login-events.ts.

const WINDOW_HOURS = 72;
const HEALTH_HOURS = 24;

type Row = EventRow & { phone: string };

function isMissingTable(msg: string | undefined, code?: string) {
  return code === "42P01" || /does not exist|schema cache|could not find the table/i.test(msg ?? "");
}

const present = (r: Row) => ({
  at: r.at,
  kind: r.kind,
  label: KIND_LABEL[r.kind as LoginKind] ?? r.kind,
  tone: KIND_TONE[r.kind as LoginKind] ?? "neutral",
  detail: r.detail,
  client: r.client,
});

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "אין גישה" }, { status: 403 });
  const db = supabaseAdmin();
  const q = (req.nextUrl.searchParams.get("phone") ?? "").trim();

  /* ── מספר אחד ── */
  if (q) {
    const digits = q.replace(/\D/g, "");
    const normalized = normalizePhone(q);
    let phones: string[] = [];

    /* קודם התאמה מדויקת: המספר המנורמל, או הספרות כפי שהוקלדו (מספר שנדחה
       נרשם כמו שהוא). רק אם אין כלום — חיפוש חלקי ("הספרות האחרונות"). */
    const exact = [...new Set([normalized, digits].filter((x): x is string => !!x))];
    if (exact.length) {
      const { data: hit, error } = await db.from("login_events").select("phone").in("phone", exact).limit(1);
      if (error) {
        if (isMissingTable(error.message, error.code)) return NextResponse.json({ missing: true });
        return NextResponse.json({ error: "לא הצלחנו לחפש" }, { status: 500 });
      }
      if (hit?.length) phones = [hit[0].phone as string];
    }
    if (!phones.length && normalized) {
      phones = [normalized];
    } else if (!phones.length && digits.length >= 3) {
      // לא מספר שלם: אחרוני הספרות. מחפשים בכל המספרים שהיה להם ניסיון ב-30 הימים האחרונים.
      const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const { data, error } = await db
        .from("login_events")
        .select("phone")
        .gte("at", since)
        .like("phone", `%${digits}%`)
        .limit(200);
      if (error) {
        if (isMissingTable(error.message, error.code)) return NextResponse.json({ missing: true });
        return NextResponse.json({ error: "לא הצלחנו לחפש" }, { status: 500 });
      }
      phones = [...new Set((data ?? []).map((r) => r.phone as string))].slice(0, 8);
      if (phones.length > 1) {
        return NextResponse.json({ candidates: phones });
      }
    }
    if (!phones.length) {
      return NextResponse.json({
        phone: normalized ?? digits,
        events: [],
        diagnosis: diagnose([]),
        store: null,
        notFound: true,
      });
    }

    const phone = phones[0];
    const { data: evs, error } = await db
      .from("login_events")
      .select("phone, at, kind, detail, client")
      .eq("phone", phone)
      .order("at", { ascending: true })
      .limit(300);
    if (error) {
      if (isMissingTable(error.message, error.code)) return NextResponse.json({ missing: true });
      return NextResponse.json({ error: "לא הצלחנו לטעון" }, { status: 500 });
    }
    const rows = (evs ?? []) as Row[];

    const [{ data: store }, { data: links }] = await Promise.all([
      db.from("stores").select("display_name, emoji").eq("contact_phone", phone).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      db.from("login_links").select("created_at, used_at, expires_at").eq("phone", phone).order("created_at", { ascending: false }).limit(1),
    ]);
    const lastLink = links?.[0] ?? null;

    return NextResponse.json({
      phone,
      events: rows.map(present),
      diagnosis: diagnose(rows),
      store: store ? { name: store.display_name, emoji: store.emoji } : null,
      openLink:
        lastLink && !lastLink.used_at && new Date(lastLink.expires_at).getTime() > Date.now()
          ? lastLink.created_at
          : null,
    });
  }

  /* ── תמונת מצב ──
     "צריכות עזרה" היא רשימה אחת: מי שהיומן (0063) אומר שהפרק האחרון שלה לא
     נגמר בכניסה, ומי ש-phone_otps אומר שביקשה קוד כמה פעמים ולא נכנסה (זה
     מכסה גם ניסיונות מלפני שהיומן נפתח). קודם אלה היו שני כרטיסים נפרדים. */
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const [{ data: all, error }, stuckList] = await Promise.all([
    db.from("login_events").select("phone, at, kind, detail, client").gte("at", since).order("at", { ascending: true }).limit(6000),
    findStuck(db),
  ]);
  const missing = !!error && isMissingTable(error.message, error.code);
  if (error && !missing) {
    console.error("[admin/login-flow]", error.message);
    return NextResponse.json({ error: "לא הצלחנו לטעון" }, { status: 500 });
  }

  const byPhone = new Map<string, Row[]>();
  for (const r of (missing ? [] : (all ?? [])) as Row[]) {
    const l = byPhone.get(r.phone) ?? [];
    l.push(r);
    byPhone.set(r.phone, l);
  }

  const healthSince = Date.now() - HEALTH_HOURS * 3600_000;
  let tried = 0, entered = 0, smsFailed = 0, wrong = 0;
  const failReasons = new Map<string, Set<string>>();
  const recentFails: { reason: string; at: string; phone: string }[] = [];
  for (const [phone, rows] of byPhone) {
    const recent = rows.filter((r) => new Date(r.at).getTime() >= healthSince);
    if (recent.some((r) => r.kind === "code_requested" || r.kind === "phone_invalid" || r.kind === "sms_failed")) tried++;
    if (recent.some((r) => r.kind === "verify_ok" || r.kind === "link_used")) entered++;
    const sf = recent.filter((r) => r.kind === "sms_failed");
    if (sf.length) smsFailed++;
    if (recent.some((r) => r.kind === "verify_wrong" || r.kind === "verify_locked")) wrong++;
    for (const f of sf) {
      const reason = f.detail ?? "סיבה לא ידועה";
      const set = failReasons.get(reason) ?? new Set<string>();
      set.add(phone);
      failReasons.set(reason, set);
      recentFails.push({ reason, at: f.at, phone });
    }
  }

  // תקלה כללית בספק: אותה סיבה אצל 2 מספרים שונים או יותר בשעה האחרונה
  const hourAgo = Date.now() - 3600_000;
  let outage: { reason: string; phones: number; lastAt: string } | null = null;
  for (const [reason] of failReasons) {
    const hits = recentFails.filter((f) => f.reason === reason && new Date(f.at).getTime() >= hourAgo);
    const n = new Set(hits.map((h) => h.phone)).size;
    if (n >= 2 && (!outage || n > outage.phones)) {
      outage = { reason, phones: n, lastAt: hits.map((h) => h.at).sort().pop()! };
    }
  }

  type Need = {
    phone: string; valid: boolean; headline: string; action: string; lastAt: string;
    requests: number | null; wrongCodes: number | null; helpAt: string | null; linkSentAt: string | null;
  };
  const need = new Map<string, Need>();
  for (const [phone, rows] of byPhone) {
    const d = diagnose(rows);
    if (d.state !== "bad") continue;
    need.set(phone, {
      phone, valid: /^972\d{9}$/.test(phone), headline: d.headline, action: d.action,
      lastAt: rows[rows.length - 1].at, requests: null, wrongCodes: null, helpAt: null, linkSentAt: null,
    });
  }
  for (const st of stuckList ?? []) {
    const ev = byPhone.get(st.phone);
    const cur = need.get(st.phone);
    // היומן אומר שהיא נכנסה *אחרי* הבקשה האחרונה? אז היא לא תקועה, גם אם
    // phone_otps עוד זוכר בקשות. כניסה ישנה יותר לא מבטלת תקיעה חדשה.
    const lastOk = (ev ?? []).filter((e) => e.kind === "verify_ok" || e.kind === "link_used").map((e) => e.at).sort().pop();
    if (!cur && lastOk && lastOk > st.lastAt) continue;
    need.set(st.phone, {
      phone: st.phone,
      valid: true,
      headline: cur?.headline ?? `ביקשה קוד ${st.requests === 1 ? "פעם אחת" : `${st.requests} פעמים`} ולא נכנסה`,
      action: cur?.action ?? "link",
      lastAt: [cur?.lastAt ?? "", st.lastAt].sort().pop()!,
      requests: st.requests,
      wrongCodes: st.wrongCodes,
      helpAt: st.helpAt,
      linkSentAt: st.linkSentAt,
    });
  }
  // מי שלחצו "לא קיבלתי קוד" ראשונים, ואחריהם לפי הזמן
  const top = [...need.values()]
    .sort((a, b) => Number(!!b.helpAt) - Number(!!a.helpAt) || b.lastAt.localeCompare(a.lastAt))
    .slice(0, 25);
  const stores = await storesByPhone(db, top.map((n) => n.phone));

  return NextResponse.json({
    missing,
    health: missing ? null : { hours: HEALTH_HOURS, tried, entered, smsFailed, wrong },
    outage,
    needHelp: top.map((n) => ({ ...n, store: stores.get(n.phone) ?? null })),
  });
}
