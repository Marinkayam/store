/* ── מאיפה הגיעה ההזמנה ──
   מרינה, 11.2026: "צריך למצוא איזשהי דרך לממשק בין דוכן לטיקטוק". עד עכשיו
   ידענו מאיפה הגיעו מבקרים (store_stats.source), אבל לא מאיפה הגיעו הזמנות.
   אותן קטגוריות כמו lib/stats.ts (SOURCES), בלי ה-referrer עצמו.
   מיגרציה שרק מוסיפה: עמודה nullable אחת. */

alter table orders add column if not exists source text;

do $$ begin
  alter table orders add constraint orders_source_check
    check (source is null or source in ('whatsapp_or_direct', 'instagram', 'tiktok', 'facebook', 'google', 'stall', 'other'));
exception when duplicate_object then null; end $$;

comment on column orders.source is 'מאיפה הגיע הקונה (lib/stats.ts SOURCES). נקבע בשרת אחרי place_order.';
