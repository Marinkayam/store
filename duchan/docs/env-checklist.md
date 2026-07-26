# מה למלא ב-Vercel — רשימה לסימון

14 משתנים. 8 מוכנים להעתקה, 6 רק את יכולה למלא.

---

## 1. מוכן — להעתיק כמו שהוא

```
NEXT_PUBLIC_SITE_URL=https://duchan.app
NEXT_PUBLIC_SUPABASE_URL=https://zzyjcznqvbzrczeevzuu.supabase.co
NEXT_PUBLIC_R2_PUBLIC_URL=https://media.duchan.app
R2_ACCOUNT_ID=0d3a2443baf2aa118a39f815fd5b2133
R2_BUCKET=duchan-media
NEXT_PUBLIC_ACTIVATION_PRICE=200
NEXT_PUBLIC_CONTACT_EMAIL=hello@duchan.app
CRON_SECRET=pVLCqKYb-0T4xA0DhZeyNsoSYSB1DwDBsqyMvcE5K5o
```

---

## 2. את ממלאה — 6

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Supabase → פרויקט `duchan` → ⚙️ `Settings` → `API Keys` → לשונית **`Legacy`** → `anon` `public`

מתחיל ב-`eyJhbGciOiJIUzI1NiI...`, ארוך מאוד.

> **אם את רואה `sb_publishable_...`** — זה הפורמט החדש, את בלשונית הלא נכונה.
> הקוד נבנה ונבדק מול הפורמט הישן. חפשי `Legacy API keys`.

☐ הועתק

### `SUPABASE_SERVICE_ROLE_KEY`

אותו מסך בדיוק → `service_role` `secret`

גם מתחיל ב-`eyJhbGci...`, אבל **שונה** מה-anon.

> 🔴 **המפתח הכי רגיש בפרויקט.** הוא עוקף את כל ה-RLS ורואה כל חנות וכל הזמנה.
> אסור שיופיע בקוד, בצילום מסך, או בשם משתנה שמתחיל ב-`NEXT_PUBLIC_`.
> **ודאי ששני המפתחות שונים זה מזה** — הדבקה של אותו מפתח בשניהם מדליפה אותו לדפדפן.

☐ הועתק · ☐ שונה מה-anon

### `R2_ACCESS_KEY_ID`

מהטוקן שיצרת ב-R2. מחרוזת של ~32 תווים.

אם סגרת את החלון — צריך טוקן חדש: `R2` → `Manage API Tokens` → `Create Account API Token` → `Object Read & Write` → `duchan-media` בלבד.

☐ הועתק

### `R2_SECRET_ACCESS_KEY`

מאותו מסך. ~64 תווים. **מוצג פעם אחת בלבד.**

☐ הועתק

### `ADMIN_EMAILS`

המייל שאיתו תיכנסי ל-`duchan.app/admin`.

חייב להיות **אותו מייל** שאיתו תירשמי לאפליקציה עצמה — הבדיקה היא על המייל של המשתמש המחובר.

לכמה מנהלות: `a@x.com,b@y.com` (פסיק, בלי רווח).

☐ מולא

### `NEXT_PUBLIC_OWNER_WHATSAPP`

הטלפון שלך, בפורמט בינלאומי בלי `+` ובלי אפס מוביל:

| את מקלידה | נכון? |
|---|---|
| `972501234567` | ✅ |
| `0501234567` | ❌ אפס מוביל |
| `+972501234567` | ❌ פלוס |
| `972-50-123-4567` | ❌ מקפים |

לכאן ילדות ישלחו הודעה מ-`/activate` כשירצו לשלם או לשאול.

☐ מולא

---

## 3. אופציונלי — מפתח Claude

**לא צריך אותו כדי לעלות לאוויר.** אפשר להוסיף מתי שרוצים, גם בעוד חודש.

### מה זה נותן

הילדה מצלמת מוצר ולוחצת "✨ כתבי לי תיאור" — Claude רואה את התמונה וכותב
תיאור קצר בעברית שהיא עורכת. זה **פיצ'ר פרימיום**: מודלק פר חנות מהחמ"ל,
עם מכסת קרדיטים (ברירת מחדל 50), כדי שאפשר יהיה למכור אותו כשדרוג.

### מה קורה בלעדיו

הכל עובד רגיל. `ai_enabled` הוא `false` בברירת מחדל בכל חנות, וכפתור ההדלקה
בחמ"ל **מושבת** עם הודעה שמסבירה למה. אין דרך להדליק בטעות פיצ'ר שיישבר
לילדה.

### כמה זה עולה

לתיאור אחד (תמונה 900×900 ≈ 1,100 טוקנים + פרומפט, פלט ~60):

| מודל | לתיאור | 1,000 תיאורים |
|---|---|---|
| Haiku 4.5 | ~0.6 אגורות | ~₪6 |
| Opus 5 | ~3 אגורות | ~₪30 |

זניח. 50 קרדיטים לחנות = פחות מ-₪1.50 גם במודל היקר.

### אם כן רוצים

`console.anthropic.com` → `API Keys` → `Create Key` → להוסיף ב-Vercel:

```
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-haiku-4-5
```

`AI_MODEL` אופציונלי — בלעדיו ברירת המחדל היא `claude-opus-5`. להערות מוצר
קצרות `claude-haiku-4-5` מספיק בהחלט וזול פי 5.

☐ מדלגים בינתיים — **מומלץ**
☐ מוסיפים עכשיו

---

## 4. לפני Deploy

```
☐  Vercel Team = החשבון האישי (Hobby), לא מונטו
☐  Project Name = duchan
☐  Root Directory = duchan
☐  Application Preset = Next.js   ← אם כתוב Other, ה-Root Directory שגוי
☐  Build / Output / Install = ריקים (ברירת מחדל)
☐  Environments = Production and Preview
☐  14 שורות במשתנים — לספור!
☐  anon ≠ service_role
☐  אין רווחים סביב ה-=, אין מרכאות
```

---

## 5. אחרי Deploy — לבדוק על הכתובת הזמנית

**לא לחבר את `duchan.app` עדיין.** Vercel תיתן `duchan-xxx.vercel.app`.

```
☐  הדף הראשי נטען
☐  /price נטען
☐  אונבורדינג מלא: שם → ערכה → צילום מוצר → שמירה
    (הצילום הוא הבדיקה האמיתית של R2)
☐  /dashboard — החנות מופיעה כטיוטה
☐  /activate — מציג ₪200 ואת ההסבר להורה
☐  /admin — נכנס עם המייל מ-ADMIN_EMAILS
☐  אישור החנות בחמ"ל → הלינק נפתח
☐  פתיחת לינק החנות ושליחת הזמנה → וואטסאפ נפתח עם ההודעה
```

רק כשכל השורות מסומנות — מחברים את הדומיין.

---

## 6. אם משהו נשבר

**הבנייה נכשלה** → `Deployments` → הדיפלוי האדום → `Build Logs`. השגיאה בשורות
האחרונות. הכי נפוץ: `Root Directory` לא `duchan`.

**האתר עולה אבל ריק / שגיאה** → `Deployments` → `Runtime Logs`. בדרך כלל משתנה
סביבה חסר או עם טעות הקלדה.

**התמונות לא עולות** → CORS ב-R2, או `R2_*` שגוי. אפשר לבדוק ב-Console של
הדפדפן (F12) — שגיאת CORS נראית במפורש.

**"permission denied for table stores"** → `SUPABASE_SERVICE_ROLE_KEY` שגוי או חסר.

בכל מקרה: הדיפלוי הקודם נשאר חי. `Deployments` → `...` → `Instant Rollback`.
