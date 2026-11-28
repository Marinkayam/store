import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkParentToken } from "@/lib/parent-link";
import { localityName } from "@/lib/localities";
import MarketParentView from "./market-parent-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "דוכן — השוק של העיר",
  description: "אישור הורים לשוק של העיר",
  robots: { index: false, follow: false },
};

/**
 * /parent/[slug]/market?t=… — ההורה מאשר שהדוכן ייכנס לשוק של העיר (0077).
 * אותו טוקן כמו בדף ההורה (lib/parent-link.ts). בלי טוקן תקין לא מראים כלום.
 */
export default async function MarketParentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("id, display_name").eq("slug", slug).maybeSingle();
  if (!store || !checkParentToken(store.id, t)) return <MarketParentView valid={false} slug={slug} token="" name="" state="none" city="" />;
  const { data: m } = await db.from("community_members").select("status, locality_id").eq("store_id", store.id).maybeSingle();
  return (
    <MarketParentView
      valid
      slug={slug}
      token={t ?? ""}
      name={store.display_name}
      state={!m || m.status === "left" ? "none" : m.status}
      city={m ? localityName(m.locality_id) ?? "" : ""}
    />
  );
}
