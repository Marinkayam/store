-- 0033 — שלב ב', צעד ראשון: שפת ההרשאות של המעגל המורחב.
--
-- **המיגרציה הזו לא משנה שום התנהגות.** היא מוסיפה ארבע פונקציות ולא
-- נוגעת ב-squish_can_view, ב-RLS, ובאף פונקציה קיימת. שום דבר בקוד לא
-- קורא להן עדיין; הן נכנסות ראשונות כדי שאפשר יהיה לבדוק אותן מול
-- מטריצת הרשאות מלאה לפני שמישהי רואה משהו חדש.
--
-- למה ארבע ולא אחת: היום `squish_can_view` עונה על שתי שאלות שונות
-- באותה תשובה — "מותר לה להיכנס לגלריה?" ו"מותר לה לראות את הפריט
-- הזה?". כל עוד לכל מי שנכנסה מותר לראות הכל, זה עבד. ברגע שיש מעגל
-- מורחב שרואה *רק* מה שפתוח לטרייד, שתי השאלות נפרדות — ותשובה אחת
-- לשתיהן חייבת לטעות באחת מהן.
--
--   squish_relation             מה הקשר, במילה אחת
--   squish_can_view_collection  מותר לה להיכנס לגלריה בכלל
--   squish_can_view_item        מותר לה לראות את הפריט הזה
--   squish_can_trade            מותר לה להציע טרייד על הפריט הזה
--
-- **אין שורות "חברה של חברה" בדאטהבייס.** הקשר העקיף מחושב בכל שאילתה
-- משתי שורות ישירות. שורה שמורה הייתה צריכה תחזוקה בכל הסרה, חסימה
-- ומחיקת חשבון — וכל מקום שהיינו שוכחים לעדכן היה הופך לדליפה שקטה.

/* ══════════════ 1. מה הקשר ══════════════ */

/**
 * מחזירה בדיוק אחת מאלה:
 *
 *   self       היא עצמה
 *   blocked    אחת מהן חסמה את השנייה
 *   suspended  אחת מהן מושהית
 *   direct     חברה ישירה, קשר פעיל
 *   extended   חברה של חברה, שתי קפיצות, בלי שורה שמורה
 *   none       אין קשר
 *
 * **הסדר הוא ההגנה.** חסימה והשהיה נבדקות לפני הקשר, ולא אחריו: אחרת
 * מספיק היה להיות "חברה של חברה" כדי לעקוף חסימה. וגם 'self' בא
 * *אחרי* השהיה, בדיוק כמו ב-squish_can_view של היום — חשבון מושהה לא
 * רואה את האוסף שלו, וזו לא התנהגות שאנחנו משנים כאן בשקט.
 */
