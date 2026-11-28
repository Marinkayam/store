import { notFound, redirect } from "next/navigation";
import { SHORT_CODE, SHORT_RESERVED } from "@/lib/short-link";
import { productTarget } from "@/lib/product-link-server";

/** duchan.app/abcde/12 → המוצר ה-12 בדוכן (lib/product-link.ts) */
export default async function ShortProductLink({ params }: { params: Promise<{ code: string; n: string }> }) {
  const { code, n } = await params;
  const c = code.toLowerCase();
  if (!SHORT_CODE.test(c) || SHORT_RESERVED.has(c)) notFound();
  redirect(await productTarget(c, n));
}
