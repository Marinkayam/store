-- 0034 — סתימת חור ב-squish_can_trade שנמצא בכתיבת מטריצת ההרשאות.
--
-- הגרסה ב-0033 בדקה את היחס (ישירה או מורחבת) ואת מצב הפריט, אבל לא
-- את הגדרת הצפייה של הבעלים. התוצאה: אספנית שהעבירה את האוסף שלה
-- ל"רק אני" — ולכן אף אחת לא יכולה אפילו לפתוח את הגלריה — עדיין
-- הייתה מאשרת הצעת טרייד על פריט שנשאר מסומן "פתוח לטרייד".
--
-- זה לא היה באג חי: שום דבר בקוד לא קורא לפונקציה עדיין, והדגל כבוי.
-- זו בדיוק הסיבה שמטריצת ההרשאות נכתבה לפני החיבור לקוד.
--
-- התיקון הוא גם הפשטה: "מותר לה להציע" הוא **"מותר לה לראות את
-- הפריט" ועוד שהפריט זמין**. שתי בדיקות נפרדות של אותו תנאי הן שתי
-- הזדמנויות להתפצל, וכאן הן כבר התפצלו.

create or replace function squish_can_trade(p_viewer uuid, p_owner uuid, p_item uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select i.owner_user_id = p_owner
       and p_viewer is distinct from p_owner
       /* הרשאת הצפייה על הפריט היא התנאי, ולא עותק שלה: היא כבר
          מכילה חסימה, השהיה, הגדרת צפייה, מחיקה רכה, ואת הצמצום של
          המעגל המורחב לפתוח-לטרייד בלבד. */
       and squish_can_view_item(p_viewer, p_item)
       /* ומעליה: הפריט חייב להיות פנוי *ברגע הזה*. גלוי זה לא זמין —
          פריט ששמור בטרייד אחר או שעבר לדוכן עדיין נראה לחברה ישירה. */
       and i.trade_status = 'open_for_trade'
       and i.duchan_product_id is null
      from squish_items i
     where i.id = p_item
  ), false);
$$;

do $$ begin
  grant execute on function squish_can_trade(uuid, uuid, uuid) to anon, authenticated, service_role;
exception when undefined_object then null; end $$;
