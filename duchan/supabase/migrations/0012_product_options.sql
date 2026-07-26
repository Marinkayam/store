-- 0012 — אפשרות בחירה אחת לכל מוצר: צבע, מידה, טעם.
--
-- מכוון שזו *אפשרות אחת* ולא מטריצת וריאנטים. "חולצה S/M/L × 3 צבעים עם מלאי
-- לכל שילוב" הוא מוצר אחר לגמרי: הוא מכפיל את מסך עריכת המוצר, דורש ניהול מלאי
-- דו-ממדי, וילדה בת עשר נופלת בו. כאן: תווית אחת ורשימת בחירות.
--
-- המלאי נשאר על המוצר כולו ולא פר בחירה — מסיבה זהה.
-- הבחירה של הקונה נכנסת ל-snapshot של ההזמנה ולהודעת הוואטסאפ.

alter table products add column if not exists option_label text;
alter table products add column if not exists options      text[];

comment on column products.option_label is 'התווית שהילדה בחרה: "צבע" · "מידה" · "טעם". null = אין אפשרויות.';
comment on column products.options      is 'הבחירות עצמן. הקונה חייבת לבחור אחת לפני הוספה לסל.';
