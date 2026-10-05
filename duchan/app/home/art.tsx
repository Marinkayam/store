import { ART, type ArtName } from "./items";

/** איור חפץ מתוך items.ts. המחרוזות סטטיות ונכתבו בקוד — לא קלט. */
export default function Art({ name, className = "", style }: { name: ArtName; className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden className={`block ${className}`} style={style} dangerouslySetInnerHTML={{ __html: ART[name] }} />;
}
