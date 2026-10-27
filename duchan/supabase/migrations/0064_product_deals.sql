-- 0064 — מבצעים על מוצר. המוכרת בוחרת אחד משלושה:
--
--   {"type":"sale",   "price": 10}           מחיר מבצע: ₪10 במקום המחיר הרגיל
--   {"type":"free",   "buy": 1}              1+1 (או 2+1 … 5+1)
--   {"type":"bundle", "qty": 2, "price": 15} כמות במחיר: 2 ב-₪15
--
-- null = בלי מבצע. החישוב עצמו ב-lib/deals.ts, והשרת מחשב מחדש בכל הזמנה
-- (/api/orders). מוצרים נשמרים ישירות מהדפדפן (RLS), ולכן הצורה נאכפת כאן.
-- "זול יותר מהמחיר הרגיל" לא נאכף כאן בכוונה: אחרת שינוי מחיר היה נחסם
-- בגלל מבצע ישן. מבצע שכבר לא משתלם פשוט לא מוצג ולא מחושב.
--
-- רק מוסיפים, ו-nullable — CLAUDE.md §9.
alter table products add column if not exists deal jsonb;

comment on column products.deal is
  'מבצע: {type:sale,price} | {type:free,buy:1..5} | {type:bundle,qty:2..10,price}. null = בלי.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_deal_shape') then
    alter table products add constraint products_deal_shape check (
      deal is null or (
        jsonb_typeof(deal) = 'object' and (
          (deal->>'type' = 'sale'
            and jsonb_typeof(deal->'price') = 'number'
            and (deal->>'price')::numeric > 0 and (deal->>'price')::numeric < 100000)
          or (deal->>'type' = 'free'
            and jsonb_typeof(deal->'buy') = 'number'
            and (deal->>'buy')::numeric in (1, 2, 3, 4, 5))
          or (deal->>'type' = 'bundle'
            and jsonb_typeof(deal->'qty') = 'number'
            and (deal->>'qty')::numeric in (2, 3, 4, 5, 6, 7, 8, 9, 10)
            and jsonb_typeof(deal->'price') = 'number'
            and (deal->>'price')::numeric > 0 and (deal->>'price')::numeric < 100000)
        )
      )
    );
  end if;
end $$;
