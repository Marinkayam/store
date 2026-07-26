# עלייה לאוויר — duchan.app

מסמך אחד, לפי הסדר. כל שלב נגמר בבדיקה שאפשר להריץ.

---

## 0. מה קונים

| מה | איפה | מחיר |
|---|---|---|
| הדומיין `duchan.app` | GoDaddy | בדקי את **עמודת החידוש**, לא רק שנה ראשונה |
| Supabase | supabase.com | חינם מספיק להתחלה |
| Cloudflare (R2 + DNS) | cloudflare.com | חינם עד ~10GB אחסון |
| Vercel (אירוח) | vercel.com | Hobby חינם |

### `.app` — HTTPS הוא חובה, לא המלצה

`.app` היא סיומת של Google Registry שנמצאת ברשימת **HSTS preload** הצרובה בתוך
כל דפדפן. המשמעות המעשית:

- אין גישה ב-HTTP. בכלל. הדפדפן לא ינסה ואז ייפול ל-HTTPS — הוא פשוט יסרב.
- תעודה לא תקינה או חסרה = מסך חסימה אדום, לא אזהרה שאפשר לדלג עליה.
- **זה בדיוק מה שרוצים** למוצר שילדות שולחות בוואטסאפ: אין מצב שהלינק ייפתח
  לא מוצפן. התעודה מונפקת אוטומטית — ראי את הערת ה-DNS בסעיף 6.

### בקנייה ב-GoDaddy

מה שכן:

- הדומיין עצמו. ~₪49 שנה ראשונה, **~₪85 בחידוש** — זה המספר לתכנן לפיו.
  מחיר יציב, בלי קפיצה של פי 20 כמו ב-`.online`.

מה שלא:

- **Full Domain Protection** (₪33 שנה ראשונה, **₪49 לשנה לתמיד**) — מה שהיא נותנת
  זה 2FA על פעולות קריטיות ונעילת העברה. את שתיהן מקבלים בחינם: 2FA על חשבון
  GoDaddy עצמו, ו-Registrar Lock שדלוק כברירת מחדל. תוסף לבעיה שכבר פתורה.
  אם היא כבר נקנתה: My Products → Full Domain Protection → Cancel (בתוך חלון
  ההחזר), ולכל הפחות לכבות Auto-renew כדי שלא תתחדש ב-₪49. במקומה להדליק 2FA
  בחשבון: Account Settings → Login & PIN → 2-Step Verification.
- **Microsoft 365 Email** (₪29/חודש בחידוש) — לא צריך. ראי למטה.
- Website Builder / אירוח — האתר יושב על Vercel. GoDaddy הוא רק הרשם.
- WHOIS privacy — ב-`.app` פרטי הרישום ממילא מוסתרים לפי GDPR.

### אימייל על הדומיין — חינם, דרך Cloudflare

צריך תיבה אמיתית: `hello@duchan.app` מופיע בתנאי השימוש ובמדיניות הפרטיות,
וזו הכתובת שאליה הורה יפנה בבקשת מחיקת נתונים. אבל לא צריך לשלם עליה.

Cloudflare → Email → **Email Routing** → כתובת חדשה `hello@duchan.app` שמעבירה
לג'ימייל שלך. חינם, בלי הגבלה, ורשומות ה-DNS נוצרות אוטומטית.

כדי גם *לשלוח* מהכתובת הזו: ג'ימייל → Settings → Accounts → "Send mail as",
עם שרת ה-SMTP של ג'ימייל. יוצא שההודעה נשלחת מ-`hello@duchan.app` בלי לשלם לאף אחד.

**את הדומיין קונים ב-GoDaddy, אבל את ה-DNS מנהלים ב-Cloudflare.** אחרי הקנייה:
מוסיפים את `duchan.app` ל-Cloudflare (Add a site), הוא נותן שני nameservers,
ואותם מזינים ב-GoDaddy תחת **My Products → DNS → Nameservers → Change → I'll use
my own**. ההחלפה תופסת תוך דקות עד 24 שעות. משם הכל מנוהל במקום אחד.

---

## 1. Supabase

1. פרויקט חדש. אזור: `eu-central-1` (הכי קרוב לישראל מבין החינמיים).
2. **Authentication → Sign In / Up → כבי "Confirm email".** האונבורדינג נגמר
   בהרשמה אחרי שהחנות כבר בנויה; מסך אימות באמצע שובר את הפלואו.
