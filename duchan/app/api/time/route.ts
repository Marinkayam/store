import { NextResponse } from "next/server";

// שעון השרת — הדף של הדוכן מתקן לפיו את הספירה לאחור של דרופ (lib/drop.ts),
// כי שעון של טלפון יכול לטעות בכמה דקות.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
