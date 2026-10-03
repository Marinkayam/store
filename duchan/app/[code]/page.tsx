import { notFound, redirect } from "next/navigation";
import { SHORT_CODE, SHORT_RESERVED } from "@/lib/short-link";

/**
 * הלינק הקצר: duchan.app/qkubk → /s/qkubk. בלי שאילתה למסד — /s/ כבר יודע
 * להציג "הדוכן סגור" לדוכן שלא קיים. כל מה שלא נראה כמו slug — 404 רגיל.
 */
export default async function ShortLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = code.toLowerCase();
  if (!SHORT_CODE.test(c) || SHORT_RESERVED.has(c)) notFound();
  redirect(`/s/${c}`);
}
