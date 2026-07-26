# דוכן 🛍️

פלטפורמה שבה ילדה (9–14) פותחת חנות אונליין קטנה בעצמה, מעלה מוצרים מהטלפון, ומקבלת לינק לשיתוף. קונה בוחרת מוצרים ולוחצת כפתור שפותח וואטסאפ עם ההזמנה מנוסחת מראש. **המערכת לא נוגעת בכסף ולא במשלוח.**

**ארכיטקטורה: דיפלוי אחד, multi-tenant.** כל חנות היא שורה בטבלה `stores`. אין דיפלוי per store.

מסמכים: [`CLAUDE.md`](./CLAUDE.md) (הוראות הבנייה) · [`docs/duchan-spec.md`](./docs/duchan-spec.md) · [`docs/duchan-plan.md`](./docs/duchan-plan.md) · [`docs/duchan-mockup.html`](./docs/duchan-mockup.html)

## סטאק

- **Next.js 15** (App Router) + TypeScript + Tailwind 4
- **Supabase** — Postgres + Auth + RLS
- **Cloudflare R2** — כל המדיה (egress חינם — זה מה שמחזיק את מודל העלות)
- **Cloudflare Pages** — אירוח

## הקמה

### 1. Supabase

1. פרויקט חדש ב-[supabase.com](https://supabase.com) (התוכנית החינמית מספיקה).
2. הריצי את `supabase/migrations/0001_init.sql` ב-SQL Editor.
3. **Authentication → Sign In / Up → כבי "Confirm email".** ההרשמה קורית בסוף האונבורדינג, אחרי שהילדה כבר בנתה חנות — מסך אימות באמצע שובר את הפלואו.
4. העתיקי מ-Settings → API את ה-URL, ה-anon key וה-service role key.

### 2. Cloudflare R2

1. צרי bucket בשם `duchan-media` והפעילי עליו Public Access עם דומיין (למשל `media.duchan.co`).
2. צרי API Token עם הרשאת Object Read & Write על ה-bucket.
3. הגדירי CORS על ה-bucket כדי לאפשר `PUT` מהאפליקציה:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["content-type"] }]
```

### 3. משתני סביבה

```bash
cp .env.example .env.local   # ומלאי את הערכים
```

### 4. הרצה

```bash
npm install
npm run dev
```

### 5. קרון יומי (חובה בתוכנית החינמית)

Cloudflare Worker עם Cron Trigger יומי שקורא ל:

```
GET https://<domain>/api/cron
Authorization: Bearer <CRON_SECRET>
```

זה עושה שני דברים: מגבה את 3 הטבלאות ל-JSON ב-R2 (ל-Supabase החינמי אין גיבוי), ושומר על הפרויקט ער (פרויקטים חינמיים מושהים אחרי שבוע בלי פעילות).

## מבנה

```
app/
  page.tsx                   # נחיתה — "מה שם החנות שלך?"
  onboarding/page.tsx        # בונים לפני שנרשמים (sessionStorage)
  login/page.tsx
  dashboard/
    page.tsx                 # הזמנות + רשימת השלמה
    products/page.tsx        # CRUD + מצלמה + הקלטת וידאו
    settings/page.tsx        # שם · קאבר · ערכה · לינק
  s/[slug]/page.tsx          # חנות פומבית (SSR, noindex, cache 60ש׳)
  claim/[token]/page.tsx     # תביעת חנות שנוצרה ע"י אדמין
  admin/page.tsx             # role-gated לפי ADMIN_EMAILS
  api/
    orders/route.ts          # POST — אימות מחירים מול DB, מספור אטומי
    upload/route.ts          # POST — presigned R2 URL + אכיפת מכסות
    stores/route.ts          # POST — יצירת חנות בסוף האונבורדינג
    claim/route.ts           # POST — מימוש claim_token
    admin/stores/route.ts    # GET/POST/PATCH — אדמין
    cron/route.ts            # GET — גיבוי יומי + פינג
lib/
  themes.ts                  # 6 ערכות. מקור אמת יחיד.
  media.ts                   # squareImage · הקלטה · פוסטר
  phone.ts                   # normalizePhone (בשמירה, לא בשליחה!)
supabase/migrations/         # מיגרציות רק מוסיפות
```

## בדיקות DB (רצות על Postgres מקומי, בלי Supabase)

`supabase/tests/` מכיל חבילת בדיקות שאומתה על PostgreSQL 16:

```bash
psql -d duchan -f supabase/tests/00-auth-stub.sql        # סימולציית סכמת auth
psql -d duchan -f supabase/migrations/0001_init.sql      # ... וכל המיגרציות בסדר
psql -d duchan -f supabase/tests/db-tests.sql            # 11 קבוצות בדיקה
node  supabase/tests/concurrency.mjs                     # 15 הזמנות בו-זמניות
```

מכוסה: מספור אטומי פר חנות · ניכוי מלאי ב"שולם" (פעם אחת בלבד) · החזרת מלאי בביטול · בדיקות בעלות ב-security definer · מלאי לא יורד מתחת לאפס · בידוד RLS בין חנויות · אנונימי לא רואה כלום · `place_order` תחת עומס מקבילי.

## פיצ'רי ניהול (מעבר לבסיס)

- **מצב חופשה** — השהיה/פתיחה של החנות מההגדרות (blocked שמור לאדמין)
- **הסתרת מוצר** בלי מחיקה (`is_visible`) · **שכפול מוצר** · **סידור** בחיצים (▲▼)
- **מלאי מהיר** (+/−) ישר מרשימת המוצרים
- **שחזור מוצרים שנמחקו** תוך 30 יום (מימוש ההבטחה של soft delete)
- **ביטול הזמנה עם החזרת מלאי** — `cancel_order` אטומית ב-DB; ביטול הזמנה ששולמה מחזיר את המלאי
- **סינון הזמנות** לפי סטטוס + **"הקופה שלי"** (סה"כ ששולם, מס' הזמנות, הכי נמכר)
- **הערה אישית על הזמנה** ("לארוז בורוד") — נראית רק לבעלת החנות

## חוקים קשיחים שמיושמים בקוד

- `slug` אקראי (5 תווים) · `noindex,nofollow` בכל דף חנות · אין שדה כתובת בשום מקום
- הטלפון של הילדה **לא יושב ב-HTML** — מוחזר מהשרת רק אחרי יצירת הזמנה
- כל תמונה עוברת קנבס → webp ריבועי, ה-EXIF (כולל GPS) נמחק
- הקלטת וידאו: 5 שניות, 720×720, `audio: false` (החלטת פרטיות)
- מלאי יורד ב"שולם" (פונקציית DB אטומית), לא ביצירת הזמנה
- מכסות: 20 מוצרים · 25MB מדיה לחנות · 5 הזמנות מ-IP ליום · 3 חנויות לאימייל
- מחיקת מוצרים היא תמיד soft delete (`deleted_at`)
- החנות הפומבית נקראת בשרת בלבד עם service role ושדות מפורשים — `contact_phone` והאימייל לא דולפים
- ההרשמה היא של הילדה בלבד (אימייל + סיסמה). עמודות `parent_*` קיימות בסכמה אך אופציונליות (מיגרציה 0002) — אפשר להחזיר מעורבות הורה בעתיד בלי שינוי סכמה
