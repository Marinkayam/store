-- 0044 — לינק פייבוקס אמיתי מתקבל.
--
-- תלונה מהשטח: "הילדה הגדירה לינק לפייבוקס וזה לא עובד". החקירה העלתה
-- שאף חנות בפרודקשן לא הצליחה לשמור payout_link מעולם — הוולידציה
-- (0018) מכירה רק paybox.co.il / payboxapp.com / bitpay.co.il, אבל
-- אפליקציית פייבוקס מעתיקה ללוח לינקים בצורת payboxapp.page.link/...
-- והם נדחו גם במסך וגם בטריגר.
--
-- אותה רשימה חייבת להישאר זהה ל-PAY_HOSTS ב-lib/payouts.ts.

create or replace function guard_payout_link()
returns trigger language plpgsql as $$
begin
  if new.payout_link is not null then
    new.payout_link := nullif(btrim(new.payout_link), '');
  end if;

  if new.payout_link is not null and new.payout_link !~*
     '^https://([a-z0-9-]+\.)*(paybox\.co\.il|payboxapp\.com|payboxapp\.page\.link|bitpay\.co\.il)(/|$)'
  then
    raise exception 'payout link must be a bit or paybox https link';
  end if;

  return new;
end $$;
