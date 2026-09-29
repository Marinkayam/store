-- 0051 — סוגרים את גרסאות place_order הישנות לציבור.
--
-- נמצא בבדיקה אחרי 0049: שלוש הגרסאות הראשונות (5, 6 ו-7 פרמטרים) נולדו
-- לפני הלקח של 0040, ועדיין היו פתוחות ל-anon ול-authenticated בפרודקשן.
-- כל מי שמחזיק את המפתח הציבורי (הוא בקוד הלקוח, זה בסדר) יכול היה לקרוא
-- להן ישירות ולהכניס הזמנה מזויפת לכל חנות, בכל סכום, בלי לעבור את
-- /api/orders — שם נבדקים המחיר, המלאי, הבחירה והטלפון.
--
-- האתר קורא ל-place_order רק מהשרת, עם service_role, ולכן הסגירה לא
-- משנה כלום להזמנות אמיתיות. חל על כל חמש הגרסאות, כך שאפשר להריץ שוב.

do $$
declare f regprocedure;
begin
  for f in select oid::regprocedure from pg_proc
           where proname = 'place_order' and pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
