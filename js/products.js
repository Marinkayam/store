/* ==========================================================================
   רשימת המוצרים של אקרו־שופ
   ==========================================================================
   השמות והתיאורים נכתבו בעברית נקייה (במקום התרגום האוטומטי של אלי אקספרס).
   שדה image ריק כרגע ולכן מוצג אייקון; כשמריצים את tools/aliexpress-sync.mjs
   הוא ממלא אוטומטית גם את תמונות המוצר האמיתיות.
   ========================================================================== */

const CATEGORIES = [
  { id: "all",      label: "הכל ✨" },
  { id: "hair",     label: "שיער 🎀" },
  { id: "clothing", label: "ביגוד וגרביים 🧦" },
  { id: "training", label: "אימון וכוח 💪" },
  { id: "gear",     label: "ציוד ואביזרים 🎒" },
];

const PRODUCTS = [
  {
    name: "מסרק אנטי־סטטי לאיסוף שיער",
    desc: "מסרק עדין ואנטי־סטטי לאיסוף חלק ומדויק של השיער לפני קוקו או בייגלה.",
    category: "hair",
    emoji: "🪮",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c4KvS24z",
  },
  {
    name: "סט סיכות U ובובי פינס (45 יח')",
    desc: "מארז משולב: סיכות U לקיבוע הבייגלה ובובי פינס להצמדת שערות סוררות.",
    category: "hair",
    emoji: "🔱",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c4dIjTAd",
  },
  {
    name: "רשתות שיער לבייגלה (שחור / בז')",
    desc: "רשתות ניילון דקות שמחזיקות את הבייגלה מסודר ויציב לאורך כל האימון.",
    category: "hair",
    emoji: "🕸️",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3ckWI6D",
  },
  {
    name: "בובי פינס – סיכות שיער (50 יח')",
    desc: "מארז גדול של סיכות חזקות להצמדת כל שערה במקום, לפני עלייה למזרן.",
    category: "hair",
    emoji: "📍",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c4MtYuVJ",
  },
  {
    name: "מברשת לקצוות ולהחלקת שיער",
    desc: "מברשת קטנה להחלקת קצוות ושערות עדינות, לגימור מסודר ונקי.",
    category: "hair",
    emoji: "🖌️",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3eZaaAh",
  },
  {
    name: "גרביים דקות ונושמות (10 זוגות)",
    desc: "גרביים נמוכות, דקות ונושמות — נוחות לאימונים ולכל היום.",
    category: "clothing",
    emoji: "🧦",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3LiUSbx",
  },
  {
    name: "טייפ קינזיו לתמיכה בברך",
    desc: "סרט קינזיו אלסטי לתמיכה וייצוב הברך בזמן תרגול ותחרות.",
    category: "training",
    emoji: "🩹",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c2vLQEVP",
  },
  {
    name: "מברשת להחלקת קוקו ושערות סוררות",
    desc: "מברשת ייעודית להחלקת קוקו וקיבוע שערות פורחות לתסרוקת חלקה.",
    category: "hair",
    emoji: "💆‍♀️",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3vYEL1T",
  },
  {
    name: "גרבי ספורט נמוכות ונושמות",
    desc: "גרבי ספורט קלילות עם אריגה נושמת — מצוינות לאימון ולתרגול.",
    category: "clothing",
    emoji: "🧦",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3I7TuO1",
  },
  {
    name: "גומיות שיער שחורות חזקות (50/100 יח')",
    desc: "גומיות גמישות וחזקות שמחזיקות מעמד ולא נקרעות באמצע תרגיל.",
    category: "hair",
    emoji: "⭕",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3gibHZ3",
  },
  {
    name: "גליל טייפ קינזיולוגי (5 ס\"מ × 5 מ')",
    desc: "גליל טייפ עמיד למים לתמיכה בשרירים ובמפרקים בזמן ספורט ופיטנס.",
    category: "training",
    emoji: "🎽",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3ZSl93J",
  },
  {
    name: "מסרק לעיסוי וסידור שיער",
    desc: "מסרק עם שיניים מעוצבות לסידור עדין ונעים של השיער.",
    category: "hair",
    emoji: "🪮",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c2JTwkfF",
  },
  {
    name: "מלחציים / קליפסים לשיער (גדלים 5/6/7 ס\"מ)",
    desc: "מלחצי שיער בכמה גדלים לאיסוף וקיבוע נוח של השיער.",
    category: "hair",
    emoji: "🦋",
    image: "",
    link: "https://s.click.aliexpress.com/e/_c3yb4kWZ",
  },
];
