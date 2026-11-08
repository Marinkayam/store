-- 0066 — הקשחת אבטחה אחרי סקירת קוד (11.2026)
--
-- הבעיה המרכזית: מדיניות ה-RLS של "השורה שלי" (own_store, squish_own_*)
-- נותנת לדפדפן לכתוב *כל* עמודה בשורה, כולל עמודות שרק השרת או החמ"ל אמורים
-- לשנות: הפעלת דוכן בלי לשלם, סמס ללא הגבלה, מכסת מדיה, אישור הורה, השעיה.
--
-- הפתרון: טריגרים שמזהים כתיבה ישירה מהדפדפן (current_user הוא anon או
-- authenticated) ומחזירים את העמודות המוגנות לערך הקודם. פונקציות SECURITY
-- DEFINER (claim_store_payment, squish_create_profile…) רצות כבעלים, ולכן
-- current_user בתוכן אינו authenticated והן ממשיכות לעבוד. השרת (service
-- role) לא מושפע. פונקציות הטריגר עצמן SECURITY INVOKER בכוונה — אחרת
-- current_user היה תמיד הבעלים.
--
-- הכל מוסיף: פונקציות וטריגרים חדשים, וגרסאות מתוקנות של פונקציות קיימות.
-- אין שינוי עמודות.

create or replace function is_client_write() returns boolean
language sql stable as $$
  select current_user in ('anon', 'authenticated')
$$;

/* ── stores ─────────────────────────────────────────────────────────── */

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
  return new;
end $$;

drop trigger if exists stores_guard_client on stores;
create trigger stores_guard_client
  before insert or update on stores
  for each row execute function guard_store_client_write();

/* ── squish_profiles ────────────────────────────────────────────────── */

create or replace function guard_squish_profile_client_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not is_client_write() then
    return new;
  end if;
  -- פרופיל נוצר רק דרך squish_create_profile
  if tg_op = 'INSERT' then
    raise exception 'not_allowed: create profiles via squish_create_profile';
  end if;
  new.id                := old.id;
  new.user_id           := old.user_id;
  new.collection_code   := old.collection_code;
  new.created_at        := old.created_at;
  new.suspended_at      := old.suspended_at;
  new.suspended_reason  := old.suspended_reason;
  new.pilot_user        := old.pilot_user;
  new.pilot_started_at  := old.pilot_started_at;
  new.parent_approved_at := old.parent_approved_at;
  new.parent_awareness_at := old.parent_awareness_at;
  new.parent_awareness_version := old.parent_awareness_version;
  new.media_quota_bytes := old.media_quota_bytes;
  new.media_bytes       := old.media_bytes;
  new.completed_trades  := old.completed_trades;
  new.ai_used_on        := old.ai_used_on;
  new.ai_used_count     := old.ai_used_count;
  return new;
end $$;

drop trigger if exists squish_profiles_guard_client on squish_profiles;
create trigger squish_profiles_guard_client
  before insert or update on squish_profiles
  for each row execute function guard_squish_profile_client_write();

/* ── squish_connections: רק דרך squish_join / השרת ─────────────────── */

create or replace function guard_squish_connection_client_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if is_client_write() then
    raise exception 'not_allowed: connections are created by squish_join';
  end if;
  return new;
end $$;

drop trigger if exists squish_connections_guard_client on squish_connections;
create trigger squish_connections_guard_client
  before insert or update on squish_connections
  for each row execute function guard_squish_connection_client_write();

/* ── squish_invites: הגבולות נקבעים בדאטהבייס, לא בדפדפן ───────────── */

create or replace function guard_squish_invite_client_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not is_client_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.inviter_user_id := auth.uid();
    new.clicks          := 0;
    new.uses            := 0;
    new.max_uses        := 10;
    new.expires_at      := now() + interval '30 days';
    new.joined_user_id  := null;
    new.joined_at       := null;
    new.activated_at    := null;
    new.revoked_at      := null;
    new.created_at      := now();
    return new;
  end if;
  -- עדכון מהדפדפן: מותר רק לבטל קישור (revoked_at) ולשנות את הכינוי שלו
  new.id              := old.id;
  new.code            := old.code;
  new.inviter_user_id := old.inviter_user_id;
  new.clicks          := old.clicks;
  new.uses            := old.uses;
  new.max_uses        := old.max_uses;
  new.expires_at      := old.expires_at;
  new.joined_user_id  := old.joined_user_id;
  new.joined_at       := old.joined_at;
  new.activated_at    := old.activated_at;
  new.created_at      := old.created_at;
  if old.revoked_at is not null then
    new.revoked_at := old.revoked_at;   -- קישור שבוטל לא חוזר לחיים
  end if;
  return new;
end $$;

