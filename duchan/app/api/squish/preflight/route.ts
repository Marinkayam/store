import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SQUISH_SCHEMA } from "@/lib/squish-schema";

/**
 * GET /api/squish/preflight
 *
 * בודקת שהדאטהבייס באמת מכיל את מה שהקוד הזה מצפה למצוא — **מול
 * הסכמה עצמה, לא מול `schema_migrations`**. הטבלה הזו היא רישום של
 * מה שהרצנו; היא לא יודעת מה קיים. בפרודקשן היא אמרה 0030 ובאמת היה
 * 0030, אבל היא הייתה אומרת 0031 גם אם מישהו היה מוסיף שורה בלי
 * להריץ, וזה בדיוק מה שקרה בסביבות אחרות.
 *
 * מחזירה שמות של עמודות ופונקציות בלבד. אין כאן נתונים של אף אחת,
 * ולכן היא לא דורשת התחברות — היא כן חייבת להיות זולה, ולכן זו
 * שאילתה אחת.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();

  const tables = Object.keys(SQUISH_SCHEMA.columns);
  const { data, error } = await db.rpc("squish_schema_probe", {
    p_tables: tables,
    p_functions: SQUISH_SCHEMA.functions,
  });

  if (error) {
    /* גם כישלון הבדיקה עצמה הוא ממצא: אם הפרוב חסר, הדאטהבייס מפגר
       לפחות במיגרציה שיצרה אותו. */
    return NextResponse.json(
      { ok: false, reason: "probe_unavailable", detail: error.code ?? null },
      { status: 200 }
    );
  }

  const haveColumns = new Set<string>((data?.columns ?? []).map((c: string) => c));
  const haveFunctions = new Set<string>((data?.functions ?? []).map((f: string) => f));

  const missingColumns: string[] = [];
  for (const [table, cols] of Object.entries(SQUISH_SCHEMA.columns)) {
    for (const col of cols) {
      if (!haveColumns.has(`${table}.${col}`)) missingColumns.push(`${table}.${col}`);
    }
  }
  const missingFunctions = SQUISH_SCHEMA.functions.filter((f) => !haveFunctions.has(f));

  const ok = missingColumns.length === 0 && missingFunctions.length === 0;
  return NextResponse.json({ ok, missingColumns, missingFunctions });
}
