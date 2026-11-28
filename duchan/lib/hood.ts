/**
 * השוק של השכונה (0077). עזרים משותפים לשרת ולדפדפן.
 *
 * מפתח השם: "שכונת הדקלים", "הדקלים" ו"ש' הדקלים" הם אותה שכונה. משמש
 * לאיחוד ולמניעת כפילויות, אף פעם לא לתצוגה.
 */
import { placeKey } from "./localities";

export function hoodKey(name: string): string {
  return placeKey(name)
    .replace(/^(שכונת|שכ)\s+/, "")
    .replace(/[֑-ׇ]/g, "") // ניקוד וטעמים
    .replace(/\s+/g, " ")
    .trim();
}

/** שם לתצוגה: רווחים מסודרים, בלי תווים מוזרים. מה שההורה כתב, נקי. */
export function cleanHoodName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[‎‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/[<>{}[\]\\|@#$%^*=+~`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** "הדקלים" → "שכונת הדקלים". מה שכבר מתחיל ב"שכונת" או ב"נווה" וכד' נשאר */
export function hoodTitle(name: string): string {
  return /^(שכונת|שכ'|נווה|נוה|רמת|גבעת|קרית|קריית|מתחם|רובע)/.test(name) ? name : `שכונת ${name}`;
}

export type HoodState = "none" | "parent" | "review" | "active" | "rejected" | "left";

export type HoodStall = {
  slug: string;
  name: string;
  emoji: string | null;
  avatar_key: string | null;
  away: boolean;
  mine: boolean;
  products: { name: string; price: number; image_key: string | null }[];
};