3. Settings → API: העתיקי `URL`, `anon key`, `service_role key`.
4. Settings → Database → Connection string (URI): העתיקי לצורך המיגרציות.

---

## 2. Cloudflare R2

1. bucket בשם `duchan-media`.
2. Settings → Public access → Connect a domain → `media.duchan.app`.
   (רשומת ה-DNS נוצרת אוטומטית אם הדומיין כבר ב-Cloudflare.)
3. Settings → CORS:

```json
[{ "AllowedOrigins": ["https://duchan.app"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"] }]
```

> ב-`.env.example` ה-CORS לפיתוח הוא `"*"`. **בפרודקשן שימי את הדומיין המפורש** —
> אחרת כל אתר יכול לבקש העלאות מה-bucket שלך.

4. R2 → Manage API Tokens → token עם `Object Read & Write` על ה-bucket הזה בלבד.

---

## 3. משתני סביבה

```bash
NEXT_PUBLIC_SITE_URL=https://duchan.app
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>     # server only!
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<token id>
R2_SECRET_ACCESS_KEY=<token secret>
R2_BUCKET=duchan-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://media.duchan.app
ADMIN_EMAILS=<המייל שלך>
CRON_SECRET=<מחרוזת אקראית ארוכה>
NEXT_PUBLIC_ACTIVATION_PRICE=200
NEXT_PUBLIC_OWNER_WHATSAPP=9725XXXXXXXX       # בלי +, בלי אפס מוביל
NEXT_PUBLIC_CONTACT_EMAIL=hello@duchan.app
```

**כל מה שמתחיל ב-`NEXT_PUBLIC_` נצרב לקוד שרץ בדפדפן.** לכן `SUPABASE_SERVICE_ROLE_KEY`
ו-`R2_SECRET_ACCESS_KEY` לא נושאים את הקידומת, ואסור להוסיף להם אותה.

---

## 4. מיגרציות

```bash
npm run migrate "postgresql://postgres:<סיסמה>@db.<ref>.supabase.co:5432/postgres"
```

מריץ את `supabase/migrations/*.sql` לפי הסדר ורושם ב-`schema_migrations`.
בטוח להרצה חוזרת. אם כבר הרצת חלק ידנית: `-- --baseline=<המספר האחרון שהרצת>`.

---

## 5. בדיקה לפני דיפלוי

```bash
npm run check
```

בודק את משתני הסביבה, שכל עמודה ופונקציה קיימות, **ש-RLS חוסם אנונימי**,
שה-service key לא הודבק במקום ה-anon key, וכותב+קורא+מוחק קובץ אמיתי ב-R2.
לא ממשיכים הלאה עד שזה ירוק.

---

## 6. אירוח — Vercel

### למה לא Cloudflare Pages

Pages מריצה Next.js ב-edge runtime, ושתי נקודות קצה כאן מייבאות את `crypto` של
Node: `app/api/orders/route.ts` (hash של IP למגבלת ההזמנות) ו-`app/api/upload/route.ts`
(שמות קבצים). גם `@aws-sdk/client-s3` מכוון ל-Node. כדי לרוץ שם צריך להמיר ל-Web
Crypto ולעבור למתאם OpenNext עם binding ל-KV בשביל ה-ISR — עבודה אמיתית, בלי
תמורה למוצר.

ב-Vercel הקוד רץ כמו שהוא: Node runtime, ISR ו-`revalidatePath` מהקופסה.
**R2 נשאר ב-Cloudflare** — ה-egress החינמי שם הוא מה שמחזיק את מודל העלות,
וזה לא משתנה. Cloudflare ממשיך לנהל DNS ואת `media.duchan.app`.

### ההגדרה

1. `vercel.com` → Sign up with **GitHub**.
2. `Add New` → `Project` → לייבא את הריפו.
3. **`Root Directory` → `duchan`.** בשורש הריפו יושב פרויקט אחר ואין שם
   `package.json` — בלי זה הבנייה נכשלת מיד.
4. Framework Preset: **Next.js** (מזוהה לבד). Build/Output/Install — ברירת מחדל.
5. `Environment Variables` — כל מה שבסעיף 3.
6. `Deploy`.

