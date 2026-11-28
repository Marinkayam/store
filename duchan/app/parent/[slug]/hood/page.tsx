import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkParentToken } from "@/lib/parent-link";
import { localityName } from "@/lib/localities";
import { hoodTitle } from "@/lib/hood";
import HoodParentView from "./hood-parent-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "דוכן — השוק של השכונה",
  description: "אישור הורים לשוק של השכונה",
  robots: { index: false, follow: false },
};

/**
 * /parent/[slug]/hood?t=… — ההורה מאשר שהדוכן ייכנס לשוק של השכונה (0077).
 * אותו טוקן כמו בדף ההורה (lib/parent-link.ts). בלי טוקן תקין לא מראים כלום.
 */
export default async function HoodParentPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params;
  const { t } = await searchParams;
  const db = supabaseAdmin();
  const { data: store } = await db.from("stores").select("id, slug, display_name").eq("slug", slug).maybeSingle();
  const valid = !!store && checkParentToken(store.id, t);
  if (!valid) return <HoodParentView valid={false} slug={slug} token="" name="" state="none" city="" hood={null} />;

  const { data: m } = await db.from("neighborhood_members").select("status, locality_id, neighborhood_id, requested_name").eq("store_id", store!.id).maybeSingle();
  let hood: string | null = null;
  if (m?.neighborhood_id) {
    const { data: h } = await db.from("neighborhoods").select("name").eq("id", m.neighborhood_id).maybeSingle();
    hood = h ? hoodTitle(h.name) : null;
  } else if (m?.requested_name) hood = hoodTitle(m.requested_name);
  return (
    <HoodParentView
      valid
      slug={slug}
      token={t ?? ""}
      name={store!.display_name}
      state={!m || m.status === "left" ? "none" : m.status}
      city={m ? localityName(m.locality_id) ?? "" : ""}
      hood={hood}
    />
  );
}
