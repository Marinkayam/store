/* ── מצב חופשה לדוכן, והזמנה כמתנה ──
   מרינה, 11.2026: "כן תתחיל הכל" (סבב 4, סעיפים 2 ו-6).

   1. stores.away / stores.away_until: "הדוכן בחופשה". הדוכן נשאר גלוי עם
      המוצרים, ורק ההזמנה סגורה, עם "חוזרים ב-…". עד היום הייתה רק "הפסקה"
      (status = paused) שסוגרת את הדוכן כולו ("הדוכן סגור כרגע"), ונשארת
      להשהיה מהחמ"ל. away_until ריק = עד שפותחים שוב. אחרי התאריך הדוכן
      נפתח לבד.
   2. orders.is_gift: הקונה סימן "זו מתנה". הברכה עצמה נכנסת להערת הקונה
      (buyer_note), כדי שתימחק יחד עם שאר פרטי הקונה בזמן (0071).

   מיגרציה שרק מוסיפה: עמודות nullable, והחלפת guard_store_member_update
   באותה חתימה עם שני שדות נוספים ברשימה של השותפים. */

alter table stores add column if not exists away boolean;
alter table stores add column if not exists away_until date;
comment on column stores.away is 'true = הדוכן בחופשה: גלוי, אבל לא מקבל הזמנות (0076)';
comment on column stores.away_until is 'עד מתי החופשה (כולל). ריק = עד שפותחים שוב';

alter table orders add column if not exists is_gift boolean;
comment on column orders.is_gift is 'הקונה סימן "זו מתנה" (0076). הברכה בהערת הקונה';

create or replace function guard_store_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array[
    'display_name','emoji','tagline','theme','cover_key','cover_preset','avatar_key',
    'about','city','city_id','ships','shipping_note','shipping_price','order_intro','order_outro',
    'promo_on','promo_title','promo_text','categories','look','bg_pattern','bg_key',
    'category_layout','category_size','category_meta','featured_title','show_sold_out','status',
    'away','away_until'
  ];
begin
  -- השרת (service role) — אין auth.uid()
  if auth.uid() is null then
    return new;
  end if;

  -- הבעלות וההעברה לא משתנות מהדפדפן לעולם — גם לא של ראש הדוכן.
  -- רק /api/team (שרת) מעביר ראשות.
  if new.owner_id is distinct from old.owner_id
     or new.transfer_to is distinct from old.transfer_to
     or new.transfer_requested_at is distinct from old.transfer_requested_at then
    raise exception 'not_allowed: ownership';
  end if;

  -- "חסום" נקבע רק מהחמ"ל. פתוח ↔ הפסקה — כן.
  if new.status is distinct from old.status
     and (old.status = 'blocked' or new.status = 'blocked') then
    raise exception 'not_allowed: blocked';
  end if;

  if old.owner_id = auth.uid() then
    return new;            -- ראש הדוכן
  end if;

  -- שותף: כל שינוי מחוץ לרשימה המותרת נדחה
  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'not_allowed: partner';
  end if;
  return new;
end $$;
