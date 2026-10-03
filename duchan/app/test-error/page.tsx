import { notFound } from "next/navigation";
import Boom from "./boom";

/**
 * לבדיקות בלבד (e2e-error.mjs): עמוד שנופל בפעם הראשונה ועובד אחרי "לרענן".
 * קיים רק כש-PUSH_TEST_ENDPOINTS=1 (סביבת הבדיקות המקומית). בפרודקשן — 404.
 */
export const dynamic = "force-dynamic";

export default function TestErrorPage() {
  if (process.env.PUSH_TEST_ENDPOINTS !== "1") notFound();
  return <Boom />;
}
