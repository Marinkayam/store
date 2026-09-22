-- 0047 — תשלום לפי מספר טלפון (בקשת מרינה, 2026-09).
--
-- למשפחות אין תמיד לינק — יש מספר. המוכרת מזינה מספר ביט ו/או מספר
-- פייבוקס, והקונה מקבלת את הסכום + המספר עם כפתור העתקה. כשיש גם
-- לינק — הוא עדיף (פותח את האפליקציה ישר על ההעברה).
--
-- המספרים מוצגים לקונות בדף פומבי — זו החלטה מודעת של המוכרת, כמו
-- הלינק. contact_phone של החנות עצמה נשאר חסוי כתמיד.

alter table stores add column if not exists payout_bit_phone text;
alter table stores add column if not exists payout_paybox_phone text;

comment on column stores.payout_bit_phone is
  'מספר הביט שאליו מעבירים (05XXXXXXXX). מוצג לקונה עם כפתור העתקה.';
comment on column stores.payout_paybox_phone is
  'מספר הפייבוקס שאליו מעבירים.';

-- הטריגר מנרמל לספרות בלבד ובודק שזה נייד ישראלי
create or replace function guard_payout_link()
returns trigger language plpgsql as $$
begin
  new.payout_link        := nullif(btrim(coalesce(new.payout_link, '')), '');
  new.payout_bit_link    := nullif(btrim(coalesce(new.payout_bit_link, '')), '');
  new.payout_paybox_link := nullif(btrim(coalesce(new.payout_paybox_link, '')), '');
  new.payout_bit_phone    := nullif(regexp_replace(coalesce(new.payout_bit_phone, ''), '\D', '', 'g'), '');
  new.payout_paybox_phone := nullif(regexp_replace(coalesce(new.payout_paybox_phone, ''), '\D', '', 'g'), '');

  if new.payout_link is not null and new.payout_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link|bitpay\.co\.il)(/|$)'
  then
    raise exception 'payout link must be a bit or paybox https link';
  end if;

  if new.payout_bit_link is not null and new.payout_bit_link !~*
     '^https://([a-z0-9-]+\.)*bitpay\.co\.il(/|$)'
  then
    raise exception 'bit link must be a bitpay.co.il https link';
  end if;

  if new.payout_paybox_link is not null and new.payout_paybox_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link)(/|$)'
  then
    raise exception 'paybox link must be a paybox https link';
  end if;

  if new.payout_bit_phone is not null and new.payout_bit_phone !~ '^05\d{8}$' then
    raise exception 'bit phone must be an israeli mobile number';
  end if;
  if new.payout_paybox_phone is not null and new.payout_paybox_phone !~ '^05\d{8}$' then
    raise exception 'paybox phone must be an israeli mobile number';
  end if;

  return new;
end $$;
