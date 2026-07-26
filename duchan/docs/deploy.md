# עלייה לאוויר

> החליפי `<הדומיין שלך>` בדומיין שבחרת בכל המסמך.

מסמך אחד, לפי הסדר. כל שלב נגמר בבדיקה שאפשר להריץ.

---

## 0. מה קונים

| מה | איפה | מחיר |
|---|---|---|
| הדומיין `<הדומיין שלך>` | רשם ישראלי (mynames, אתר קל, דומיין דה) | ~₪55–74 לשנה, **אותו מחיר בחידוש** |
| Supabase | supabase.com | חינם מספיק להתחלה |
| Cloudflare (R2 + Pages + DNS) | cloudflare.com | חינם עד ~10GB אחסון |

`.co.il` נבחר כי המחיר שטוח — אין את הקפיצה של `.store`/`.online`, שנרשמים
בדולר ומתחדשים ב-$35–70. גם ההורה שמקבל את הלינק רואה סיומת ישראלית מוכרת.

**את הדומיין קונים ברשם, אבל את ה-DNS מנהלים ב-Cloudflare.** אחרי הקנייה
מוסיפים את הדומיין ל-Cloudflare, והוא נותן שני nameservers שצריך להזין
בממשק של הרשם. משם הכל מנוהל במקום אחד.

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
2. Settings → Public access → Connect a domain → `media.<הדומיין שלך>`.
   (רשומת ה-DNS נוצרת אוטומטית אם הדומיין כבר ב-Cloudflare.)
3. Settings → CORS:

```json
[{ "AllowedOrigins": ["https://<הדומיין שלך>"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"] }]
```

> ב-`.env.example` ה-CORS לפיתוח הוא `"*"`. **בפרודקשן שימי את הדומיין המפורש** —
> אחרת כל אתר יכול לבקש העלאות מה-bucket שלך.

4. R2 → Manage API Tokens → token עם `Object Read & Write` על ה-bucket הזה בלבד.

---

## 3. משתני סביבה

```bash
NEXT_PUBLIC_SITE_URL=https://<הדומיין שלך>
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>     # server only!
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<token id>
R2_SECRET_ACCESS_KEY=<token secret>
R2_BUCKET=duchan-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://media.<הדומיין שלך>
ADMIN_EMAILS=<המייל שלך>
CRON_SECRET=<מחרוזת אקראית ארוכה>
NEXT_PUBLIC_ACTIVATION_PRICE=200
NEXT_PUBLIC_OWNER_WHATSAPP=9725XXXXXXXX       # בלי +, בלי אפס מוביל
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

## 6. Cloudflare Pages

1. Workers & Pages → Create → Pages → חיבור ל-GitHub.
2. Build command `npm run build` · Output `.next` · Root directory `duchan`.
3. Framework preset: **Next.js**.
4. Settings → Environment variables: כל מה שבסעיף 3, ל-Production.
5. Custom domains → `<הדומיין שלך>` + `www.<הדומיין שלך>`.

### רשומות ה-DNS

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `@` | `<project>.pages.dev` | 🟠 מופעל |
| CNAME | `www` | `<project>.pages.dev` | 🟠 מופעל |
| CNAME | `media` | (נוצר לבד ע"י R2) | 🟠 מופעל |

Cloudflare מנפיק תעודת TLS לבד. הפצת DNS לוקחת דקות עד שעה.

---

## 7. קרון יומי — חובה בתוכנית החינמית

Workers & Pages → Create → Worker, עם Cron Trigger `0 3 * * *`:

```js
export default {
  async scheduled(_e, env) {
    await fetch("https://<הדומיין שלך>/api/cron", {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
  },
};
```

עושה שני דברים: מגבה את הטבלאות ל-JSON ב-R2 (**לתוכנית החינמית של Supabase אין
גיבוי אוטומטי**), ומחזיק את הפרויקט ער — פרויקט חינמי מושהה אחרי שבוע בלי פעילות.

---

## 8. בדיקות אחרי עלייה

```bash
curl -sI https://<הדומיין שלך> | head -1                    # 200
curl -s https://<הדומיין שלך>/s/<slug> | grep -c noindex    # 1
curl -sI https://media.<הדומיין שלך>/<key> | head -1        # 200
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
   בדיקה: `curl -s https://<הדומיין שלך>/s/<slug> | grep 'og:image'`
2. `media.<הדומיין שלך>` לא פומבי → וואטסאפ מקבל 403 על התמונה.
   בדיקה: לפתוח את כתובת ה-`og:image` בגלישה פרטית.
3. וואטסאפ מקאשש כרטיס ישן לכמה שעות. לינק חדש = סלאג חדש = כרטיס חדש.
