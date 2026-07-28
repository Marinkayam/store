# משפך סקוויש קלאב — מפרט דשבורד אחד

ספק: **Vercel Web Analytics**. נבחר כי האתר כבר מתארח בוורסל — אין ספק
נוסף, אין סקריפט מדומיין זר, ואין עוגייה. המחיר: אין מזהה משתמש קבוע,
ולכן המשפך נמדד ברמת אירועים ולא ברמת משתמשת יחידה. זו החלטה מודעת:
במוצר לילדות, לא לזהות אישית שווה יותר מדיוק המדידה.

האירועים כבר קיימים בקוד כקריאות `track()` מוקלדות
(`lib/squish-analytics.ts`).

---

## המשפך

| # | שלב | אירוע | איפה נשלח |
|---|---|---|---|
| 1 | האוסף נוצר | `squish_collection_created` | סיום `/squish/new` |
| 2 | האוסף פעיל (3 פריטים, אחד פתוח) | `squish_collection_activated` | `/squish/collection` |
| 3 | נוצר קישור הזמנה | `squish_invite_created` | `/squish/me` |
| 4 | חברה הצטרפה | `squish_friend_joined` | `/squish/join/[code]` |
| 5 | נכנסה ללגלות | `squish_discover_viewed` | `/squish/discover` |
| 6 | התחילה לבנות הצעה | `squish_trade_started` | `/squish/trades/new` |
| 7 | שלחה הצעה | `squish_trade_sent` | `/squish/trades/new` |
| 8 | ההצעה אושרה משני הצדדים | `squish_trade_approved` | `/squish/trades` |
| 9 | הפריטים ננעלו | `squish_trade_reserved` | `/squish/trades` |
| 10 | נפתח וואטסאפ | `squish_whatsapp_opened` | `/squish/trades` |
| 11 | הטרייד הושלם | `squish_trade_completed` | `/squish/trades` |

### יציאות (לא כישלון — מידע)

`squish_trade_cancelled` (עם `reason`) · `squish_trade_reported` ·
`squish_item_reported` · `squish_user_blocked` · `squish_connection_removed` ·
`squish_profile_deleted` · `squish_feedback_given` (עם `moment` ו-`choice`)

---

## המדד היחיד שקובע בשלב הזה

> מתוך המשתמשות שיש להן **חברה אחת לפחות ופריט אחד פתוח לטרייד** —
> כמה שלחו או קיבלו הצעה **בתוך שבעה ימים**?

זה לא נמדד מהאנליטיקס אלא **מהדאטהבייס**, כי הוא דורש חיתוך לפי משתמשת
ולפי זמן — ואת זה בכוונה אין לנו בוורסל. השאילתה:

```sql
with eligible as (
  select p.user_id, p.created_at
    from squish_profiles p
   where exists (select 1 from squish_connections c
                  where c.user_id = p.user_id and c.status = 'active')
     and exists (select 1 from squish_items i
                  where i.owner_user_id = p.user_id
                    and i.deleted_at is null and i.trade_status = 'open_for_trade')
)
select
  count(*)                                             as eligible,
  count(*) filter (where acted)                        as acted,
  round(100.0 * count(*) filter (where acted) / nullif(count(*), 0)) as pct
from (
  select e.user_id,
         exists (select 1 from squish_trade_proposals t
                  where (t.sender_user_id = e.user_id or t.receiver_user_id = e.user_id)
                    and t.created_at < e.created_at + interval '7 days') as acted
    from eligible e
) x;
```

---

## פרטיות — מה אף פעם לא נשלח

`lib/squish-analytics.ts` מסנן ברשימה לבנה, ולא בהסתמכות על מי שקורא:

- **לא** מספרי טלפון
- **לא** טקסט שילדה כתבה — שם סקווישי, תיאור, הערה, כינוי
- **לא** כתובות מדיה
- **לא** מזהים מלאים — כל UUID נחתך לשמונה תווים ראשונים
- **לא** עיר

כל מפתח שאינו ב-`ALLOWED` נזרק, וכל מחרוזת מעל 24 תווים נזרקת גם היא.
טקסט חופשי ממשוב הפיילוט נשמר בדאטהבייס בלבד ולא עובר לאנליטיקס לעולם.

---

## מה שהדשבורד הזה **לא**

אין דירוג בין ילדות, אין השוואה, ואין מדד "פעילות יומית". הכל נמדד
ברמת המוצר, לא ברמת הילדה.
