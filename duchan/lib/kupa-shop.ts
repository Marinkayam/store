import type { IconName } from "@/app/icons";

/**
 * חנות הקישוטים של הקופה (0059 kupa_purchases).
 *
 * רק קישוטים, ורק דברים שרואים: בציור הדוכן בקופה, ו"קונפטי לקונים" גם
 * בדוכן עצמו. מטבעות לא קונים מוצרים, הנחות או קידום, ואי אפשר לקנות
 * מטבעות בכסף. כל מה שכבר חינם (ערכות, סגנונות, רקעים) נשאר חינם.
 *
 * סוכך: בוחרים צבע אחד (equipped). שאר הקישוטים — קונים פעם אחת והם שם.
 */
export type ShopKey = "awning_olive" | "awning_blush" | "awning_gold" | "flowers" | "open_sign" | "cat" | "confetti";
export type AwningColor = "lavender" | "olive" | "blush" | "gold";

export interface ShopItem {
  key: ShopKey;
  title: string;
  price: number;
  /** איפה רואים את זה — כתוב בכרטיס, כדי שלא תהיה הפתעה */
  where: string;
  icon: IconName;
  awning?: AwningColor;
}

export const SHOP: ShopItem[] = [
  { key: "flowers", title: "עציץ פרחים", price: 30, where: "ליד הדוכן בציור", icon: "plant" },
  { key: "awning_olive", title: "סוכך זית", price: 40, where: "הסוכך, השמשייה והבד בציור", icon: "palette", awning: "olive" },
  { key: "awning_blush", title: "סוכך ורוד", price: 40, where: "הסוכך, השמשייה והבד בציור", icon: "palette", awning: "blush" },
  { key: "open_sign", title: "שלט \"פתוח!\"", price: 50, where: "תלוי על העמוד בציור", icon: "shop" },
  { key: "confetti", title: "קונפטי לקונים", price: 60, where: "בדוכן: מי שמזמין/ה מקבל/ת קונפטי", icon: "party" },
  { key: "cat", title: "חתול של הדוכן", price: 120, where: "יושב ליד הדוכן בציור, ומנפנף בזנב", icon: "heart" },
  { key: "awning_gold", title: "סוכך זהב", price: 250, where: "הסוכך, השמשייה והבד בציור", icon: "star", awning: "gold" },
];

export const AWNING_FILL: Record<AwningColor, string> = {
  lavender: "var(--lavender)",
  olive: "var(--olive)",
  blush: "#E9B8BF",
  gold: "#E3C26F",
};

export function shopItem(key: string): ShopItem | null {
  return SHOP.find((i) => i.key === key) ?? null;
}

/** מה מוצג בציור: צבע הסוכך הנבחר וקישוטים שנקנו */
export interface Deco {
  awning: AwningColor;
  flowers: boolean;
  openSign: boolean;
  cat: boolean;
}

export function decoFrom(purchases: { item_key: string; equipped: boolean }[]): Deco {
  const has = (k: ShopKey) => purchases.some((p) => p.item_key === k);
  const eq = purchases.find((p) => p.equipped && shopItem(p.item_key)?.awning);
  return {
    awning: (eq && shopItem(eq.item_key)?.awning) || "lavender",
    flowers: has("flowers"),
    openSign: has("open_sign"),
    cat: has("cat"),
  };
}
