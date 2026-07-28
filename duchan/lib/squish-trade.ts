/**
 * טריידים — טיפוסים, תוויות, וההשוואה העובדתית.
 */

import type { SquishItem, SquishyType, Wish } from "./squish";
import { conditionLabel, sizeLabel, typeLabel } from "./squish";

export type ProposalStatus =
  | "draft" | "sent" | "viewed" | "countered" | "accepted"
  | "ready_for_whatsapp" | "completed" | "declined" | "cancelled" | "reported";

export interface TradeItem {
  id: string;
  name: string;
  squishy_type: SquishyType;
  custom_type: string | null;
  size: SquishItem["size"];
  condition: SquishItem["condition"];
  image_key: string | null;
  video_key: string | null;
  poster_key: string | null;
}

export interface Trade {
  id: string;
  role: "sender" | "receiver";
  status: ProposalStatus;
  other: { nickname: string; code: string | null };
  connection_context: string | null;
  version_id: string;
  requested: TradeItem;
  offered: TradeItem[];
  iApproved: boolean;
  theyApproved: boolean;
  iConfirmedDone: boolean;
  theyConfirmedDone: boolean;
  parentAck: boolean;
  updated_at: string;
}

export const CANCEL_REASONS = [
  { key: "changed_mind", label: "שיניתי את דעתי" },
  { key: "item_unavailable", label: "אחד הפריטים כבר לא זמין" },
  { key: "no_meeting", label: "לא הצלחנו לתאם" },
  { key: "other", label: "סיבה אחרת" },
];

export const REPORT_REASONS = [
  { key: "not_as_described", label: "הפריט לא תאם לתיאור" },
  { key: "did_not_happen", label: "הטרייד לא התקיים" },
  { key: "no_contact", label: "לא הצלחתי ליצור קשר" },
  { key: "unpleasant", label: "הייתה התנהגות לא נעימה" },
  { key: "other", label: "בעיה אחרת" },
];

/**
 * הנחיה עובדתית, לא ציון.
 *
 * אין כאן אחוז הוגנות, אין הערכת שווי, ואין מנצחת. רק עובדות שאפשר
 * לקרוא מהפריטים עצמם — ובסוף תמיד המשפט שאומר שההחלטה שלהן.
 */
export function compareOffer(
  requested: Pick<SquishItem, "size" | "condition" | "squishy_type" | "wanted_description">,
  offered: Pick<SquishItem, "size" | "condition" | "squishy_type">[],
  receiverWishes: Wish[] = []
): string[] {
  const notes: string[] = [];
  const rank = { new: 5, like_new: 4, good: 3, used: 2, flawed: 1 } as const;

  if (offered.length > 1) notes.push(`את מציעה ${offered.length} סקווישים מול אחד.`);

  const worse = offered.filter((o) => rank[o.condition] < rank[requested.condition]);
  if (worse.length) {
    notes.push(
      `הסקווישי שאת מבקשת מסומן "${conditionLabel(requested.condition)}", ` +
        `ואחד הפריטים שאת מציעה מסומן "${conditionLabel(worse[0].condition)}".`
    );
  } else if (offered.every((o) => o.condition === requested.condition)) {
    notes.push("הפריטים במצב דומה.");
  }

  if (offered.every((o) => o.size === requested.size)) notes.push("גם הגודל דומה.");

  // מה שהמקבלת סימנה שהיא מחפשת
  const wantedTypes = new Set(receiverWishes.map((w) => w.squishy_type).filter(Boolean));
  const match = offered.find((o) => wantedTypes.has(o.squishy_type));
  if (match) {
    notes.push(`היא מחפשת סקווישים מסוג ${typeLabel(match.squishy_type)}, ויש אחד כזה בהצעה שלך.`);
  }
  if (requested.wanted_description) {
    notes.push(`על הפריט הזה היא כתבה: "${requested.wanted_description}".`);
  }
  if (!notes.length) notes.push("אין כאן שום דבר חריג בהשוואה.");
  return notes;
}

export const itemLine = (i: TradeItem) =>
  `${i.name} (${[typeLabel(i.squishy_type), sizeLabel(i.size), conditionLabel(i.condition)]
    .filter(Boolean)
    .join(", ")})`;

export type { SquishEvent } from "./squish-analytics";
export { track } from "./squish-analytics";
