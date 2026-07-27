/**
 * סט האייקונים של דוכן.
 *
 * למה לא אימוג'י: אימוג'י נראה אחרת בכל מכשיר — באייפון, באנדרואיד ובווטסאפ
 * זה שלושה ציורים שונים, בשלוש פלטות שלא קשורות לשלנו. ברגע שהמסך בנוי
 * מאימוג'ים, העיצוב מפסיק להיות בשליטתנו. האייקונים כאן מצוירים באותה שפה
 * של איור הדוכן: רשת 24, קו 1.6, פינות עגולות בקצה הקו בלבד, ומילוי שטוח
 * מתוך הפלטה.
 *
 * הצבע מגיע מהקונטקסט: הקו הוא currentColor, והמילוי הוא `tone` שברירת
 * המחדל שלו לבנדר. כך אותו אייקון עובד על רקע בהיר, על רצועה כהה, ובתוך
 * כפתור צבעוני — בלי גרסאות נפרדות.
 */

export type IconName =
  | "stall" | "bag" | "basket" | "receipt" | "megaphone" | "star" | "heart"
  | "camera" | "video" | "gallery" | "plus" | "check" | "pencil" | "trash"
  | "hourglass" | "gift" | "gem" | "leaf" | "sparkle" | "coins" | "link"
  | "palette" | "box" | "eye" | "party" | "moon" | "search" | "cloud"
  | "shop" | "phone" | "lock" | "share" | "infinity" | "jar" | "plant";

interface Props {
  name: IconName;
  /** גודל בפיקסלים. 20 בממשק, 28 בכותרת, 48 במסך ריק. */
  size?: number;
  /** צבע המילוי. הקו תמיד currentColor. */
  tone?: string;
  className?: string;
  title?: string;
}

