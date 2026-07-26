# CLAUDE.md — דוכן

הקובץ הזה הוא ההוראות לסוכן שבונה את הפרויקט. קרא אותו במלואו לפני כתיבת קוד.
מסמכים נלווים: `duchan-spec.md` (מה המוצר), `duchan-plan.md` (עלות ואונבורדינג), `duchan-mockup.html` (התנהגות ויזואלית מדויקת — פתח אותו לפני בניית UI).

---

## 1. מה בונים

פלטפורמה שבה ילדה (9–14) פותחת חנות אונליין קטנה בעצמה, מעלה מוצרים מהטלפון, ומקבלת לינק לשיתוף. קונה בוחרת מוצרים ולוחצת כפתור שפותח וואטסאפ עם ההזמנה מנוסחת מראש. **המערכת לא נוגעת בכסף ולא במשלוח.**

**ארכיטקטורה: דיפלוי אחד, multi-tenant. כל חנות היא שורה בטבלה `stores`. אין דיפלוי per store. לעולם.**

**Non-goals — אל תבנה, גם אם זה נראה מתבקש:**
סליקה · משלוחים · כתובות · קופונים · קטגוריות · חיפוש · צ׳אט פנימי · תגובות · דירוגים · פרופיל ציבורי · דסקטופ · אנגלית · אפליקציה נייטיב

---

## 2. סטאק

```
Next.js 15 (App Router) + TypeScript
Tailwind
Supabase          — Postgres + Auth + RLS
Cloudflare R2     — כל המדיה (S3 API)
Vercel            — אירוח (ראה docs/deploy.md)
```

**R2 ולא Supabase Storage.** ל-Supabase יש 5GB egress חינם — כ-1,000 צפיות בעמוד לחודש לכל החנויות ביחד. ב-R2 ה-egress חינם לחלוטין. זו לא העדפה, זו הדרישה שמחזיקה את מודל העלות.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only. לעולם לא בקוד לקוח
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=duchan-media
NEXT_PUBLIC_R2_PUBLIC_URL=      # https://media.duchan.co
```

---

## 3. סכמה

```sql
create type store_status  as enum ('active','paused','blocked');
create type order_status  as enum ('sent','paid','delivered','cancelled');

create table stores (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users(id) on delete cascade,
  slug          text unique not null,          -- 5 תווים אקראיים. לא שם.
  display_name  text not null,
  emoji         text not null default '🦄',
  tagline       text,
  theme         text not null default 'cloud',
  cover_key     text,
  contact_phone text not null,                 -- E.164 ללא +: 972501234567
  parent_name   text not null,
  parent_phone  text not null,
  parent_email  text not null,
  status        store_status not null default 'active',
  claim_token   text unique,                   -- לחנויות שנוצרו ע"י אדמין
  media_bytes   bigint not null default 0,     -- מכסה
  created_at    timestamptz default now()
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  description text,
  price       int  not null check (price >= 0),   -- שקלים שלמים. אין אגורות.
  image_key   text,
  video_key   text,
  poster_key  text,
  track_stock boolean not null default true,
  stock       int not null default 0 check (stock >= 0),
  sort_order  int not null default 0,
  deleted_at  timestamptz,                        -- soft delete בלבד
  created_at  timestamptz default now()
);

create table orders (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  order_number int  not null,                     -- רץ פר חנות
  items        jsonb not null,                    -- snapshot: [{name,qty,price}]
  total        int  not null,
  buyer_note   text,
  status       order_status not null default 'sent',
  created_at   timestamptz default now(),
  unique (store_id, order_number)
);

create index on products (store_id) where deleted_at is null;
create index on orders   (store_id, created_at desc);
```

**`items` הוא snapshot ולא foreign key.** אם המחיר יעלה מחר, ההזמנה של אתמול חייבת להישאר במחיר שסוכם.

### מספור הזמנות — atomic, לא `count()+1`

```sql
create or replace function next_order_number(p_store uuid)
returns int language plpgsql as $$
declare n int;
begin
  select coalesce(max(order_number),0)+1 into n
    from orders where store_id = p_store for update;
  return n;
