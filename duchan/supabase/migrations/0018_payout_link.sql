-- 0018 — לינק תשלום של הילדה (פייבוקס / ביט).
--
-- עד עכשיו החנות ידעה *באילו* אמצעים היא מקבלת כסף, אבל הקונה עדיין הייתה
-- צריכה להקליד מספר ידנית. לינק תשלום הופך את זה ללחיצה אחת, וזה בדיוק
-- המקום שבו עסקאות נופלות: הקונה רוצה לשלם ולא יודעת איך.
--
-- שתי הערות שקובעות איך זה מיושם:
-- 1. אנחנו עדיין לא נוגעים בכסף. הלינק מוביל לאפליקציה של הילדה, והתשלום
--    קורה שם, בינה לבין הקונה. אין סליקה ואין עמלה.
-- 2. הלינק מוצג בדף פומבי, ולכן מותרים רק לינקים של ביט ופייבוקס. הבדיקה
--    יושבת בשרת (טריגר) ולא רק במסך, כי RLS מרשה לבעלות לעדכן את החנות
--    שלה ישירות — וילדה שמישהו שכנע אותה להדביק לינק אחר היא בדיוק
--    התרחיש שצריך למנוע.

alter table stores add column if not exists payout_link text;

comment on column stores.payout_link is
  'לינק תשלום של הילדה — ביט או פייבוקס בלבד. מוצג לקונה בגיליון ההזמנה.';

create or replace function guard_payout_link()
returns trigger language plpgsql as $$
begin
  if new.payout_link is not null then
    new.payout_link := nullif(btrim(new.payout_link), '');
  end if;

  if new.payout_link is not null and new.payout_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|bitpay\.co\.il)(/|$)'
  then
    raise exception 'payout link must be a bit or paybox https link';
  end if;

  return new;
end $$;

drop trigger if exists stores_guard_payout_link on stores;
create trigger stores_guard_payout_link
  before insert or update on stores
  for each row execute function guard_payout_link();
