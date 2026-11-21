-- 0072 — רשימת בדיקה לערים שלא זוהו.
--
-- אחרי 0070 נשארו דוכנים עם טקסט ישן בשדה העיר שאי אפשר לזהות בוודאות
-- (שגיאת כתיב, שכונה, שני מקומות, או משהו שאינו עיר). לא מנחשים: הם נשארים
-- בלי עיר, והמנהלת עוברת עליהם בחמ"ל.
--
-- city_reviewed_at = המנהלת טיפלה בדוכן הזה (בחרה עיר, או החליטה להשאיר
-- בלי). הטקסט הישן (stores.city) לא נמחק גם אז.
--
-- תוספתית בלבד ובטוחה להרצה חוזרת.

alter table stores add column if not exists city_reviewed_at timestamptz;

comment on column stores.city_reviewed_at is 'מתי המנהלת בדקה את הטקסט הישן של העיר. רק מהחמ"ל.';

/* אותה פונקציה כמו ב-0070, עם שורה אחת נוספת: city_reviewed_at */
create or replace function guard_store_client_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not is_client_write() then
    return new;
  end if;
  -- דוכן נוצר רק דרך /api/stores (בדיקת מכסה, סלאג אקראי, הפניה)
  if tg_op = 'INSERT' then
    raise exception 'not_allowed: create stores via the API';
  end if;
  new.id                   := old.id;
  new.slug                 := old.slug;
  new.created_at           := old.created_at;
  new.claim_token          := old.claim_token;
  new.activated_at         := old.activated_at;
  new.payment_claimed_at   := old.payment_claimed_at;
  new.payment_method       := old.payment_method;
  new.payment_ref          := old.payment_ref;
  new.payment_amount       := old.payment_amount;
  new.parent_consent_at    := old.parent_consent_at;
  new.parent_aware_at      := old.parent_aware_at;
  new.parent_name          := old.parent_name;
  new.parent_phone         := old.parent_phone;
  new.parent_email         := old.parent_email;
  new.sms_unlimited        := old.sms_unlimited;
  new.media_quota_bytes    := old.media_quota_bytes;
  new.media_bytes          := old.media_bytes;
  new.ai_enabled           := old.ai_enabled;
  new.ai_credits           := old.ai_credits;
  new.referred_by          := old.referred_by;
  new.referral_source      := old.referral_source;
  new.ref_clicks           := old.ref_clicks;
  new.city                 := old.city;   -- 0070: העיר נבחרת מרשימה (city_id)
  new.city_reviewed_at     := old.city_reviewed_at;
  return new;
end $$;
