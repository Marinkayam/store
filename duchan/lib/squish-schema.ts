/**
 * מה הקוד הזה מצפה למצוא בדאטהבייס.
 *
 * **למה הקובץ הזה קיים:** הקוד של המדבקות עלה לפרודקשן 43 דקות לפני
 * שהעמודה `squish_items.stickers` נוצרה שם. במשך שש שעות כל ניסיון
 * לבנות אוסף נכשל — והנפילה נבלעה ב-catch שכתב לקונסולה. אף אחת לא
 * ידעה, כי `schema_migrations` הוא רישום של מה שהרצנו, לא של מה שקיים.
 *
 * מכאן והלאה הציפייה כתובה במקום אחד, נבדקת מול הסכמה *עצמה*, ומוצגת
 * למנהלת כשהיא לא מתקיימת.
 *
 * שדה שנכנס לרשימה `optional` הוא שדה שאפשר לשמור פריט בלעדיו — הוא
 * מאבד תכונה, לא את הפריט. שדה שאינו שם הוא שדה שבלעדיו אין טעם
 * לשמור, ולכן לעולם לא נוותר עליו בשקט.
 */

export interface SchemaExpectation {
  /** עמודות שחייבות להתקיים, לפי טבלה */
  columns: Record<string, string[]>;
  /** פונקציות שחייבות להתקיים */
  functions: string[];
}

/**
 * שדות אופציונליים בכתיבת פריט.
 *
 * רק אלה מותרים בנפילה חוזרת אם הדאטהבייס מדווח שהעמודה לא מוכרת.
 * `stickers` היא דעה של הילדה על הפריט; `series` היא שם סדרה. בלי
 * שתיהן הפריט עדיין הפריט. שם, תמונה, בעלות ומצב טרייד — לא כאן,
 * ולעולם לא יוסרו כדי "להצליח".
 */
export const OPTIONAL_ITEM_FIELDS = ["stickers", "series", "description"] as const;
export type OptionalItemField = (typeof OPTIONAL_ITEM_FIELDS)[number];

export const SQUISH_SCHEMA: SchemaExpectation = {
  columns: {
    squish_items: [
      "id", "owner_user_id", "profile_id", "name", "squishy_type", "custom_type",
      "size", "condition", "condition_note", "trade_status", "wanted_description",
      "image_key", "video_key", "poster_key", "sort_order", "deleted_at",
      "series", "duchan_product_id",
      // 0031
      "stickers",
      // 0028
      "pre_reserve_status", "reserved_by_proposal_id",
    ],
    squish_profiles: [
      "id", "user_id", "nickname", "collection_code", "collection_title",
      "collection_visibility", "favorite_item_id", "suspended_at",
      "general_city", "parent_awareness_at", "parent_awareness_version",
    ],
    squish_invites: [
      "code", "inviter_user_id", "clicks",
      // 0032
      "label", "expires_at", "revoked_at", "max_uses", "uses",
    ],
    squish_connections: [
      "user_id", "connected_user_id", "connection_type", "status",
      "invited_by_user_id",
      // 0032
      "removed_at",
    ],
  },
  functions: [
    "squish_can_view", "squish_is_blocked", "squish_item_count",
    "squish_join", "squish_send_proposal", "squish_accept_and_reserve_trade",
    "squish_cancel_trade", "squish_confirm_completion", "squish_block_user",
    "squish_delete_profile",
    // 0032
    "squish_invite_state", "squish_revoke_invite",
    // 0033 / 0034 — נוספו כשפה, עדיין לא בשימוש
    "squish_relation", "squish_can_view_collection", "squish_can_view_item",
    "squish_can_trade",
  ],
};

/** האם השגיאה הזו אומרת "אין עמודה כזו", ואם כן — איזו. */
export function unknownColumn(message: string | undefined): string | null {
  if (!message) return null;
  // PostgREST: "Could not find the 'stickers' column of 'squish_items' in the schema cache"
  const rest = message.match(/could not find the '([a-z_]+)' column/i);
  if (rest) return rest[1];
  // Postgres 42703: "column \"stickers\" of relation \"squish_items\" does not exist"
  const pg = message.match(/column "([a-z_]+)" (?:of relation "[a-z_]+" )?does not exist/i);
  if (pg) return pg[1];
  return null;
}