/** צורות. כל אחת מציירת ברשת 24×24. */
const SHAPES: Record<IconName, (t: string) => React.ReactNode> = {
  stall: (t) => (
    <>
      <path d="M3 6h18v2H3z" fill={t} />
      <path d="M3 8h4.5v3a2.25 2 0 0 1-4.5 0zM7.5 8H12v3a2.25 2 0 0 1-4.5 0zM12 8h4.5v3a2.25 2 0 0 1-4.5 0zM16.5 8H21v3a2.25 2 0 0 1-4.5 0z" fill="none" />
      <path d="M5 11v8M19 11v8M3 18h18" />
      <path d="M8 18v-4h8v4z" fill={t} />
    </>
  ),
  bag: (t) => (
    <>
      <path d="M5 8h14l-1 12H6z" fill={t} />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" />
    </>
  ),
  basket: (t) => (
    <>
      <path d="M4 10h16l-2 9H6z" fill={t} />
      <path d="M8 10 10 4M16 10 14 4M6 14h12" fill="none" />
    </>
  ),
  receipt: (t) => (
    <>
      <path d="M5 3h14v18l-2.3-1.6L14.4 21 12 19.4 9.6 21 7.3 19.4 5 21z" fill={t} />
      <path d="M9 8h6M9 12h6" fill="none" />
    </>
  ),
  megaphone: (t) => (
    <>
      <path d="M4 10v4h3l8 4V6l-8 4z" fill={t} />
      <path d="M7 14v4a2 2 0 0 0 4 0v-2M18 9a3.5 3.5 0 0 1 0 6" fill="none" />
    </>
  ),
  star: (t) => (
    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.2 6.1L12 17l-5.5 2.8 1.2-6.1L3.2 9.4l6.1-.8z" fill={t} />
  ),
  heart: (t) => (
    <path d="M12 20S3.5 14.6 3.5 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8.5 2.2C20.5 14.6 12 20 12 20z" fill={t} />
  ),
  camera: (t) => (
    <>
      <path d="M3 8h4l2-2.5h6L17 8h4v11H3z" fill={t} />
      <circle cx="12" cy="13" r="3.6" fill="none" />
    </>
  ),
  video: (t) => (
    <>
      <path d="M3 7h12v10H3z" fill={t} />
      <path d="m15 11 6-3.5v9L15 13z" fill="none" />
    </>
  ),
  gallery: (t) => (
    <>
      <path d="M3 5h18v14H3z" fill={t} />
      <path d="m4 17 5-6 4 4.5 3-2.5 4 4" fill="none" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="none" />
    </>
  ),
  plus: () => <path d="M12 5v14M5 12h14" fill="none" />,
  check: () => <path d="m4 12.5 5.2 5L20 6.5" fill="none" />,
  pencil: (t) => (
    <>
      <path d="M4 20v-3.5L16 4.7 19.3 8 7.3 20z" fill={t} />
      <path d="m14 6.7 3.3 3.3" fill="none" />
    </>
  ),
  trash: (t) => (
    <>
      <path d="M6 7h12l-1 13H7z" fill={t} />
      <path d="M4 7h16M10 4h4M10.5 11v5M13.5 11v5" fill="none" />
    </>
  ),
  hourglass: (t) => (
    <>
      <path d="M6 3h12v3.5L12 12l6 5.5V21H6v-3.5L12 12 6 6.5z" fill={t} />
      <path d="M4.5 3h15M4.5 21h15" fill="none" />
    </>
  ),
  gift: (t) => (
    <>
      <path d="M4 9h16v3H4zM5 12h14v9H5z" fill={t} />
      <path d="M12 9v12M12 9S9.5 3.8 7.4 5.2C5.6 6.4 8 9 12 9zM12 9s2.5-5.2 4.6-3.8C18.4 6.4 16 9 12 9z" fill="none" />
    </>
  ),
  gem: (t) => (
    <>
      <path d="M7 4h10l4 5-9 11L3 9z" fill={t} />
      <path d="M3 9h18M12 20 8.5 9 11 4M12 20l3.5-11L13 4" fill="none" />
    </>
  ),
  leaf: (t) => (
    <>
      <path d="M20 4C10 4 4 8.5 4 15a5 5 0 0 0 5 5c6.5 0 11-6 11-16z" fill={t} />
      <path d="M16 8C11 10.5 8.5 14 7.5 19.5" fill="none" />
    </>
  ),
  sparkle: (t) => (
    <>
      <path d="m11 3 1.9 4.6L17.5 9.5 12.9 11.4 11 16l-1.9-4.6L4.5 9.5l4.6-1.9z" fill={t} />
      <path d="m18 14 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill={t} />
    </>
  ),
  coins: (t) => (
    <>
      <ellipse cx="12" cy="7" rx="7" ry="3" fill={t} />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" fill="none" />
    </>
  ),
  link: () => (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.4l-1.5 1.5" fill="none" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.6l1.5-1.5" fill="none" />
    </>
  ),
  palette: (t) => (
    <>
      <path d="M12 3.5c-5 0-8.5 3.6-8.5 8S7 20 12 20c1.6 0 2-1 1.4-1.9-.7-1 .1-2.1 1.3-2.1H17c2 0 3.5-1.4 3.5-3.5 0-4.4-3.7-9-8.5-9z" fill={t} />
      <circle cx="8" cy="10" r="1.2" fill="none" />
      <circle cx="12" cy="7.5" r="1.2" fill="none" />
      <circle cx="16" cy="10" r="1.2" fill="none" />
    </>
  ),
  box: (t) => (
    <>
      <path d="M3 8h18v12H3z" fill={t} />
      <path d="m3 8 2.5-4h13L21 8M12 8v12" fill="none" />
    </>
  ),
  eye: (t) => (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" fill={t} />
      <circle cx="12" cy="12" r="2.8" fill="none" />
    </>
  ),
  party: (t) => (
    <>
      <path d="M4 20 9 8l7 7z" fill={t} />
      <path d="M14 4.5v2M18.5 6l-1.4 1.4M20 11h-2" fill="none" />
    </>
  ),
  moon: (t) => (
    <path d="M19 14.5A8 8 0 0 1 9.5 5a8 8 0 1 0 9.5 9.5z" fill={t} />
  ),
  search: (t) => (
    <>
      <circle cx="11" cy="11" r="6.5" fill={t} />
      <path d="m16 16 4.5 4.5" fill="none" />
    </>
  ),
  cloud: (t) => (
    <>
      <path d="M7 17a3.8 3.8 0 0 1-.4-7.6A5 5 0 0 1 16.3 9 3.6 3.6 0 0 1 17 17z" fill={t} />
      <path d="M9 19.5 8 21.5M13 19.5l-1 2M17 19.5l-1 2" fill="none" />
    </>
  ),
  shop: (t) => (
    <>
      <path d="M4 10h16v10H4z" fill={t} />
      <path d="M3 10 5 4h14l2 6M10 20v-5h4v5" fill="none" />
    </>
  ),
  phone: (t) => (
    <>
      <path d="M7 2.5h10v19H7z" fill={t} />
      <path d="M10 5h4" fill="none" />
    </>
  ),
  lock: (t) => (
    <>
      <path d="M5 11h14v10H5z" fill={t} />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" />
    </>
  ),
  share: (t) => (
    <>
      <circle cx="18" cy="6" r="2.8" fill={t} />
      <circle cx="6" cy="12" r="2.8" fill={t} />
      <circle cx="18" cy="18" r="2.8" fill={t} />
      <path d="m8.5 10.6 7-3.2M8.5 13.4l7 3.2" fill="none" />
    </>
  ),
  infinity: () => (
    <path d="M8.5 12a3.5 3.5 0 1 1 3.5 3.5c-2.5 0-2.5-7 0-7A3.5 3.5 0 1 1 15.5 12" fill="none" />
  ),
  jar: (t) => (
    <>
      <path d="M6 8h12v13H6z" fill={t} />
      <path d="M5 4.5h14V8H5z" fill="none" />
      <circle cx="10" cy="13" r="1.6" fill="none" />
      <circle cx="14" cy="16.5" r="1.6" fill="none" />
    </>
  ),
  plant: (t) => (
    <>
      <path d="M7 14h10l-1.2 7H8.2z" fill={t} />
      <path d="M12 14V7" fill="none" />
      <ellipse cx="8.6" cy="7.5" rx="3.4" ry="2" fill={t} transform="rotate(-18 8.6 7.5)" />
      <ellipse cx="15.4" cy="9" rx="3.2" ry="1.9" fill={t} transform="rotate(16 15.4 9)" />
    </>
  ),
};

export default function Icon({ name, size = 20, tone = "var(--lavender)", className, title }: Props) {
  const shape = SHAPES[name];
  if (!shape) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ flex: "none" }}
    >
      {title ? <title>{title}</title> : null}
      {shape(tone)}
    </svg>
  );
}
