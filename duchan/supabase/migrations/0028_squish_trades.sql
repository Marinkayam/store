-- 0028 — טריידים: הסכמה מובנית בין שתי אספניות.
--
-- זה לא צ'אט. שתי הצדדים צריכות להבין בדיוק מה עובר לאיזה כיוון,
-- לאשר את *אותה* גרסה, ורק אז לעבור לוואטסאפ.
--
-- שלוש החלטות שמעוגנות כאן ולא בממשק:
--
-- 1. **הצעה נגדית יכולה רק לצמצם.** המקבלת בוחרת תת-קבוצה ממה שכבר
--    הוצע לה, ולעולם לא פריט אחר מהאוסף של השולחת. אחרת עצם המשא ומתן
--    היה חושף פריטים פרטיים שהשולחת לא בחרה להציע. זה נאכף בפונקציה,
--    לא בבדיקה בדפדפן.
-- 2. **שמירת פריטים היא אטומית.** או שכל הפריטים בטרייד ננעלים יחד, או
--    ששום דבר לא ננעל. שני טריידים לא יכולים לנעול את אותו סקווישי.
-- 3. **מספר הטלפון לא יוצא מהשרת** עד שהטרייד באמת שמור ומאושר משני
--    הצדדים. אין דרך לקבל אותו קודם, גם לא דרך ה-API.

/* ── טיפוסים ── */

