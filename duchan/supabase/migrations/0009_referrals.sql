-- 0009 — מאיפה הגיעה כל חנות.
-- כך נבנית הרשת: ילדה רואה חנות של חברה, לוחצת "גם אני רוצה", ופותחת חנות
-- שרשומה כמי שהגיעה ממנה. מהאדמין רואים את האשכולות — כיתה, שכבה, שכונה.

alter table stores add column if not exists referred_by     uuid references stores(id) on delete set null;
alter table stores add column if not exists referral_source text;
alter table stores add column if not exists ref_clicks      int not null default 0;

comment on column stores.referred_by     is 'החנות שממנה הגיעה. null = הגיעה ישירות.';
comment on column stores.referral_source is 'store | direct | admin';
comment on column stores.ref_clicks      is 'כמה פעמים לחצו "פתחי חנות משלך" מדף החנות הזו.';

create index if not exists stores_referred_by_idx on stores (referred_by);

-- הגנה: הבעלות לא משנה שיוך אחרי היצירה (ולא מפעילה חנות — ראה 0008).
-- security definer מאותה סיבה שמוסברת ב-0008.
create or replace function guard_store_activation()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null then
    new.activated_at   := old.activated_at;
    new.payment_amount := old.payment_amount;
    new.referred_by    := old.referred_by;
    new.ref_clicks     := old.ref_clicks;
  end if;
  return new;
end $$;

-- ספירת לחיצות על "פתחי חנות משלך". אטומית — כמה מבקרות בו-זמנית זה המצב הרגיל.
create or replace function bump_ref_click(p_store uuid)
returns void language sql security definer as $$
  update stores set ref_clicks = ref_clicks + 1 where id = p_store
$$;

-- לא מסתמכים על default privileges: פונקציה חדשה שאין עליה grant נכשלת בשקט
do $$ begin
  if exists (select from pg_roles where rolname = 'service_role') then
    grant execute on function bump_ref_click(uuid) to service_role;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    grant execute on function bump_ref_click(uuid) to authenticated;
  end if;
end $$;
