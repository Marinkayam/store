-- 0040 — סוגרים גרנטים של פונקציות שהיו פתוחות לציבור.
--
-- מה נמצא (באודיט מול פרודקשן, אחרי שהמכסה של 0039 עלתה "פתוחה"):
-- פוסטגרס נותן EXECUTE ל-PUBLIC על כל פונקציה חדשה, וסופרבייס מוסיף
-- default privileges ל-anon ול-authenticated. `revoke ... from public`
-- לא מוריד גרנט ישיר, ו-`revoke ... from authenticated` לא מוריד את
-- הגרנט של PUBLIC — צריך את שלושתם. בגלל זה פונקציות שנכתבו כ"שרת
-- בלבד" היו ניתנות לקריאה מכל דפדפן דרך PostgREST:
--
--   use_ai_credit / refund_ai_credit  — שריפת קרדיטים של כל חנות,
--                                       או הנפקת קרדיטים בחינם
--   squish_pilot_start / reset        — reset מוחק פרופיל ופריטים
--   squish_claim_pilot_token          — שיוך טוקן לכל משתמשת
--   squish_rate_ok                    — שריפת מכסת פעולות של אחרת
--   squish_admin_suspend / restore / cancel_trade — 0030 עשה revoke
--                                       מ-anon/authenticated אבל לא
--                                       מ-PUBLIC, אז הן נשארו פתוחות
--
-- כולן נקראות רק מהשרת עם service_role. מה שנשאר פתוח בכוונה:
-- העוזרות של ה-RLS (squish_can_view וכו' — הפוליסות מריצות אותן בתור
-- התפקיד ששואל), ומוני הצפיות (bump_ref_click, squish_invite_click,
-- squish_invite_state) שדפים ציבוריים צריכים.
--
-- הוחל ידנית על פרודקשן ב-2026-07-30 ואומת מול pg_proc.proacl.

do $$ begin
  revoke execute on function use_ai_credit(uuid)                       from public, anon, authenticated;
  revoke execute on function refund_ai_credit(uuid)                    from public, anon, authenticated;
  grant  execute on function use_ai_credit(uuid)                       to service_role;
  grant  execute on function refund_ai_credit(uuid)                    to service_role;
exception when undefined_function then null; end $$;

do $$ begin
  revoke execute on function squish_pilot_start(uuid, text)            from public, anon, authenticated;
  revoke execute on function squish_pilot_reset(uuid, text)            from public, anon, authenticated;
  revoke execute on function squish_claim_pilot_token(text, uuid)      from public, anon, authenticated;
  revoke execute on function squish_rate_ok(uuid, text)                from public, anon, authenticated;
  grant  execute on function squish_pilot_start(uuid, text)            to service_role;
  grant  execute on function squish_pilot_reset(uuid, text)            to service_role;
  grant  execute on function squish_claim_pilot_token(text, uuid)      to service_role;
  grant  execute on function squish_rate_ok(uuid, text)                to service_role;
exception when undefined_function then null; end $$;

do $$ begin
  revoke execute on function squish_admin_suspend(uuid, text, text)      from public, anon, authenticated;
  revoke execute on function squish_admin_restore(uuid, text)            from public, anon, authenticated;
  revoke execute on function squish_admin_cancel_trade(uuid, text, text) from public, anon, authenticated;
  grant  execute on function squish_admin_suspend(uuid, text, text)      to service_role;
  grant  execute on function squish_admin_restore(uuid, text)            to service_role;
  grant  execute on function squish_admin_cancel_trade(uuid, text, text) to service_role;
exception when undefined_function then null; end $$;

do $$ begin
  revoke execute on function squish_use_ai(uuid) from public, anon, authenticated;
  grant  execute on function squish_use_ai(uuid) to service_role;
exception when undefined_function then null; end $$;
