// "המסע שלי" — ציוני דרך אמיתיים, מחושבים מהנתונים הקיימים.
// אין טבלה חדשה ואין מצב לתחזק: כל אבן דרך היא פונקציה על המספרים.
// לא גיימיפיקציה — דברים שילדה באמת גאה בהם ומראה להורים.

export interface StoreStats {
  products: number;
  orders: number;
  paidOrders: number;
  revenue: number;
  views: number;
}

export interface Milestone {
  key: string;
  emoji: string;
  title: string;
  hint: string;      // מה צריך לעשות כדי להשיג
  lesson: string;    // מה למדת, זה הלב של הרעיון
  reached: boolean;
  progress: number;  // 0..1
}

export function milestones(s: StoreStats): Milestone[] {
  const m = (
    key: string, emoji: string, title: string, hint: string, lesson: string,
    have: number, need: number
  ): Milestone => ({
    key, emoji, title, hint, lesson,
    reached: have >= need,
    progress: Math.min(1, need === 0 ? 1 : have / need),
  });

  return [
    m("first_product", "📸", "המוצר הראשון",
      "מוסיפים מוצר אחד לחנות",
      "העלית מוצר למכירה, זה הצעד שרוב האנשים לא עושים אף פעם.",
      s.products, 1),

    m("five_products", "🛍️", "חמישה מוצרים",
      "עוד ארבעה מוצרים ויש לך מבחר",
      "מבחר גדול יותר = יותר סיכוי שמישהי תמצא משהו בשבילה.",
      s.products, 5),

    m("first_visitors", "👀", "עשר כניסות לחנות",
      "שולחים את הלינק לעוד חברות",
      "בלי שאנשים יראו את החנות, אין מכירות. שיווק זה חצי מהעסק.",
      s.views, 10),

    m("first_order", "💌", "ההזמנה הראשונה",
      "מישהי תזמין דרך הלינק שלך",
      "מישהי בחרה לקנות ממך. זה אומר שהמחיר והמוצר עבדו.",
      s.orders, 1),

    m("first_sale", "💰", "המכירה הראשונה",
      'מסמנים הזמנה כ"שולם"',
      "הרווחת כסף אמיתי ממשהו שיצרת או מצאת. זו יזמות.",
      s.paidOrders, 1),

    m("hundred_shekel", "💯", "מאה שקלים",
      "עוד כמה מכירות ואת שם",
      "₪100 זה לא סכום קטן, זה עסק שעובד, לא מזל.",
      s.revenue, 100),

    m("ten_orders", "🔟", "עשר הזמנות",
      "לקוחות חוזרות זה הסוד",
      "עשר הזמנות אומרות שזה לא היה חד-פעמי. יש לך לקוחות.",
      s.orders, 10),
  ];
}

/** אבן הדרך הבאה — זו שמוצגת בגדול בדשבורד */
export function nextMilestone(list: Milestone[]): Milestone | null {
  return list.find((x) => !x.reached) ?? null;
}

export function reachedCount(list: Milestone[]): number {
  return list.filter((x) => x.reached).length;
}
