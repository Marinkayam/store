import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOURCES, SOURCE_LABEL, type Source } from "./stats";

/**
 * "מי מסתכל על הדוכן" (0062) — מסכם את המונים לתצוגה. משותף לדף של הדוכן
 * (/api/stats, דוכן אחד) ולחמ"ל (/api/admin/stats, כל הדוכנים).
 *
 * הכל לפי שעון ישראל: "היום" מתחיל בחצות בתל אביב.
 */

export type Range = "today" | "7" | "30";
export const LIVE_SECONDS = 90;

const TZ = "Asia/Jerusalem";
const dayOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
const addDays = (ymd: string, n: number) => {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type StatsResult = {
  range: Range;
  live: number;
  totals: { visits: number; visitors: number; newVisitors: number; productOpens: number; carts: number; orders: number; revenue: number };
  prevVisits: number;
  /** היום: 24 שעות. אחרת: יום אחרי יום */
  series: { key: string; label: string; visits: number }[];
  sources: { source: Source; label: string; visits: number }[];
  products: { id: string; name: string; opens: number; carts: number; orders: number }[];
  stores?: { id: string; name: string; slug: string; visits: number; live: number }[];
};

type Row = { store_id: string; day: string; hour: number; source: string; visits: number; visitors: number; new_visitors: number; product_opens: number; carts: number };

export async function loadStats(db: SupabaseClient, storeIds: string[] | null, range: Range): Promise<StatsResult> {
  const today = dayOf(new Date());
  const span = range === "today" ? 1 : Number(range);
  const start = addDays(today, -(span - 1));
  const prevStart = addDays(start, -span);
  const since = new Date(Date.now() - LIVE_SECONDS * 1000).toISOString();
  // דוכן אחד (או כמה) — או הכל, בחמ"ל
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (storeIds ? q.in("store_id", storeIds) : q);

  const [{ data: rows }, { data: prevRows }, { data: live }, { data: prod }, { data: orders }] = await Promise.all([
    scope(db.from("store_stats").select("store_id, day, hour, source, visits, visitors, new_visitors, product_opens, carts").gte("day", start)),
    scope(db.from("store_stats").select("visits").gte("day", prevStart).lt("day", start)),
    scope(db.from("store_presence").select("store_id").gte("seen_at", since)),
    storeIds
      ? scope(db.from("product_stats").select("product_id, opens, carts").gte("day", start))
      : Promise.resolve({ data: [] as { product_id: string; opens: number; carts: number }[] }),
    scope(
      db
        .from("orders")
        .select("store_id, items, total, status, created_at")
        // יום אחד אחורה ב-UTC, ואז מסננים לפי היום בישראל
        .gte("created_at", new Date(new Date(start + "T00:00:00Z").getTime() - 86400000).toISOString())
    ),
  ]);

  const R = (rows ?? []) as Row[];
  const ordersIn = (orders ?? []).filter(
    (o: { created_at: string; status: string }) => o.status !== "cancelled" && dayOf(new Date(o.created_at)) >= start
  ) as { store_id: string; items: { id?: string; qty: number }[]; total: number }[];

  const sum = (k: keyof Row) => R.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const totals = {
    visits: sum("visits"),
    visitors: sum("visitors"),
    newVisitors: sum("new_visitors"),
    productOpens: sum("product_opens"),
    carts: sum("carts"),
    orders: ordersIn.length,
    revenue: ordersIn.reduce((s, o) => s + Number(o.total ?? 0), 0),
  };

  let series: StatsResult["series"];
  if (range === "today") {
    series = Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${h}:00`,
      visits: R.filter((r) => r.day === today && r.hour === h).reduce((s, r) => s + r.visits, 0),
    }));
  } else {
    series = Array.from({ length: span }, (_, i) => {
      const d = addDays(start, i);
      const dt = new Date(d + "T12:00:00Z");
      return {
        key: d,
        label: dt.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", timeZone: "UTC" }),
        visits: R.filter((r) => r.day === d).reduce((s, r) => s + r.visits, 0),
      };
    });
  }

  const sources = SOURCES.map((src) => ({
    source: src,
    label: SOURCE_LABEL[src],
    visits: R.filter((r) => r.source === src).reduce((s, r) => s + r.visits, 0),
  }))
    .filter((x) => x.visits > 0)
    .sort((a, b) => b.visits - a.visits);

  let products: StatsResult["products"] = [];
  if (storeIds) {
    const byId = new Map<string, { opens: number; carts: number; orders: number }>();
    for (const p of (prod ?? []) as { product_id: string; opens: number; carts: number }[]) {
      const e = byId.get(p.product_id) ?? { opens: 0, carts: 0, orders: 0 };
      e.opens += p.opens;
      e.carts += p.carts;
      byId.set(p.product_id, e);
    }
    for (const o of ordersIn) {
      for (const it of o.items ?? []) {
        if (!it.id) continue;
        const e = byId.get(it.id) ?? { opens: 0, carts: 0, orders: 0 };
        e.orders += Number(it.qty ?? 1);
        byId.set(it.id, e);
      }
    }
    const ids = [...byId.keys()];
    const { data: names } = ids.length
      ? await db.from("products").select("id, name").in("id", ids)
      : { data: [] as { id: string; name: string }[] };
    products = (names ?? [])
      .map((n: { id: string; name: string }) => ({ id: n.id, name: n.name, ...byId.get(n.id)! }))
      .sort((a, b) => b.opens + b.orders * 3 - (a.opens + a.orders * 3))
      .slice(0, 8);
  }

  const result: StatsResult = {
    range,
    live: (live ?? []).length,
    totals,
    prevVisits: (prevRows ?? []).reduce((s: number, r: { visits: number }) => s + r.visits, 0),
    series,
    sources,
    products,
  };

  if (!storeIds) {
    const per = new Map<string, { visits: number; live: number }>();
    for (const r of R) per.set(r.store_id, { visits: (per.get(r.store_id)?.visits ?? 0) + r.visits, live: per.get(r.store_id)?.live ?? 0 });
    for (const l of (live ?? []) as { store_id: string }[]) per.set(l.store_id, { visits: per.get(l.store_id)?.visits ?? 0, live: (per.get(l.store_id)?.live ?? 0) + 1 });
    const top = [...per.entries()].sort((a, b) => b[1].live * 1000 + b[1].visits - (a[1].live * 1000 + a[1].visits)).slice(0, 12);
    const { data: st } = top.length
      ? await db.from("stores").select("id, display_name, slug").in("id", top.map(([id]) => id))
      : { data: [] as { id: string; display_name: string; slug: string }[] };
    result.stores = top.map(([id, v]) => {
      const s = (st ?? []).find((x: { id: string }) => x.id === id) as { display_name: string; slug: string } | undefined;
      return { id, name: s?.display_name ?? "?", slug: s?.slug ?? "", ...v };
    });
  }
  return result;
}

export const isRange = (r: unknown): r is Range => r === "today" || r === "7" || r === "30";
