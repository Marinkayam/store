-- 0068 — מחיקת פרופיל משחררת גם פריטים שנעולים בטרייד שדווח
--
-- squish_delete_profile דילגה על טריידים במצב reported. אם המוחקת הייתה
-- צד בטרייד כזה, הפריטים של הילדה השנייה נשארו "שמורים" לתמיד, בלי טרייד
-- שאפשר לבטל. הטרייד עצמו נשאר reported (למודרציה); רק הפריטים משתחררים.

create or replace function squish_delete_profile()
returns void
language plpgsql security definer set search_path = public as $function$
declare
  v_me uuid := auth.uid();
  v_prop record;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  for v_prop in
    select id, requested_item_id from squish_trade_proposals
     where status not in ('completed','declined','cancelled','reported')
       and (sender_user_id = v_me or receiver_user_id = v_me)
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
           cancel_reason = 'account_deleted', updated_at = now()
     where id = v_prop.id;
  end loop;

  -- טריידים שדווחו נשארים כפי שהם, אבל הפריטים שלהן לא נשארים נעולים
  update squish_items i
     set trade_status = coalesce(
           i.pre_reserve_status,
           case when i.id = p.requested_item_id
                then 'open_for_trade'::squish_trade_status
                else 'keep'::squish_trade_status end),
         pre_reserve_status = null,
         reserved_by_proposal_id = null,
         updated_at = now()
    from squish_trade_proposals p
   where i.reserved_by_proposal_id = p.id
     and p.status = 'reported'
     and (p.sender_user_id = v_me or p.receiver_user_id = v_me);

  delete from squish_interests where user_id = v_me;
  delete from squish_interests i using squish_items it
   where i.item_id = it.id and it.owner_user_id = v_me;
  delete from squish_wishlist where owner_user_id = v_me;
  delete from squish_blocks where blocker_user_id = v_me or blocked_user_id = v_me;
  delete from squish_connections where user_id = v_me or connected_user_id = v_me;
  delete from squish_invites where inviter_user_id = v_me;

  update squish_item_reports  set reporter_user_id = null where reporter_user_id = v_me;
  update squish_trade_reports set reported_by_user_id = null where reported_by_user_id = v_me;

  delete from squish_items where owner_user_id = v_me;
  delete from squish_profiles where user_id = v_me;
end $function$;