end $$;
```

### RLS

```sql
alter table stores   enable row level security;
alter table products enable row level security;
alter table orders   enable row level security;

create policy own_store on stores
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy own_products on products
  for all using (store_id in (select id from stores where owner_id = auth.uid()))
  with check   (store_id in (select id from stores where owner_id = auth.uid()));

create policy own_orders on orders
  for all using (store_id in (select id from stores where owner_id = auth.uid()));
```

**החנות הפומבית נקראת בשרת בלבד, עם service role, ומחזירה שדות מפורשים.** אין policy ציבורי על `stores` — אחרת `contact_phone` ו-`parent_email` דולפים לכל מי שיקרא את ה-API.

---

## 4. מבנה

```
app/
  (owner)/
    onboarding/page.tsx        # בונים לפני שנרשמים
    dashboard/
      page.tsx                 # הזמנות
      products/page.tsx
      settings/page.tsx        # שם · קאבר · ערכה · לינק
  s/[slug]/page.tsx            # חנות פומבית (SSR)
  admin/page.tsx               # role-gated
  api/
    orders/route.ts            # POST — יצירת הזמנה
    upload/route.ts            # POST — presigned R2 URL
lib/
  themes.ts                    # 6 ערכות. מקור אמת יחיד.
  media.ts                     # squareImage · recordVideo · posterFrom
  phone.ts                     # normalizePhone
```

---

## 5. ערכות נושא

`lib/themes.ts` — הערכים המדויקים נמצאים ב-`duchan-mockup.html`, אובייקט `THEMES`. העתק משם.

מפתחות: `cloud · berry · night · pastel · candy · minimal`
לכל ערכה: `bg · surface · ink · primary · onPrimary · radius · font · thumb · border`

מיושם כ-CSS variables על שורש דף החנות. **הדשבורד לא מושפע לעולם** — הוא אפור-לבן קבוע. כל הצבע שייך לחנות.

**אסור למחוק מפתח ערכה לעולם.** רק להוציא משימוש ולמפות לחדשה, אחרת חנויות קיימות נשברות.

---

## 6. מדיה

### תמונה — חובה לעבור בקנבס

```ts
export async function squareImage(file: File, size = 900): Promise<Blob> {
  const bmp  = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c    = new OffscreenCanvas(size, size);
  c.getContext('2d')!.drawImage(
    bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size
  );
  return c.convertToBlob({ type: 'image/webp', quality: 0.82 });
}
```

שלוש בעיות נפתרות כאן, ואף אחת מהן אינה אופציונלית:
- **גודל** — 6MB → ~120KB
- **עקביות** — הריבוע הוא מה שגורם לרשת להיראות כמו חנות
- **EXIF** — **תמונה מהטלפון מכילה קואורדינטות GPS של הבית.** הציור מחדש מוחק את כל המטא-דאטה. אל תדלג על השלב הזה גם אם תוותר על הדחיסה.

### וידאו — מקליטים, לא דוחסים

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'environment', width: 720, height: 720 },
  audio: false,                                    // מכוון. ראה למטה.
});
const rec = new MediaRecorder(stream, {
  mimeType: MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm',
  videoBitsPerSecond: 1_500_000,
});
rec.start();
setTimeout(() => rec.state !== 'inactive' && rec.stop(), 5000);   // עצירה קשיחה
```

תוצאה: ~900KB ל-5 שניות. אין טרנסקודינג, אין `ffmpeg.wasm` (30MB, דקה בטלפון של ילדה).

**`audio: false` הוא החלטת פרטיות, לא אופטימיזציה.** 5 שניות בחדר של ילדה קולטות אחים, הורים ושיחות רקע. סקוויש לא צריך סאונד.

העלאה מהגלריה קיימת כמסלול משני, עם **דחייה מפורשת מעל 10 שניות או 25MB.**

### פוסטר — חובה

הפק פריים מ-`currentTime = 0.1` לתמונת webp. בלעדיו הרשת מציגה ריבועים שחורים עד שהווידאו נטען.

