#!/usr/bin/env node
/**
 * בודק שהדומיין באמת מוגדר נכון. להריץ מהמחשב שלך, לא מהשרת.
 *
 *   npm run check:dns duchan.app
 *
 * DNS נכשל בשקט: הכל "נראה" תקין, ואז התצוגה המקדימה בוואטסאפ יוצאת ריקה
 * או שהדפדפן נכנס ללולאת הפניות. הסקריפט הזה אומר איפה בדיוק זה נתקע.
 */
import { promises as dns } from "node:dns";

const domain = (process.argv[2] || process.env.NEXT_PUBLIC_SITE_URL || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");

if (!domain) {
  console.error("שימוש:  npm run check:dns duchan.app");
  process.exit(1);
}

const results = [];
const ok = (n, d = "") => results.push({ ok: true, n, d });
const bad = (n, d = "") => results.push({ ok: false, n, d });
const warn = (n, d = "") => results.push({ warn: true, n, d });

/* ── 1. Nameservers ── */
// כשה-NS כבר ב-Cloudflare אבל כלום לא נפתר, זה לא תקלה — זה פשוט "עוד לא פרסנו".
// בלי ההבחנה הזו הסקריפט מדווח על מצב תקין כארבע בעיות, ומי שקורא אותו מפסיק להאמין לו.
let onCloudflare = false;
try {
  const ns = await dns.resolveNs(domain);
  onCloudflare = ns.some((h) => h.endsWith("ns.cloudflare.com"));
  onCloudflare
    ? ok("nameservers מצביעים ל-Cloudflare", ns.join(", "))
    : bad(
        "nameservers עדיין לא ב-Cloudflare",
        `${ns.join(", ")} → ב-GoDaddy: My Products → ${domain} → DNS → Nameservers → Change → I'll use my own`
      );
} catch (e) {
  bad("אין רשומות NS", `${e.code} — אולי ההפצה עוד לא הסתיימה (עד 24 שעות)`);
}

/** לפני שיש דיפלוי, "לא נפתר" הוא הצעד הבא ולא כשל */
const pending = onCloudflare ? warn : bad;

/**
 * A, ואם אין — AAAA. שתי הטעויות שהיו כאן:
 *
 * 1. `resolve4(h).catch(() => resolve6(h))` — כשה-A נכשל רגעית, השגיאה שדווחה
 *    הייתה של ה-AAAA ("queryAaaa ENODATA"), ולכן דומיין שעבד דווח כלא נפתר
 *    מסיבה מוטעית לגמרי.
 * 2. בלי ניסיון חוזר — ENODATA חולף אחד הפך הגדרה נכונה ל"תקלה", וזה בדיוק
 *    סוג ההודעה שגורם למי שקורא להפסיק להאמין לסקריפט.
 */
async function resolveHost(host, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      return await dns.resolve4(host);
    } catch (e4) {
      try {
        return await dns.resolve6(host);
      } catch {
        // ENOTFOUND = אין רשומה כזו בכלל, ואין טעם לנסות שוב.
        if (e4.code === "ENOTFOUND" || i === tries - 1) return null;
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }
  return null;
}

/* ── 2. הדומיין נפתר ── */
for (const host of [domain, `www.${domain}`, `media.${domain}`]) {
  const a = await resolveHost(host);
  if (a) {
    ok(`${host} נפתר`, a.slice(0, 2).join(", "));
    continue;
  }
  // האירוח הוא Vercel, והרשומות נכתבות ב-Cloudflare DNS בענן אפור (DNS only).
  // הערך המדויק לשורש הוא ייחודי לפרויקט ומופיע ב-Vercel → Settings → Domains.
  const label = host.startsWith("media.")
    ? "ממתין ל-R2 → Settings → Public access → Connect a domain"
    : host.startsWith("www.")
      ? "אין רשומת www — לא חובה. אם רוצים: CNAME בענן אפור, ואז להוסיף אותה גם ב-Vercel"
      : "חסרה רשומת CNAME על @ לכתובת ש-Vercel נותן, בענן אפור (DNS only)";
  pending(`${host} לא נפתר`, label);
}

/* ── 3. HTTPS ── */
// ל-.app אין HTTP בכלל (HSTS preload), אז כישלון כאן הוא חסימה מלאה ולא אזהרה.
try {
  const res = await fetch(`https://${domain}`, { redirect: "follow" });
  // 401/403 מדומיין שכבר נפתר זה כמעט תמיד Vercel Deployment Protection ולא
  // באג באפליקציה — כל דף מוחזר חסום, כולל דף חנות שילדה שיתפה.
  const blocked = res.status === 401 || res.status === 403;
  res.ok
    ? ok(`https://${domain} עונה`, `HTTP ${res.status}`)
    : warn(
        `https://${domain} החזיר ${res.status}`,
        blocked
          ? "כנראה Vercel → Settings → Deployment Protection. אם את מריצה מרשת עם proxy, ייתכן שהוא זה שחוסם."
          : "האתר עוד לא פרוס?"
      );

  const hsts = res.headers.get("strict-transport-security");
  hsts ? ok("כותרת HSTS", hsts) : warn("אין כותרת HSTS", "לא קריטי — .app אכוף בדפדפן ממילא");
} catch (e) {
  // ל-.app אין נפילה ל-HTTP, ולכן תעודה לא תקינה היא חסימה מלאה. הענן הכתום
  // של Cloudflare מול Vercel הוא הסיבה הנפוצה: הוא שובר את הנפקת התעודה.
  const hint = /certificate|SSL|TLS/i.test(e.message)
    ? "תעודה לא תקינה — הרשומה צריכה להיות בענן אפור (DNS only), לא כתום."
    : "ממתין לרשומות ה-DNS ולאימות הדומיין ב-Vercel → Settings → Domains";
  pending(`https://${domain} לא עונה`, hint);
}

/* ── 4. הסביבה מסכימה עם המציאות ── */
const siteEnv = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
if (siteEnv && siteEnv !== `https://${domain}`) {
  bad(
    "NEXT_PUBLIC_SITE_URL לא תואם",
    `${siteEnv} ≠ https://${domain} — הכרטיס בוואטסאפ יצביע לדומיין הלא נכון`
  );
} else if (siteEnv) {
  ok("NEXT_PUBLIC_SITE_URL תואם");
}

/* ── 5. סיכום ── */
console.log("");
for (const r of results) {
  console.log(`${r.ok ? "✓" : r.warn ? "!" : "✗"}  ${r.n}${r.d ? " — " + r.d : ""}`);
}
const failed = results.filter((r) => !r.ok && !r.warn);
const waiting = results.filter((r) => r.warn);

if (failed.length) {
  console.log(`\n${failed.length} בעיות שצריך לתקן.`);
} else if (waiting.length) {
  console.log(
    "\nהדומיין מוגדר נכון ✓  מה שמסומן ב-! עוד לא נפרס — זה הצעד הבא, לא תקלה."
  );
} else {
  console.log("\nהכל חי ✓  אפשר להמשיך ל-npm run check");
}
process.exit(failed.length ? 1 : 0);