**ענף ברירת המחדל בריפו אינו `main`.** לוודא ב-`Settings` → `Git` →
`Production Branch` שהוא מצביע לענף עם הקוד, אחרת Vercel בונה פרויקט אחר.

### רשומות ה-DNS (ב-Cloudflare)

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | `76.76.21.21` | ⬜ **DNS only** |
| CNAME | `www` | `cname.vercel-dns.com` | ⬜ **DNS only** |
| CNAME | `media` | (נוצר לבד ע"י R2) | 🟠 מופעל |

**הענן חייב להיות אפור (DNS only) על השתיים הראשונות.** עם פרוקסי כתום, Vercel
לא מצליחה להנפיק תעודה, וב-`.app` — שאין בו fallback ל-HTTP — התוצאה היא דף
שלא נטען בלי שום רמז לסיבה. את הערכים המדויקים Vercel נותנת במסך הוספת הדומיין;
אם הם שונים ממה שכאן, ללכת לפי מה שהיא אומרת.

`media` נשאר מפורקס — הוא מוגש מ-R2, לא מ-Vercel.

### בדיקה שההגדרה תפסה

```bash
npm run check:dns duchan.app
```

בודק ש-nameservers מצביעים ל-Cloudflare, שהדומיין ו-`www` ו-`media` נפתרים,
שה-HTTPS עונה עם תעודה תקינה, ושה-`NEXT_PUBLIC_SITE_URL` תואם למציאות.
כל כשל מודפס עם המסך המדויק שבו מתקנים אותו.

---

## 7. קרון יומי — גיבוי

`duchan/vercel.json` (בריפו) מגדיר Cron יומי ב-03:00 שקורא ל-`/api/cron`.
**Vercel שולחת `Authorization: Bearer $CRON_SECRET` לבד** כשקיים משתנה סביבה בשם
`CRON_SECRET` — בדיוק מה שנקודת הקצה מצפה לו. אין מה להגדיר מעבר לזה.

לחלופין, Cloudflare Worker עם Cron Trigger `0 3 * * *`:

```js
export default {
  async scheduled(_e, env) {
    await fetch("https://duchan.app/api/cron", {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
  },
};
```

מייצא את הטבלאות ל-JSON ב-R2 — עותק שלא תלוי ב-Supabase בכלל.

**בתוכנית בתשלום של Supabase יש כבר גיבוי יומי אוטומטי, והפרויקט לא נרדם.**
הקרון הזה הוא שכבה שנייה, לא הכרח. בתוכנית החינמית הוא חובה משתי הסיבות.

---

## 8. בדיקות אחרי עלייה

```bash
curl -sI https://duchan.app | head -1                    # 200
curl -s https://duchan.app/s/<slug> | grep -c noindex    # 1
curl -sI https://media.duchan.app/<key> | head -1        # 200
```

ואז ידנית, מהטלפון:

- [ ] לפתוח חנות מקצה לקצה — שם, ערכה, צילום מוצר, שמירה
- [ ] **לשלוח את הלינק לעצמך בוואטסאפ** ולוודא שהכרטיס מציג תמונה וכותרת
- [ ] להזמין מחשבון אחר ולוודא שההודעה נפתחת עם המספר הנכון
- [ ] `/activate` → "שילמנו" → לאשר בחמ"ל → הלינק נפתח
- [ ] "הוסף למסך הבית" עובד ונפתח על `/dashboard`

### אם התצוגה המקדימה בוואטסאפ יוצאת בלי תמונה

וואטסאפ מקבל את הכרטיס משרתי מטא, לא מהטלפון. שלוש סיבות אפשריות, לפי סדר:

1. `NEXT_PUBLIC_SITE_URL` לא מוגדר בפרודקשן → `og:url` יוצא יחסי.
   בדיקה: `curl -s https://duchan.app/s/<slug> | grep 'og:image'`
2. `media.duchan.app` לא פומבי → וואטסאפ מקבל 403 על התמונה.
   בדיקה: לפתוח את כתובת ה-`og:image` בגלישה פרטית.
3. וואטסאפ מקאשש כרטיס ישן לכמה שעות. לינק חדש = סלאג חדש = כרטיס חדש.
