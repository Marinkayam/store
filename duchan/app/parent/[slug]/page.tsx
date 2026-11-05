import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkParentToken } from "@/lib/parent-link";
import { ACTIVATION_PRICE, FULL_PRICE, IS_LAUNCH, OWNER_WHATSAPP, PAY_BIT_URL, PAY_PAYBOX_URL } from "@/lib/pricing";
import { storePath } from "@/lib/short-link";
import ParentView from "./parent-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "דוכן — להורים",
  description: "נבנה אצלכם דוכן. כל ההסבר, ואיך משלמים פעם אחת בביט.",
  robots: { index: false, follow: false },
};

// הדף שהילד/ה שולח/ת להורה (lib/parent-link.ts). נקרא בשרת עם service
// role ומחזיר רק שם, סלאג ומצב — בלי טלפון ובלי שום פרט של ההורה.
export default async function ParentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const { data: store } = await supabaseAdmin()
    .from("stores")
    .select("id, slug, display_name, activated_at, payment_claimed_at")
    .eq("slug", slug)
    .maybeSingle();
  const valid = !!store && checkParentToken(store.id, t);

  return (
    <ParentView
      valid={valid}
      slug={slug}
      token={t ?? ""}
      name={valid ? store!.display_name : ""}
      state={!valid ? "invalid" : store!.activated_at ? "live" : store!.payment_claimed_at ? "pending" : "open"}
      storeHref={valid ? storePath(store!.slug) : "/"}
      price={ACTIVATION_PRICE}
      fullPrice={FULL_PRICE}
      isLaunch={IS_LAUNCH}
      bitUrl={PAY_BIT_URL}
      payboxUrl={PAY_PAYBOX_URL}
      ownerWhatsapp={OWNER_WHATSAPP}
    />
  );
}
