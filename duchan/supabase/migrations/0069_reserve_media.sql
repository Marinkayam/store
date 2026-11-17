-- 0069 — תפיסת מקום במכסת המדיה, אטומית.
--
-- /api/upload קרא media_bytes, חתם, וכתב media_bytes + bytes. בקשות
-- במקביל קראו כולן את אותו ערך, כולן עברו את בדיקת התקרה, וכל אחת דרסה
-- את הכתיבה של השנייה: המכסה נפרצה והמונה נשאר נמוך.
--
-- supabase-js לא יודע לכתוב "media_bytes = media_bytes + n", ולכן זה
-- כאן: עדכון מותנה אחד שבודק את התקרה ומוסיף באותה פקודה. השורה ננעלת
-- לזמן העדכון, כך שבקשה מקבילה רואה את הערך החדש ונבדקת מולו.
--
-- מחזירה את media_bytes החדש, או null כשאין מקום (או אין שורה כזו).
-- p_bytes שלילי = שחרור מקום (חתימה שנכשלה); שחרור לא נבדק מול התקרה
-- ולא יורד מתחת לאפס.
--
-- שרת בלבד (service_role). הקוד עולה לפני המיגרציה — עד שהיא רצה,
-- lib/media-usage.ts נופל ל-compare-and-set עם ניסיונות חוזרים.

create or replace function reserve_store_media(p_store uuid, p_bytes bigint, p_cap bigint)
returns bigint
language sql security invoker set search_path = public as $$
  update stores
     set media_bytes = greatest(0, media_bytes + p_bytes)
   where id = p_store
     and (p_bytes <= 0 or media_bytes + p_bytes <= p_cap)
  returning media_bytes
$$;

create or replace function reserve_squish_media(p_profile uuid, p_bytes bigint, p_cap bigint)
returns bigint
language sql security invoker set search_path = public as $$
  update squish_profiles
     set media_bytes = greatest(0, media_bytes + p_bytes)
   where id = p_profile
     and (p_bytes <= 0 or media_bytes + p_bytes <= p_cap)
  returning media_bytes
$$;

-- כמו ב-0040: צריך את שלושתם, אחרת הפונקציה פתוחה לכל דפדפן דרך PostgREST
revoke execute on function reserve_store_media(uuid, bigint, bigint)  from public, anon, authenticated;
revoke execute on function reserve_squish_media(uuid, bigint, bigint) from public, anon, authenticated;
grant  execute on function reserve_store_media(uuid, bigint, bigint)  to service_role;
grant  execute on function reserve_squish_media(uuid, bigint, bigint) to service_role;