drop trigger if exists squish_invites_guard_client on squish_invites;
create trigger squish_invites_guard_client
  before insert or update on squish_invites
  for each row execute function guard_squish_invite_client_write();

/* ── squish_items / squish_wishlist: פריט רק בפרופיל של הבעלים ─────── */

create or replace function guard_squish_owned_row_client_write() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not is_client_write() then
    return new;
  end if;
  if new.owner_user_id is distinct from auth.uid()
     or not exists (
       select 1 from squish_profiles p
        where p.id = new.profile_id and p.user_id = new.owner_user_id
     ) then
    raise exception 'not_allowed: profile does not belong to owner';
  end if;
  return new;
end $$;

drop trigger if exists squish_items_guard_owner on squish_items;
create trigger squish_items_guard_owner
  before insert or update on squish_items
  for each row execute function guard_squish_owned_row_client_write();

drop trigger if exists squish_wishlist_guard_owner on squish_wishlist;
create trigger squish_wishlist_guard_owner
  before insert or update on squish_wishlist
  for each row execute function guard_squish_owned_row_client_write();

-- פריט שנעול בטרייד (או שכבר הוחלף) — הדפדפן לא משנה את מצב הטרייד שלו,
-- ולא יכול להכניס אותו ל"שמור" או "הוחלף" בעצמו. רק פונקציות הטרייד.
create or replace function guard_squish_item_trade_state() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if not is_client_write() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.trade_status in ('reserved', 'traded') then
      new.trade_status := 'keep';
    end if;
    new.reserved_by_proposal_id := null;
    new.pre_reserve_status := null;
    return new;
  end if;
  new.reserved_by_proposal_id := old.reserved_by_proposal_id;
  new.pre_reserve_status      := old.pre_reserve_status;
  if old.trade_status in ('reserved', 'traded') or old.reserved_by_proposal_id is not null then
    new.trade_status := old.trade_status;
  elsif new.trade_status in ('reserved', 'traded') then
    new.trade_status := old.trade_status;
  end if;
  return new;
end $$;

drop trigger if exists squish_items_guard_trade_state on squish_items;
create trigger squish_items_guard_trade_state
  before insert or update on squish_items
  for each row execute function guard_squish_item_trade_state();

/* ── טריידים ────────────────────────────────────────────────────────── */

-- שמירה רק לטרייד שמצבו "אושר". טרייד שנדחה או בוטל (וגם אחרי ששני הצדדים
-- אישרו בעבר) לא חוזר לחיים, ולא משחרר מספר טלפון.
create or replace function squish_accept_and_reserve_trade(p_proposal uuid)
returns text
language plpgsql security definer set search_path = public as $function$
declare
  v_me    uuid := auth.uid();
  v_prop  record;
  v_item  record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status = 'ready_for_whatsapp' then return 'already'; end if;
  if v_prop.status <> 'accepted' then
    raise exception 'trade is not accepted';
  end if;
  if v_prop.accepted_by_sender_at is null or v_prop.accepted_by_receiver_at is null then
    raise exception 'both sides must approve';
  end if;
  if exists (
    select 1 from squish_profiles p
     where p.user_id in (v_prop.sender_user_id, v_prop.receiver_user_id)
       and p.suspended_at is not null
  ) then
    raise exception 'account suspended';
  end if;

  for v_item in
    select vi.item_id, vi.owner_user_id
      from squish_trade_version_items vi
     where vi.version_id = v_prop.current_version_id
     order by vi.item_id
     for update
  loop
    perform 1 from squish_items i where i.id = v_item.item_id for update;

    if not exists (
      select 1 from squish_items i
       where i.id = v_item.item_id
         and i.owner_user_id = v_item.owner_user_id
         and i.deleted_at is null
         and i.trade_status not in ('reserved','traded','moved_to_duchan')
         and i.duchan_product_id is null
    ) then
      raise exception 'item unavailable';
    end if;
  end loop;

  update squish_items
     set pre_reserve_status = trade_status,
         trade_status = 'reserved',
         reserved_by_proposal_id = p_proposal,
         updated_at = now()
   where id in (
     select vi.item_id from squish_trade_version_items vi
      where vi.version_id = v_prop.current_version_id
   );

  update squish_trade_proposals
     set status = 'ready_for_whatsapp', reserved_at = now(), updated_at = now()
   where id = p_proposal;

  update squish_trade_proposals p
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = 'item_unavailable',
         updated_at = now()
   where p.id <> p_proposal
     and p.status in ('sent','viewed','countered','accepted')
     and exists (
       select 1 from squish_trade_version_items vi
        where vi.version_id = p.current_version_id
          and vi.item_id in (
            select vi2.item_id from squish_trade_version_items vi2
             where vi2.version_id = v_prop.current_version_id
          )
     );

  return 'reserved';
