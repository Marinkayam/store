import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { pushTo } from "./admin-notify";
import { formatPrice } from "./money";

/**
 * התראה לטלפון של הדוכן כשמגיעה הזמנה (0061).
 *
 * "אגב אפשר לשמור את הדוכן כמו אפליקציה ולקבל התראה כשמגיעה הזמנה."
 *
 * כללים:
 *   • לעולם לא זורק. התראה שנכשלה היא שורת לוג, לא הזמנה שנכשלה.
 *   • נקרא מתוך after() — הקונה לא מחכה לשרתי הפוש.
 *   • רק למי שעדיין בצוות הדוכן: שותף/ה שיצא/ה לא מקבל/ת יותר, גם אם
 *     המנוי שלו/ה עוד רשום.
 *   • בלי פרטי הקונה. ההתראה קופצת על מסך נעול, ואת זה רואה כל מי שליד
 *     הטלפון — לכן רק מספר הזמנה, כמה פריטים וסכום. השם והטלפון בפנים.
 */
export async function notifyStoreOrder(o: {
  storeId: string;
  orderNumber: number;
  total: number;
  itemCount: number;
}): Promise<number> {
  try {
    const db = supabaseAdmin();
    const [{ data: subs }, { data: store }, { data: members }] = await Promise.all([
      db
        .from("store_push_subscriptions")
        .select("id, endpoint, p256dh, auth, user_id")
        .eq("store_id", o.storeId)
        .is("disabled_at", null),
      db.from("stores").select("owner_id").eq("id", o.storeId).maybeSingle(),
      db.from("store_members").select("user_id").eq("store_id", o.storeId),
    ]);
    if (!subs?.length || !store) return 0;
    const team = new Set<string>([store.owner_id, ...(members ?? []).map((m) => m.user_id)]);
    const items = o.itemCount === 1 ? "מוצר אחד" : `${o.itemCount} מוצרים`;
    return await pushTo(
      "store_push_subscriptions",
      subs.filter((s) => team.has(s.user_id)),
      {
        title: `הזמנה חדשה בדוכן! #${o.orderNumber}`,
        body: `${items} · ₪${formatPrice(o.total)}. נכנסים לראות מי הזמין.`,
        url: "/dashboard",
        tag: `order-${o.storeId}-${o.orderNumber}`,
      }
    );
  } catch (e) {
    console.error("[push] store order:", e instanceof Error ? e.message : e);
    return 0;
  }
}
