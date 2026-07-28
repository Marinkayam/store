import { EmptyCollection } from "../components";

// שלושת הטאבים (קיבלתי · שלחתי · התאמות) נבנים בשלב 3.
export default function Trades() {
  return (
    <EmptyCollection
      title="עוד לא קיבלת הצעה"
      body="שתפי את הגלריה שלך כדי שחברות יראו מה פתוח לטרייד, ויציעו לך."
      cta="לגלריה שלי"
      href="/squish/collection"
    />
  );
}