### ניגון ברשת

`muted loop playsinline` + `IntersectionObserver` שמנגן רק את מה שנראה ועוצר את השאר. שישה סרטונים במקביל מקפיאים גלילה בטלפון ישן.

### מפתחות R2

```
{storeId}/products/{uuid}.webp
{storeId}/products/{uuid}.mp4
{storeId}/cover.webp
```

העלאה דרך presigned URL מ-`/api/upload`. השרת מאמת בעלות ומכסה לפני שהוא חותם. עדכן `media_bytes` אחרי כל העלאה.

---

## 7. חוזה ההזמנה

```
POST /api/orders   { slug, items:[{productId, qty}], note? }
```

השרת:
1. טוען את החנות לפי `slug`. אם `status !== 'active'` → 404
2. **מאמת מחירים ומלאי מול ה-DB.** לעולם לא סומכים על הלקוח
3. `next_order_number(store_id)`
4. כותב `orders` עם `status='sent'` ו-snapshot של הפריטים
5. מחזיר `{ orderNumber, phone }`

הלקוח בונה `wa.me/{phone}?text=...` **רק אחרי** שקיבל תשובה.

```
היי {שם}! 👋
ראיתי את החנות ואני רוצה להזמין:

• {מוצר} × {כמות} — ₪{סכום}

סה"כ: ₪{total}
הערה: {note}

הזמנה #{orderNumber}
```

**המספר לא יושב ב-HTML.** לא ב-`href`, לא ב-props, לא בקוד המקור. הוא מוחזר מהשרת בלחיצה. זה לא מונע מאדם נחוש — זה מונע איסוף סיטונאי ע"י crawlers.

**המלאי יורד ב"שולם", לא ביצירת ההזמנה.** הקונה יכולה ללחוץ ולא לשלוח בפועל; ניכוי מוקדם יגרום למלאי לדמם מהזמנות רפאים. לכן הסטטוס הראשוני נקרא `sent` ולא `confirmed`.

---

## 8. אונבורדינג — בונים לפני שנרשמים

הרשמה לפני ערך = נטישה. הסדר הפוך, ומצב הביניים חי ב-`sessionStorage`:

| מסך | פעולה |
|---|---|
| 1 | "מה שם החנות שלך?" — שדה אחד. **בלי אימייל.** |
| 2 | בחירת ערכה — 6 אריחים, תצוגה מקדימה חיה |
| 3 | מוצר ראשון — המצלמה נפתחת ישר |
| 4 | **החנות שלך מוכנה** — תצוגה אמיתית, מסך מלא |
| 5 | שמירה — **מספר טלפון בלבד**, אימות בסמס. אין מייל ואין סיסמה. |
| 6 | הלינק שלך — `העתקה` · `שיתוף בוואטסאפ` · "הוסיפי למסך הבית" |

מסך 4 הוא הציר. עד אליו לא ביקשנו כלום.

**הכניסה היא בסמס בלבד (מיגרציה 0013).** ילדה בת עשר לא ממציאה סיסמה ולא
זוכרת אותה, וזה היה המסך שבו נטשו. המספר שמאומת הוא גם מספר הוואטסאפ שאליו
יגיעו ההזמנות — שדה אחד, לא שלושה. אין בקרה הורית אוטומטית; ההשבתה היחידה
היא ידנית מהחמ"ל.

**חזרה לניהול:** PWA למסך הבית · רצועת בעלים בחנות כשמחוברים · כניסה חוזרת בסמס (אין מה לשחזר — אין סיסמה).

---

## 9. חוקים קשיחים

**בטיחות — לא נתון לשיקול דעת:**
- `slug` אקראי, 5 תווים. לא שם, לא בית ספר
- `noindex, nofollow` בכל דף חנות. אין sitemap
- **אין שדה כתובת בשום מקום.** מסירה מסוכמת בוואטסאפ
- `contact_phone` מאומת בסמס ולא מוצג בחנות ולא בקוד המקור
- כל תמונה עוברת קנבס (EXIF)
- `audio: false` בהקלטה
- 5 הזמנות מ-IP לחנות ליום

