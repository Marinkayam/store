/**
 * בנק ההודעות. הילדה לא צריכה להמציא ניסוח — היא בוחרת, עורכת אם בא לה, ושולחת.
 *
 * הכללים לכל טקסט כאן:
 * - קצר. מה שלא נכנס למסך אחד לא נשלח.
 * - בלי סופרלטיבים ובלי שפת מבוגרים ("מבצע השקה", "אל תפספסו").
 * - תמיד עם קריאה לפעולה אחת בלבד ועם הלינק בסוף.
 * - בלי שם מלא, בלי כיתה, בלי בית ספר — אותם כללי בטיחות כמו בכל המוצר.
 */

export interface ShareContext {
  name: string;
  link: string;
  products: number;
  topProduct?: string | null;
}

export interface ShareText {
  key: string;
  label: string;
  icon: string;
  /** למי זה מיועד — כדי שהיא תבחר לפי המצב ולא לפי הניסוח */
  when: string;
  build: (c: ShareContext) => string;
}

export const SHARE_TEXTS: ShareText[] = [
  {
    key: "launch",
    label: "פתחתי דוכן",
    icon: "🎉",
    when: "ההודעה הראשונה, לקבוצה של הכיתה",
    build: (c) =>
      `פתחתי דוכן אמיתי באינטרנט 🛍️\n` +
      `קוראים לו ${c.name}${c.products > 1 ? `, ויש בפנים ${c.products} דברים` : ""}.\n` +
      `בואו תראו מה יש 👀\n${c.link}`,
  },
  {
    key: "friend",
    label: "הודעה אישית",
    icon: "💛",
    when: "שיחה אישית, לא קבוצה",
    build: (c) =>
      `היי! בניתי לי דוכן 🙂\n` +
      `יש שם דברים למכירה${c.topProduct ? `, בעיקר ${c.topProduct}` : ""}.\n` +
      `מה דעתך?\n${c.link}`,
  },
  {
    key: "new",
    label: "הוספתי מוצרים",
    icon: "✨",
    when: "אחרי שהעלית משהו חדש",
    build: (c) =>
      `הוספתי דברים חדשים לדוכן 👇\n` +
      `${c.name}\n${c.link}\n` +
      `שווה להציץ 👀`,
  },
  {
    key: "story",
    label: "לסטורי",
    icon: "📸",
    when: "אינסטגרם או סטטוס וואטסאפ",
    build: (c) => `הדוכן שלי פתוח 🛍️\n${c.name}\nלינק בסטורי 👆\n${c.link}`,
  },
  {
    key: "last",
    label: "נשארו אחרונים",
    icon: "⏳",
    when: "כשהמלאי כמעט נגמר",
    build: (c) =>
      `${c.topProduct ? `נשארו לי אחרונים מ${c.topProduct}` : "נשארו אחרונים במלאי"} 👀\n` +
      `מי שרוצה, כאן:\n${c.link}`,
  },
  {
    key: "family",
    label: "למשפחה",
    icon: "👵",
    when: "לסבתא, לדודות, לקבוצה המשפחתית",
    build: (c) =>
      `היי! פתחתי דוכן קטן משלי 🛍️\n` +
      `הכל שלי, אני בחרתי, צילמתי ותמחרתי.\n` +
      `אשמח אם תסתכלו:\n${c.link}`,
  },
];

/** הודעה מוכנה גם למי שרוצה לפתוח חנות בעקבותיה — זו הלולאה של הרשת. */
export const inviteText = (c: ShareContext, refLink: string) =>
  `בניתי דוכן אמיתי באינטרנט 🛍️\n` +
  `אם גם לך יש דברים למכור, סקווישים, צמידים, בגדים שקטנו, אפשר לפתוח אחד בכמה דקות:\n` +
  refLink;
