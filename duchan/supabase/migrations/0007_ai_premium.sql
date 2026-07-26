-- פיצ'ר פרימיום: כתיבת תיאור מוצר ע"י AI. מודלק פר חנות ע"י המנהלת.
-- ai_credits: כמה תיאורים נשארו. null = ללא הגבלה.

alter table stores add column ai_enabled boolean default false;
alter table stores add column ai_credits int;

-- ניכוי קרדיט אטומי. מחזיר true אם מותר להשתמש.
create or replace function use_ai_credit(p_store uuid)
returns boolean language plpgsql security definer as $$
declare s record;
begin
  select ai_enabled, ai_credits into s from stores where id = p_store for update;
  if s is null or not coalesce(s.ai_enabled, false) then
    return false;
  end if;
  if s.ai_credits is null then          -- ללא הגבלה
    return true;
  end if;
  if s.ai_credits <= 0 then
    return false;
  end if;
  update stores set ai_credits = ai_credits - 1 where id = p_store;
  return true;
end $$;

-- החזרת קרדיט כשהקריאה ל-AI נכשלה. לא עולה מעל התקרה שנקבעה.
create or replace function refund_ai_credit(p_store uuid)
returns void language sql security definer as $$
  update stores set ai_credits = ai_credits + 1
   where id = p_store and ai_credits is not null
$$;
