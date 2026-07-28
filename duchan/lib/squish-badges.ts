import { SQUISH_TYPES, type SquishItem, type SquishyType } from "./squish";

/**
 * התגים של האוסף.
 *
 * הכל נגזר מהאוסף בזמן אמת ולא נשמר בטבלה. תג שנשמר הופך לשקר ברגע
 * שפריט נמחק — ופה זה קריטי, כי התג הוא מה שהילדה מראה לחברה.
 *
 * שלושה כללים:
 * 1. **כל תג אמיתי.** אין נדירות מומצאת, אין אחוזי השלמה מול קטלוג
 *    שלא קיים, ואין "12 מתוך 20" כשאף אחד לא יודע כמה יש בעולם.
 * 2. **אין לחץ יומי.** אין רצפים, אין "100 ימים ברצף", ואין דבר
 *    שמעניש על יום שלא נכנסו.
 * 3. **אין השוואה בין ילדות.** אין דירוג, אין טבלת מובילות.
 */

export interface Badge {
  key: string;
  label: string;
  hint: string;
  earned: boolean;
  /** כמה יש עכשיו מתוך כמה צריך — לפס ההתקדמות */
  have: number;
  need: number;
  /** תג שעוד לא ניתן להשיג בשלב הזה של המוצר */
  locked?: boolean;
}

export interface BadgeInput {
  items: SquishItem[];
  /** כמה חברות הצטרפו דרך קישור ההזמנה שלה */
  joinedViaInvite?: number;
  completedTrades?: number;
}

export function collectionBadges({
  items,
  joinedViaInvite = 0,
  completedTrades = 0,
}: BadgeInput): Badge[] {
  const live = items.filter((i) => i.trade_status !== "moved_to_duchan");
  const open = live.filter((i) => i.trade_status === "open_for_trade").length;

  const out: Badge[] = [
    {
      key: "first-collection",
      label: "האוסף הראשון",
      hint: "שלושה סקווישים באוסף",
      earned: live.length >= 3,
      have: Math.min(live.length, 3),
      need: 3,
    },
    {
      key: "starter",
      label: "אספנית מתחילה",
      hint: "עשרה סקווישים באוסף",
      earned: live.length >= 10,
      have: Math.min(live.length, 10),
      need: 10,
    },
  ];

  // תג לכל סוג שיש ממנו חמישה. מופיע רק כשיש לפחות אחד מהסוג הזה,
  // אחרת המסך מתמלא בתגים נעולים של סוגים שהיא לא אוספת בכלל.
  for (const type of SQUISH_TYPES) {
    if (type.key === "other") continue;
    const n = live.filter((i) => i.squishy_type === type.key).length;
    if (!n) continue;
    out.push({
      key: `type-${type.key}`,
      label: `אספנית ${type.label}`,
      hint: `חמישה מסוג ${type.label}`,
      earned: n >= 5,
      have: Math.min(n, 5),
      need: 5,
    });
  }

  out.push(
    {
      key: "open-for-trade",
      label: "פתוחה לטרייד",
      hint: "שלושה פריטים פתוחים לטרייד",
      earned: open >= 3,
      have: Math.min(open, 3),
      need: 3,
    },
    {
      key: "club-friend",
      label: "חברה במועדון",
      hint: "חברה אחת הצטרפה דרך ההזמנה שלך",
      earned: joinedViaInvite >= 1,
      have: Math.min(joinedViaInvite, 1),
      need: 1,
    },
    {
      key: "first-trade",
      label: "טרייד ראשון",
      hint: "ייפתח אחרי הטרייד הראשון שתשלימי",
      earned: completedTrades >= 1,
      have: Math.min(completedTrades, 1),
      need: 1,
      locked: completedTrades < 1,
    }
  );

  return out;
}

/**
 * כמה יש מכל סוג. בלי אחוזים ובלי "מתוך" — אין קטלוג אמיתי של כמה
 * סקווישים קיימים בעולם, וכל מספר כזה יהיה מומצא.
 */
export function byType(items: SquishItem[]): { key: SquishyType; label: string; n: number }[] {
  const live = items.filter((i) => i.trade_status !== "moved_to_duchan");
  return SQUISH_TYPES.map((t) => ({
    key: t.key,
    label: t.label,
    n: live.filter((i) => i.squishy_type === t.key).length,
  }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n);
}

/** סדרות שהילדה הגדירה בעצמה. */
export function bySeries(items: SquishItem[]): { name: string; n: number }[] {
  const live = items.filter((i) => i.trade_status !== "moved_to_duchan");
  const map = new Map<string, number>();
  for (const i of live) {
    const s = i.series?.trim();
    if (s) map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
}

/** סיכום האוסף — ארבעה מספרים אמיתיים, לא אנליטיקס. */
export function summary(items: SquishItem[]) {
  const live = items.filter((i) => i.trade_status !== "moved_to_duchan");
  const monthAgo = Date.now() - 30 * 86_400_000;
  return {
    total: live.length,
    open: live.filter((i) => i.trade_status === "open_for_trade").length,
    types: new Set(live.map((i) => i.squishy_type)).size,
    thisMonth: live.filter((i) => new Date(i.created_at).getTime() >= monthAgo).length,
    withVideo: live.filter((i) => !!i.video_key).length,
  };
}

/** התג הבא שאפשר להשיג — מה שגורם להוסיף עוד סקווישי. */
export function nextBadge(badges: Badge[]): Badge | null {
  return (
    badges
      .filter((b) => !b.earned && !b.locked)
      .sort((a, b) => b.have / b.need - a.have / a.need)[0] ?? null
  );
}
