/* ==========================================================================
   רשימת המוצרים — זה הקובץ היחיד שצריך לערוך! ✏️
   ==========================================================================

   איך מוסיפים את קישורי האפיליאציה שלך:

   1. נכנסים לפורטל השותפים של אלי אקספרס: https://portals.aliexpress.com
   2. מחפשים את המוצר הרצוי (אפשר דרך "Hot Products" או הדבקת קישור מוצר
      בכלי "Link Generator").
   3. בפורטל מוצג ליד כל מוצר אחוז העמלה (Commission Rate) —
      כדאי לבחור מוצרים עם עמלה גבוהה (בדרך כלל 5%-9%+).
   4. מעתיקים את קישור האפיליאציה שנוצר ומדביקים אותו בשדה link של המוצר.
   5. רצוי גם להעתיק את כתובת תמונת המוצר מאלי אקספרס (קליק ימני על
      התמונה > העתק כתובת תמונה) ולהדביק בשדה image — ואז התמונה האמיתית
      תופיע בכרטיס במקום האימוג'י.

   כרגע כל הקישורים הם קישורי חיפוש באלי אקספרס (עובדים, אבל בלי עמלה!)
   כדי שהדף יהיה שמיש מהרגע הראשון. החליפי אותם בקישורי האפיליאציה שלך.

   שדות של כל מוצר:
     name     — שם המוצר שיוצג בכרטיס
     desc     — תיאור קצר
     category — אחת מהקטגוריות שמוגדרות למטה ב-CATEGORIES
     emoji    — מוצג כשאין תמונה
     image    — (אופציונלי) כתובת תמונה מאלי אקספרס
     link     — קישור האפיליאציה שלך! ⭐
   ========================================================================== */

const CATEGORIES = [
  { id: "all",      label: "הכל ✨" },
  { id: "hair",     label: "שיער 🎀" },
  { id: "clothing", label: "ביגוד 👗" },
  { id: "training", label: "אימון וכוח 💪" },
  { id: "gear",     label: "ציוד ואביזרים 🎒" },
];

