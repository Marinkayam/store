import { redirect } from "next/navigation";
import { productTarget } from "@/lib/product-link-server";

/** duchan.app/s/{slug}/12, לדוכנים בלי לינק קצר (lib/product-link.ts) */
export default async function ProductLink({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const { slug, n } = await params;
  redirect(await productTarget(slug.toLowerCase(), n));
}
