import { EmptyCollection } from "../components";

// "לגלות" נבנה בשלב 2, אחרי שיש חברות במעגל. עד אז המסך אומר את זה
// במקום להיראות שבור.
export default function Discover() {
  return (
    <EmptyCollection
      title="עדיין אין גלריות במעגל שלך"
      body="הזמיני חברה שאוספת סקווישים, ותוכלו לראות מה יש אחת לשנייה ולהציע טריידים."
      cta="להזמין חברה"
      href="/squish/me"
    />
  );
}