do $$ begin
  create type squish_proposal_status as enum (
    'draft','sent','viewed','countered','accepted',
    'ready_for_whatsapp','completed','declined','cancelled','reported'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type squish_side as enum ('requested','offered');
exception when duplicate_object then null; end $$;

/* ── ההצעה, הגרסאות והפריטים ── */

create table if not exists squish_trade_proposals (
  id                        uuid primary key default gen_random_uuid(),
  sender_user_id            uuid not null references auth.users(id) on delete cascade,
  receiver_user_id          uuid not null references auth.users(id) on delete cascade,
  requested_item_id         uuid not null references squish_items(id) on delete cascade,
  current_version_id        uuid,
  status                    squish_proposal_status not null default 'draft',
  connection_context        text,
  accepted_by_sender_at     timestamptz,
  accepted_by_receiver_at   timestamptz,
  reserved_at               timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz,
  cancel_reason             text,
  completed_by_sender_at    timestamptz,
  completed_by_receiver_at  timestamptz,
  parent_ack_sender_at      timestamptz,
  parent_ack_receiver_at    timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  check (sender_user_id <> receiver_user_id)
);

create index if not exists squish_proposals_receiver_idx
  on squish_trade_proposals (receiver_user_id, status, updated_at desc);
create index if not exists squish_proposals_sender_idx
  on squish_trade_proposals (sender_user_id, status, updated_at desc);
create index if not exists squish_proposals_item_idx
  on squish_trade_proposals (requested_item_id, status);

create table if not exists squish_trade_versions (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         uuid not null references squish_trade_proposals(id) on delete cascade,
  created_by_user_id  uuid not null references auth.users(id) on delete cascade,
  version_number      int not null,
  requested_item_id   uuid not null references squish_items(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (proposal_id, version_number)
);

create table if not exists squish_trade_version_items (
  version_id     uuid not null references squish_trade_versions(id) on delete cascade,
  item_id        uuid not null references squish_items(id) on delete cascade,
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  side           squish_side not null,
  primary key (version_id, item_id)
);

create table if not exists squish_trade_reports (
  id                  uuid primary key default gen_random_uuid(),
  proposal_id         uuid not null references squish_trade_proposals(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id    uuid not null references auth.users(id) on delete cascade,
  reason              text not null,
  details             text,
  status              text not null default 'open',
  created_at          timestamptz not null default now()
);

/* איזה טרייד נועל את הפריט. פריט יכול להיות נעול בטרייד אחד בלבד. */
alter table squish_items
  add column if not exists reserved_by_proposal_id uuid references squish_trade_proposals(id) on delete set null;

create index if not exists squish_items_reserved_idx
  on squish_items (reserved_by_proposal_id) where reserved_by_proposal_id is not null;

/* מה היה הסטטוס לפני שהפריט ננעל.
   בלי זה, ביטול היה צריך לנחש: להחזיר הכל ל"פתוח לטרייד" חושף פריט
   שהיא שמרה לעצמה, ולהחזיר הכל ל"שלי" מוריד בשקט פריט פתוח מלגלות. */
alter table squish_items
  add column if not exists pre_reserve_status squish_trade_status;

/* ── RLS ── */

alter table squish_trade_proposals    enable row level security;
alter table squish_trade_versions     enable row level security;
alter table squish_trade_version_items enable row level security;
alter table squish_trade_reports      enable row level security;

-- רק שני הצדדים רואים את ההצעה. אין צד שלישי, ואין קריאה פומבית.
drop policy if exists squish_trade_parties on squish_trade_proposals;
create policy squish_trade_parties on squish_trade_proposals
  for select using (sender_user_id = auth.uid() or receiver_user_id = auth.uid());

drop policy if exists squish_version_parties on squish_trade_versions;
create policy squish_version_parties on squish_trade_versions
  for select using (exists (
    select 1 from squish_trade_proposals p
     where p.id = proposal_id
       and (p.sender_user_id = auth.uid() or p.receiver_user_id = auth.uid())
  ));

drop policy if exists squish_version_item_parties on squish_trade_version_items;
create policy squish_version_item_parties on squish_trade_version_items
  for select using (exists (
    select 1 from squish_trade_versions v
      join squish_trade_proposals p on p.id = v.proposal_id
     where v.id = version_id
       and (p.sender_user_id = auth.uid() or p.receiver_user_id = auth.uid())
  ));

-- דיווח: רק המדווחת רואה את הדיווח שלה. אין חשיפה לצד השני.
drop policy if exists squish_report_mine on squish_trade_reports;
create policy squish_report_mine on squish_trade_reports
  for select using (reported_by_user_id = auth.uid());

/* ── כתיבה רק דרך פונקציות ──
   אין policy ל-insert/update/delete בכוונה: כל מעבר מצב עובר בפונקציה
   שמאמתת מי מבקשת, מה המצב הנוכחי, ומה מותר ממנו. סטטוס שמגיע מהלקוח
   לא נכתב לעולם. */

/* עוזר: הפריטים של הגרסה הנוכחית */
create or replace function squish_version_items(p_version uuid)
returns table (item_id uuid, owner_user_id uuid, side squish_side)
language sql stable security definer set search_path = public as $$
  select vi.item_id, vi.owner_user_id, vi.side
    from squish_trade_version_items vi where vi.version_id = p_version;
$$;

/** האם הפריט זמין להצעה או לשמירה */
create or replace function squish_item_available(p_item uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from squish_items i
     where i.id = p_item
       and i.deleted_at is null
       and i.trade_status not in ('reserved','traded','moved_to_duchan')
       and i.duchan_product_id is null
  );
$$;

/* ── שליחת הצעה ── */

create or replace function squish_send_proposal(
  p_requested uuid,
  p_offered   uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_owner    uuid;
  v_prop     uuid;
  v_version  uuid;
  v_item     uuid;
  v_ctx      text;
begin
  if v_me is null then raise exception 'not signed in'; end if;
  if p_offered is null or array_length(p_offered, 1) is null then
    raise exception 'offer at least one item';
  end if;
  if array_length(p_offered, 1) > 3 then raise exception 'at most three items'; end if;

  select owner_user_id into v_owner from squish_items
   where id = p_requested and deleted_at is null and trade_status = 'open_for_trade';
  if v_owner is null then raise exception 'item not open for trade'; end if;
  if v_owner = v_me then raise exception 'cannot trade with yourself'; end if;

  -- ההרשאה החברתית היא אותה הרשאה של הצפייה. אין דרך אחרת להגיע לפריט.
  if not squish_can_view(v_me, v_owner) then raise exception 'not in circle'; end if;

  -- שלושה פריטים פעילים לפחות, אחרת אין ממה להציע
  if squish_item_count(v_me) < 3 then raise exception 'need three items'; end if;

  foreach v_item in array p_offered loop
    if not exists (select 1 from squish_items where id = v_item and owner_user_id = v_me) then
      raise exception 'offered item is not yours';
    end if;
    if not squish_item_available(v_item) then raise exception 'offered item not available'; end if;
  end loop;

  select case
    when exists (select 1 from squish_connections c
                  where c.user_id = v_me and c.connected_user_id = v_owner
                    and c.status = 'active' and c.connection_type = 'direct_friend')
    then 'חברה שלי' else 'חברה של חברה' end into v_ctx;

  insert into squish_trade_proposals (sender_user_id, receiver_user_id, requested_item_id, status, connection_context)
  values (v_me, v_owner, p_requested, 'sent', v_ctx)
  returning id into v_prop;

  insert into squish_trade_versions (proposal_id, created_by_user_id, version_number, requested_item_id)
  values (v_prop, v_me, 1, p_requested)
  returning id into v_version;

  insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
  values (v_version, p_requested, v_owner, 'requested');
  foreach v_item in array p_offered loop
    insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
    values (v_version, v_item, v_me, 'offered');
  end loop;

  -- השולחת מאשרת את הגרסה שהיא עצמה יצרה
  update squish_trade_proposals
     set current_version_id = v_version,
         accepted_by_sender_at = now(),
         updated_at = now()
   where id = v_prop;

  return v_prop;
end $$;

/* ── נצפה ── */

create or replace function squish_mark_viewed(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update squish_trade_proposals
     set status = 'viewed', updated_at = now()
   where id = p_proposal and receiver_user_id = v_me and status = 'sent';
end $$;

/* ── הצעה נגדית ──
   **רק צמצום.** הפריטים חייבים להיות תת-קבוצה של מה שכבר הוצע בגרסה
   הנוכחית. המקבלת לא יכולה לבחור פריט אחר מהאוסף של השולחת, כי היא לא
   אמורה לראות פריטים שהשולחת לא בחרה להציע. */

create or replace function squish_counter_proposal(
  p_proposal uuid,
  p_keep     uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_prop    record;
  v_version uuid;
  v_num     int;
  v_item    uuid;
begin
  if v_me is null then raise exception 'not signed in'; end if;

  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status in ('completed','cancelled','declined','ready_for_whatsapp') then
    raise exception 'proposal is closed';
  end if;
  if p_keep is null or array_length(p_keep, 1) is null then
    raise exception 'keep at least one item';
  end if;

  -- כל פריט חייב להיות כבר בהצעה הנוכחית, בצד המוצע
  foreach v_item in array p_keep loop
    if not exists (
      select 1 from squish_trade_version_items vi
       where vi.version_id = v_prop.current_version_id
         and vi.item_id = v_item and vi.side = 'offered'
    ) then
      raise exception 'can only narrow the existing offer';
    end if;
  end loop;

  select coalesce(max(version_number), 0) + 1 into v_num
    from squish_trade_versions where proposal_id = p_proposal;

  insert into squish_trade_versions (proposal_id, created_by_user_id, version_number, requested_item_id)
  values (p_proposal, v_me, v_num, v_prop.requested_item_id)
  returning id into v_version;

  insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
  values (v_version, v_prop.requested_item_id, v_prop.receiver_user_id, 'requested');
  foreach v_item in array p_keep loop
    insert into squish_trade_version_items (version_id, item_id, owner_user_id, side)
    values (v_version, v_item, v_prop.sender_user_id, 'offered');
  end loop;

  -- גרסה חדשה מאפסת את שני האישורים, ומאשרת רק את מי שיצרה אותה
  update squish_trade_proposals
     set current_version_id = v_version,
         status = 'countered',
         accepted_by_sender_at   = case when v_me = sender_user_id   then now() else null end,
         accepted_by_receiver_at = case when v_me = receiver_user_id then now() else null end,
         updated_at = now()
   where id = p_proposal;

  return v_version;
end $$;

/* ── אישור הגרסה הנוכחית ── */

create or replace function squish_approve_version(p_proposal uuid, p_version uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  -- מאשרים גרסה מסוימת, לא "את ההצעה". אם הגרסה התחלפה בינתיים, האישור
  -- לא תופס — וזה בדיוק מה שמונע אישור של משהו שכבר השתנה.
  if v_prop.current_version_id is distinct from p_version then
    raise exception 'version changed';
  end if;
  if v_prop.status in ('completed','cancelled','declined') then
    raise exception 'proposal is closed';
  end if;

  update squish_trade_proposals
     set accepted_by_sender_at   = case when v_me = sender_user_id   then now() else accepted_by_sender_at end,
         accepted_by_receiver_at = case when v_me = receiver_user_id then now() else accepted_by_receiver_at end,
         updated_at = now()
   where id = p_proposal;

  select * into v_prop from squish_trade_proposals where id = p_proposal;
  if v_prop.accepted_by_sender_at is not null and v_prop.accepted_by_receiver_at is not null then
    update squish_trade_proposals set status = 'accepted', updated_at = now() where id = p_proposal;
    return 'accepted';
  end if;
  return 'waiting';
end $$;

/* ── דחייה ── */

create or replace function squish_decline_proposal(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update squish_trade_proposals
     set status = 'declined', updated_at = now()
   where id = p_proposal
     and receiver_user_id = v_me
     and status in ('sent','viewed','countered','accepted');
end $$;

/* ── שמירה אטומית ──
   הלב של השלב הזה. או שכל הפריטים ננעלים יחד, או ששום דבר. */

create or replace function squish_accept_and_reserve_trade(p_proposal uuid)
returns text
language plpgsql security definer set search_path = public as $$
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
  if v_prop.accepted_by_sender_at is null or v_prop.accepted_by_receiver_at is null then
    raise exception 'both sides must approve';
  end if;

  -- נועלים את כל שורות הפריטים לפני שבודקים אותן. בלי הנעילה הזו שני
  -- טריידים מקבילים היו יכולים לעבור את הבדיקה ואז לדרוס זה את זה.
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

  -- הצעות מתחרות שנוגעות באחד הפריטים כבר לא יכולות להתממש. מבטלים
  -- אותן במפורש במקום להשאיר אישור שייכשל בסוף.
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
end $$;

/* ── ביטול ומשחרר את השמירה ── */

create or replace function squish_cancel_trade(p_proposal uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status = 'completed' then raise exception 'already completed'; end if;

  -- הפריטים חוזרים בדיוק למצב שממנו הגיעו, לפי מה שנשמר בשמירה עצמה.
  -- הפריט המבוקש היה בהכרח פתוח לטרייד; המוצעים יכלו להיות גם "שלי",
  -- וביטול לא אמור לפתוח אותם לעולם בלי שהיא ביקשה.
  update squish_items
     set trade_status = coalesce(
           pre_reserve_status,
           case when id = v_prop.requested_item_id
                then 'open_for_trade'::squish_trade_status
                else 'keep'::squish_trade_status end),
         pre_reserve_status = null,
         reserved_by_proposal_id = null,
         updated_at = now()
   where reserved_by_proposal_id = p_proposal;

  update squish_trade_proposals
     set status = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(p_reason, 'other'), updated_at = now()
   where id = p_proposal;
end $$;

/* ── אישור הורה לפני וואטסאפ ── */

create or replace function squish_ack_parent(p_proposal uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  update squish_trade_proposals
     set parent_ack_sender_at   = case when v_me = sender_user_id   then now() else parent_ack_sender_at end,
         parent_ack_receiver_at = case when v_me = receiver_user_id then now() else parent_ack_receiver_at end,
         updated_at = now()
   where id = p_proposal and (sender_user_id = v_me or receiver_user_id = v_me);
end $$;

/* ── השלמה ── */

create or replace function squish_confirm_completion(p_proposal uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prop record;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal for update;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  if v_prop.status <> 'ready_for_whatsapp' and v_prop.status <> 'completed' then
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

  -- שני הצדדים אישרו: הפריטים עוברים ל"הוחלף" ויורדים מלגלות
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
end $$;

/* ── דיווח על בעיה ── */

create or replace function squish_report_trade(p_proposal uuid, p_reason text, p_details text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_prop  record;
  v_other uuid;
begin
  select * into v_prop from squish_trade_proposals where id = p_proposal;
  if v_prop is null then raise exception 'proposal not found'; end if;
  if v_me not in (v_prop.sender_user_id, v_prop.receiver_user_id) then
    raise exception 'not your proposal';
  end if;
  v_other := case when v_me = v_prop.sender_user_id then v_prop.receiver_user_id else v_prop.sender_user_id end;

  insert into squish_trade_reports (proposal_id, reported_by_user_id, reported_user_id, reason, details)
  values (p_proposal, v_me, v_other, coalesce(p_reason, 'other'), p_details);

  -- טרייד עם דיווח פתוח לא נסגר בשקט כ"הושלם"
  update squish_trade_proposals
     set status = 'reported', updated_at = now()
   where id = p_proposal and status <> 'completed';
end $$;

/* ── דוכן וסקוויש לא יכולים לסתור ──
   פריט ששמור בטרייד לא יעבור לדוכן, ופריט שכבר בדוכן לא יישמר. */

create or replace function squish_guard_duchan_transfer()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.duchan_product_id is not null and old.duchan_product_id is null then
    if old.trade_status = 'reserved' then
      raise exception 'item reserved in trade';
    end if;
    -- הצעות פתוחות על הפריט מתבטלות: אי אפשר להציע משהו שנמכר
    update squish_trade_proposals p
       set status = 'cancelled', cancelled_at = now(),
           cancel_reason = 'item_unavailable', updated_at = now()
     where p.status in ('sent','viewed','countered','accepted')
       and exists (
         select 1 from squish_trade_version_items vi
          where vi.version_id = p.current_version_id and vi.item_id = new.id
       );
  end if;
  return new;
end $$;

drop trigger if exists squish_duchan_guard on squish_items;
create trigger squish_duchan_guard
  before update on squish_items
  for each row execute function squish_guard_duchan_transfer();

/* ── הרשאות ── */

do $$ begin
  grant all on squish_trade_proposals, squish_trade_versions,
                squish_trade_version_items, squish_trade_reports to service_role;
exception when undefined_object then null; end $$;

do $$ begin
  grant select on squish_trade_proposals, squish_trade_versions,
                  squish_trade_version_items, squish_trade_reports to authenticated;
exception when undefined_object then null; end $$;

do $$ begin
  grant execute on function squish_send_proposal(uuid, uuid[])        to authenticated;
  grant execute on function squish_mark_viewed(uuid)                   to authenticated;
  grant execute on function squish_counter_proposal(uuid, uuid[])      to authenticated;
  grant execute on function squish_approve_version(uuid, uuid)         to authenticated;
  grant execute on function squish_decline_proposal(uuid)              to authenticated;
  grant execute on function squish_accept_and_reserve_trade(uuid)      to authenticated;
  grant execute on function squish_cancel_trade(uuid, text)            to authenticated;
  grant execute on function squish_ack_parent(uuid)                    to authenticated;
  grant execute on function squish_confirm_completion(uuid)            to authenticated;
  grant execute on function squish_report_trade(uuid, text, text)      to authenticated;
  grant execute on function squish_item_available(uuid)                to authenticated, service_role;
  grant execute on function squish_version_items(uuid)                 to authenticated, service_role;
exception when undefined_object then null; end $$;
