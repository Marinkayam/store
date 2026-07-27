-- 0019 — מה שהחנות מספרת על עצמה, ואיך ההזמנה מגיעה.
--
-- ארבעה דברים שקונה שואלת לפני שהיא קונה, וששאלו אותם בוואטסאפ שוב ושוב:
-- מי את · מאיפה את · יש משלוח וכמה · איך משלמים. כל אחד מהם שנשאר בלי
-- תשובה בדף הוא הודעה שהילדה צריכה לענות עליה ידנית, ולעיתים קרובות
-- מכירה שלא נסגרה.
--
-- אין כאן שדה כתובת. עיר בלבד, מרשימה סגורה בממשק — "רמת גן" זה מספיק
-- כדי לדעת אם המסירה הגיונית, ובלי לחשוף איפה הילדה גרה.

alter table stores add column if not exists about           text;
alter table stores add column if not exists city            text;
alter table stores add column if not exists ships           boolean not null default false;
alter table stores add column if not exists shipping_note   text;
alter table stores add column if not exists shipping_price  int;
alter table stores add column if not exists order_intro     text;
alter table stores add column if not exists order_outro     text;

comment on column stores.about          is 'כמה מילים על הדוכן. מוצג מתחת לשם.';
comment on column stores.city           is 'עיר בלבד — לעולם לא כתובת.';
comment on column stores.ships          is 'האם יש משלוח בכלל.';
comment on column stores.shipping_note  is 'איך ולאן שולחים, בלשון שלה.';
comment on column stores.shipping_price is 'מחיר משלוח בשקלים. null = לא צוין.';
comment on column stores.order_intro    is 'שורת הפתיחה של הודעת ההזמנה שמגיעה אליה.';
comment on column stores.order_outro    is 'שורת הסיום של אותה הודעה.';

-- מחיר משלוח שלילי הוא טעות הקלדה, לא כוונה
alter table stores drop constraint if exists stores_shipping_price_check;
alter table stores add constraint stores_shipping_price_check
  check (shipping_price is null or (shipping_price >= 0 and shipping_price <= 200));
