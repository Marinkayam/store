-- 0067 — בדיקות הקשר בין שתי משתמשות לא פתוחות לדפדפן
--
-- squish_relation ו-squish_is_blocked החזירו לכל מי שמחזיק שני מזהי משתמש
-- אם הן חברות, חסומות או מושעות — בניגוד ל"מי שנחסמה לא יודעת". הן נקראות
-- רק מתוך פונקציות SECURITY DEFINER אחרות ומקוד השרת (service role), ולא
-- מאף מדיניות RLS, ולכן אפשר לסגור אותן בלי לשבור כלום.

revoke execute on function squish_relation(uuid, uuid)   from public, anon, authenticated;
revoke execute on function squish_is_blocked(uuid, uuid) from public, anon, authenticated;