**מכסות:**

| מה | תקרה |
|---|---|
| מוצרים לחנות | 20 |
| וידאו למוצר | 1 · 5 שניות · 720×720 |
| מדיה לחנות | 25MB |
| חנויות למספר טלפון | 3 |

**עמידות:**
- לעולם לא `DELETE` — `deleted_at` עם שחזור 30 יום
- טיוטת עריכה ב-`localStorage` לפי מזהה מוצר
- לא לנקות טופס עד שהשרת אישר; תור ניסיון חוזר
- **מיגרציות רק מוסיפות.** עמודה חדשה תמיד nullable. אין שינוי שם, אין מחיקה
- קרון יומי: ייצוא 3 הטבלאות ל-JSON ב-R2. **בתוכנית החינמית של Supabase אין גיבוי אוטומטי**
- קרון יומי: פינג ל-Supabase. פרויקטים חינמיים מושהים אחרי שבוע ללא פעילות

---

## 10. שלבים

בנה לפי הסדר. אל תתחיל שלב לפני שהקודם עומד בקריטריון.

- [ ] **1 · יסודות** — סכמה, RLS, Auth, `/s/[slug]` מציג "החנות סגורה" לסלאג לא קיים
- [ ] **2 · מוצרים** — CRUD + תמונות. *3 מוצרים עולים מהטלפון תוך דקה*
- [ ] **3 · חנות** — רשת, כרטיס מוצר, סל. *הלינק נראה טוב בתצוגה המקדימה של וואטסאפ*
- [ ] **4 · הזמנות** — API + וואטסאפ + מסך הזמנות. *הודעה נפתחת, כרטיס מופיע*
- [ ] **5 · מלאי** — סטפר, "אזל", ניכוי ב"שולם". *מוצר שנגמר צונח לתחתית הרשת*
- [ ] **6 · זהות** — 6 ערכות, קאבר, תצוגה מקדימה חיה. *החלפת ערכה משנה הכל מיידית*
- [ ] **7 · אונבורדינג** — בנייה לפני הרשמה + PWA. *ילדה מגיעה ללינק ב-4 דקות בלי עזרה*
- [ ] **8 · וידאו** — הקלטה, פוסטר, IntersectionObserver. *6 סרטונים ברשת בלי לתקוע גלילה*
- [ ] **9 · אדמין** — רשימה, השבתה, יצירת חנות + `claim_token`

**1–6 זה המוצר. 7 הוא מה שמפיץ אותו. 8 הוא מה שהופך אותו לסקוויש.**

וידאו אחרי אונבורדינג בכוונה: הוא הדבר הכי כיף והכי יקר. גלה אם הן בכלל מוסיפות מוצר שני לפני שתפתח את הברז שאוכל אחסון.

---

## 11. טעויות שיקרו אם לא תשים לב

1. **נרמול טלפון בשליחה במקום בשמירה.** אמא תקליד `050-123-4567`. המר ל-`972501234567` בשמירה, והצג תצוגה מקדימה של הכפתור בהגדרות. זו נקודת הכשל מספר 1 בפלואו הזה.
2. **דילוג על הקנבס** — פי 50 באחסון, ועם ה-GPS של הבית בפנים.
3. **`count()+1` למספור הזמנות** — שתי הזמנות בו-זמנית מקבלות אותו מספר.
4. **חשיפת שורת החנות המלאה ל-API הציבורי** — `contact_phone` ו-`parent_email` דולפים.
5. **`autoplay` על כל הרשת** — גלילה נתקעת בטלפון ישן.
6. **ניכוי מלאי ביצירת הזמנה** — המלאי מדמם מהזמנות רפאים.

---

## 12. הגדרת הצלחה

שלוש חנויות אמיתיות, שבוע. **המדד היחיד שקובע: כמה מהן הוסיפו מוצר שני בלי שביקשו מהן.**

משניים: זמן מנחיתה ועד העתקת הלינק · כמה סיימו אונבורדינג לבד · יחס `sent` → `paid`.
