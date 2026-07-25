// slug אקראי, 5 תווים. לא שם, לא בית ספר — בטיחות, לא אסתטיקה.
// בלי תווים דו-משמעיים (0/o, 1/l) כדי שיהיה קל להקריא בטלפון.

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomSlug(len = 5): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function randomToken(len = 24): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