create or replace function squish_relation(p_viewer uuid, p_owner uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_owner is null or p_viewer is null then 'none'
    when p_viewer <> p_owner and squish_is_blocked(p_viewer, p_owner) then 'blocked'
    when exists (select 1 from squish_profiles s
                  where s.user_id in (p_viewer, p_owner) and s.suspended_at is not null)
         then 'suspended'
    when p_viewer = p_owner then 'self'
    when exists (
      select 1 from squish_connections c
       where c.user_id = p_viewer and c.connected_user_id = p_owner
         and c.status = 'active' and c.connection_type = 'direct_friend'
    ) then 'direct'
    when exists (
      /* שתי קפיצות: ממני לחברה, ומהחברה לבעלים. מחושב, לא שמור. */
      select 1
        from squish_connections a
        join squish_connections b on b.user_id = a.connected_user_id
       where a.user_id = p_viewer and a.status = 'active'
         and b.connected_user_id = p_owner and b.status = 'active'
         and b.connected_user_id <> a.user_id
    ) then 'extended'
    else 'none'
  end;
$$;

comment on function squish_relation(uuid, uuid) is
  'self · blocked · suspended · direct · extended · none. חסימה והשהיה תמיד גוברות.';

/* ══════════════ 2. מותר לה להיכנס לגלריה ══════════════ */

/**
 * שאלה אחת בלבד: מותר לה לפתוח את הגלריה של הבעלים. *מה* היא תראה שם
 * זו שאלה של squish_can_view_item, ולכן חברה מהמעגל המורחב מקבלת כאן
 * true גם כשהיא תראה בפועל רק את מה שפתוח לטרייד — היא באמת נכנסת,
 * היא פשוט רואה פחות.
 */
create or replace function squish_can_view_collection(p_viewer uuid, p_owner uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case squish_relation(p_viewer, p_owner)
    when 'self' then true
    when 'direct' then exists (
      select 1 from squish_profiles p
       where p.user_id = p_owner
         and p.collection_visibility in ('direct_friends', 'extended_circle')
    )
    when 'extended' then exists (
      select 1 from squish_profiles p
       where p.user_id = p_owner and p.collection_visibility = 'extended_circle'
    )
    else false
  end;
$$;

/* ══════════════ 3. מותר לה לראות את הפריט הזה ══════════════ */

/**
 * כאן יושב כל ההבדל של שלב ב': **המעגל המורחב רואה רק מה שפתוח
 * לטרייד.** לא פריט פרטי, לא "אולי לטרייד", ולא מה שכבר הוחלף.
 *
 * הבדיקה נעשית על הפריט עצמו ולא על רשימה שסוננה במקום אחר, כי זו
 * הנקודה שבה אפשר לטעות בשקט: מסך שמסנן לבד יסנן נכון היום ולא מחר.
 */
create or replace function squish_can_view_item(p_viewer uuid, p_item uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when i.deleted_at is not null then false
      when not squish_can_view_collection(p_viewer, i.owner_user_id) then false
      when squish_relation(p_viewer, i.owner_user_id) = 'extended'
        then i.trade_status = 'open_for_trade'
      else true
    end
    from squish_items i
   where i.id = p_item
  ), false);
$$;

comment on function squish_can_view_item(uuid, uuid) is
  'המעגל המורחב רואה רק פריטים שפתוחים לטרייד עכשיו. הבעלים והחברות הישירות — הכל.';

/* ══════════════ 4. מותר לה להציע טרייד ══════════════ */

/**
 * הצעת טרייד דורשת יותר מצפייה: הפריט חייב להיות פתוח לטרייד *ברגע
 * הזה*, ולא רק להיות גלוי. פריט ששמור בטרייד אחר, שכבר הוחלף או שעבר
 * לדוכן — אי אפשר להציע עליו, גם לחברה הכי קרובה.
 *
 * p_owner מתקבל כפרמטר ונבדק מול הפריט, ולא נלקח ממנו: קריאה שמעבירה
 * בעלים אחר מזה שרשום על הפריט היא באג או ניסיון, ובשני המקרים
 * התשובה היא לא.
 */
create or replace function squish_can_trade(p_viewer uuid, p_owner uuid, p_item uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select i.owner_user_id = p_owner
       and i.deleted_at is null
       and i.trade_status = 'open_for_trade'
       and i.duchan_product_id is null
       and p_viewer is distinct from p_owner
       and squish_relation(p_viewer, p_owner) in ('direct', 'extended')
      from squish_items i
     where i.id = p_item
  ), false);
$$;

/* ══════════════ 5. הרשאות ══════════════ */

do $$ begin
  grant execute on function squish_relation(uuid, uuid)             to anon, authenticated, service_role;
  grant execute on function squish_can_view_collection(uuid, uuid)  to anon, authenticated, service_role;
  grant execute on function squish_can_view_item(uuid, uuid)        to anon, authenticated, service_role;
  grant execute on function squish_can_trade(uuid, uuid, uuid)      to anon, authenticated, service_role;
exception when undefined_object then null; end $$;