end $function$;

-- אישור השלמה פעמיים לא מוסיף עוד החלפה למונה
create or replace function squish_confirm_completion(p_proposal uuid)
returns text
language plpgsql security definer set search_path = public as $function$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status = 'completed' then
    return 'completed';
  end if;
  if v_prop.status <> 'ready_for_whatsapp' then
    raise exception 'trade is not ready';
  end if;

  update squish_trade_proposals
     set completed_by_sender_at   = case when v_me = sender_user_id   then now() else completed_by_sender_at end,
         completed_by_receiver_at = case when v_me = receiver_user_id then now() else completed_by_receiver_at end,
         updated_at = now()
   where id = p_proposal;

  select * into v_prop from squish_trade_proposals where id = p_proposal;
  if v_prop.completed_by_sender_at is null or v_prop.completed_by_receiver_at is null then
    return 'waiting';
  end if;

  update squish_items
     set trade_status = 'traded', reserved_by_proposal_id = null,
         pre_reserve_status = null, updated_at = now()
   where reserved_by_proposal_id = p_proposal;

  update squish_trade_proposals
     set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_proposal;

  update squish_profiles
     set completed_trades = completed_trades + 1, updated_at = now()
   where user_id in (v_prop.sender_user_id, v_prop.receiver_user_id);

  return 'completed';
end $function$;

-- השעיה מבטלת גם את הטריידים הפתוחים של החשבון ומשחררת את הפריטים, כדי
-- שחשבון מושעה לא יוכל למשוך מספר טלפון מטרייד קיים.
create or replace function squish_admin_suspend(p_user uuid, p_reason text, p_admin text)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_prop record;
begin
  update squish_profiles
     set suspended_at = now(), suspended_reason = p_reason, updated_at = now()
   where user_id = p_user;

  for v_prop in
    select * from squish_trade_proposals
     where p_user in (sender_user_id, receiver_user_id)
       and status in ('sent','viewed','countered','accepted','ready_for_whatsapp')
     for update
  loop
    update squish_items
       set trade_status = coalesce(
             pre_reserve_status,
             case when id = v_prop.requested_item_id
                  then 'open_for_trade'::squish_trade_status
                  else 'keep'::squish_trade_status end),
           pre_reserve_status = null,
           reserved_by_proposal_id = null,
           updated_at = now()
     where reserved_by_proposal_id = v_prop.id;

    update squish_trade_proposals
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'other', updated_at = now()
     where id = v_prop.id;
  end loop;

  insert into squish_admin_actions (admin_label, action, target_user, note)
  values (coalesce(p_admin, 'admin'), 'suspend', p_user, p_reason);
end $function$;

/* ── הזמנות: ביטול מחזיר את השימוש בקופון ──────────────────────────── */

create or replace function cancel_order(p_order uuid)
returns void
language plpgsql security definer set search_path = public as $function$
declare
  o record;
  it jsonb;
  q int;
begin
  select * into o from orders where id = p_order for update;
  if o is null or o.status = 'cancelled' then
    return;
  end if;

  if not can_manage_store(o.store_id) then
    raise exception 'not allowed';
  end if;

  if o.status in ('paid','delivered') then
    for it in select * from jsonb_array_elements(o.items) loop
      q := (it->>'qty')::int;
      update products
         set stock = stock + q,
             option_stock = case
               when option_stock is not null and it ? 'option' and option_stock ? (it->>'option')
                 then jsonb_set(option_stock, array[it->>'option'],
                                to_jsonb((option_stock->>(it->>'option'))::int + q))
               else option_stock
             end
       where store_id = o.store_id
         and track_stock
         and (case when it ? 'id' then id::text = it->>'id' else name = it->>'name' end);
    end loop;
  end if;

  -- הזמנה שבוטלה לא "אוכלת" שימוש בקופון (אחרת הזמנות רפאים מרוקנות אותו)
  if o.coupon_code is not null then
    update coupons
       set used_count = greatest(used_count - 1, 0)
     where store_id = o.store_id
       and upper(code) = upper(o.coupon_code)
       and deleted_at is null;
  end if;

  update orders set status = 'cancelled' where id = p_order;
end $function$;

/* ── search_path קבוע לפונקציות SECURITY DEFINER שחסר להן ──────────── */

alter function bump_ref_click(uuid)                    set search_path = public;
alter function claim_store_payment(uuid, text, text)   set search_path = public;
alter function guard_store_activation()                set search_path = public;
alter function mark_order_paid(uuid)                   set search_path = public;
alter function refund_ai_credit(uuid)                  set search_path = public;
alter function set_parent_consent(uuid, boolean)       set search_path = public;
alter function use_ai_credit(uuid)                     set search_path = public;