const PRODUCTS = [

  /* ---------- שיער 🎀 ---------- */
  {
    name: "רשתות שיער בלתי נראות",
    desc: "רשתות דקיקות בצבע השיער שמחזיקות את הבייגלה מושלם לאורך כל האימון או התחרות",
    category: "hair",
    emoji: "🕸️",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-invisible-hair-net-bun.html",
  },
  {
    name: "גומיות שחורות חזקות",
    desc: "גומיות עבות ואיכותיות שבאמת מחזיקות — לא נקרעות ולא משתחררות באמצע תרגיל",
    category: "hair",
    emoji: "⭕",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-black-elastic-hair-ties-thick-no-slip.html",
  },
  {
    name: "סיכות שיער (בובי פינס)",
    desc: "חבילה גדולה של סיכות חזקות להצמדת כל שערה סוררת לפני עלייה למזרן",
    category: "hair",
    emoji: "📍",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-bobby-pins-black-pack.html",
  },
  {
    name: "סיכות U רחבות לבייגלה",
    desc: "סיכות רחבות בצורת U שמקבעות את הבייגלה חזק — חובה לשיער עבה או ארוך",
    category: "hair",
    emoji: "🔱",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-u-shaped-hair-pins-bun.html",
  },
  {
    name: "מסרק זנב + מברשת החלקה",
    desc: "סט מסרקים לאיסוף הדוק ומדויק בלי בליטות — לקוקו ובייגלה מקצועיים",
    category: "hair",
    emoji: "💇‍♀️",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-rat-tail-comb-hair-brush-set.html",
  },
  {
    name: "עושה בייגלה (דונאט לשיער)",
    desc: "ספוג דונאט שהופך כל קוקו לבייגלה מושלם ואחיד תוך שניות",
    category: "hair",
    emoji: "🍩",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-hair-donut-bun-maker.html",
  },
  {
    name: "סיכות מנצנצות לתחרויות",
    desc: "סיכות מעוטרות באבנים נוצצות שמוסיפות טאץ' חגיגי לתסרוקת תחרות",
    category: "hair",
    emoji: "💎",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-rhinestone-hair-pins-gymnastics.html",
  },

  /* ---------- ביגוד 👗 ---------- */
  {
    name: "בגד גוף שקוף (בצבע גוף)",
    desc: "בגד גוף עדין בצבע עור ללבישה מתחת לבגד התחרות — נראה בלתי נראה על הבמה",
    category: "clothing",
    emoji: "🩰",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-nude-seamless-bodysuit-gymnastics-undergarment.html",
  },
  {
    name: "תחתונים שקופים בצבע גוף",
    desc: "תחתונים חלקים ללא תפרים שלא מציצים מבגד הגוף — הבסיס לכל הופעה",
    category: "clothing",
    emoji: "🩲",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-nude-seamless-underwear-gymnastics-girls.html",
  },
  {
    name: "בגד גוף לאימונים",
    desc: "בגד גוף נוח וגמיש לאימונים יומיומיים — במגוון צבעים ודוגמאות שוות",
    category: "clothing",
    emoji: "🤸‍♀️",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-gymnastics-leotard-girls-training.html",
  },
  {
    name: "מכנסונים קצרים לאימון",
    desc: "שורטים צמודים ונוחים שהולכים מעולה מעל בגד גוף באימונים",
    category: "clothing",
    emoji: "🩳",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-gymnastics-shorts-girls.html",
  },
  {
    name: "גוזיית ספורט בצבע גוף",
    desc: "גוזייה עדינה וחלקה לבנות שצריכות תמיכה מתחת לבגד הגוף",
    category: "clothing",
    emoji: "👚",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-nude-seamless-sports-bra-girls.html",
  },

  /* ---------- אימון וכוח 💪 ---------- */
  {
    name: "משקולות ידיים",
    desc: "משקולות רצועה לפרקי הידיים לחיזוק והכנה לאלמנטים חדשים",
    category: "training",
    emoji: "🏋️‍♀️",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-wrist-weights-adjustable.html",
  },
  {
    name: "משקולות רגליים",
    desc: "משקולות קרסול מתכווננות לחיזוק רגליים — לקפיצות גבוהות ובעיטות חזקות יותר",
    category: "training",
    emoji: "🦵",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-ankle-weights-adjustable-kids.html",
  },
  {
    name: "גומיות התנגדות",
    desc: "סט גומיות בדרגות קושי שונות לחיזוק, חימום ותרגילי כוח בבית",
    category: "training",
    emoji: "➰",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-resistance-bands-set-loop.html",
  },
  {
    name: "רצועת מתיחות",
    desc: "רצועה עם לולאות לשיפור גמישות, ספגטים ופתיחת כתפיים — בבטיחות ובהדרגה",
    category: "training",
    emoji: "🧘‍♀️",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-stretching-strap-loops-flexibility.html",
  },
  {
    name: "מגיני שורש כף יד",
    desc: "תמיכה לפרקי הידיים בעמידות ידיים, פליק-פלאקים וכל מה שביניהם",
    category: "training",
    emoji: "🤲",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-wrist-support-gymnastics.html",
  },
  {
    name: "מגיני ברכיים",
    desc: "מגינים רכים וגמישים ששומרים על הברכיים בנחיתות ובתרגילי רצפה",
    category: "training",
    emoji: "🦿",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-knee-pads-gymnastics-kids.html",
  },
  {
    name: "מתקן למתיחת כף רגל",
    desc: "פוט-סטרצ'ר לשיפור הפוינט והקשת של כף הרגל — לקווים יפים יותר",
    category: "training",
    emoji: "🦶",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-foot-stretcher-arch-enhancer.html",
  },

  /* ---------- ציוד ואביזרים 🎒 ---------- */
  {
    name: "מזרן אוויר (אייר טראק)",
    desc: "מזרן מתנפח לתרגול פליק-פלאקים וסלטות בבית — ההשקעה הכי שווה לעונה",
    category: "gear",
    emoji: "🛹",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-air-track-tumbling-mat-gymnastics.html",
  },
  {
    name: "תיק ספורט למתעמלת",
    desc: "תיק שווה עם מקום לכל הציוד — בגדים, גומיות, סיכות ונשנושים לתחרות",
    category: "gear",
    emoji: "🎒",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-gymnastics-bag-girls.html",
  },
  {
    name: "בקבוק מים מוטיבציוני",
    desc: "בקבוק גדול עם סימוני שעות שמזכיר לשתות לאורך כל האימון",
    category: "gear",
    emoji: "💧",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-motivational-water-bottle-time-marker.html",
  },
  {
    name: "גליל עיסוי (פואם רולר)",
    desc: "לשחרור שרירים אחרי אימון קשה — הגוף יגיד תודה למחרת",
    category: "gear",
    emoji: "🌀",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-foam-roller-massage.html",
  },
  {
    name: "טייפ ספורט (קינזיו)",
    desc: "סרט הדבקה אלסטי לתמיכה בפרקים ושרירים — נמצא בתיק של כל מתעמלת",
    category: "gear",
    emoji: "🩹",
    image: "",
    link: "https://he.aliexpress.com/w/wholesale-kinesiology-tape-sport.html",
  },
];
