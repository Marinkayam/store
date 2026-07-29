// דיפלוי לפני מיגרציה: הקוד מבקש עמודה שעוד לא קיימת בדאטהבייס.
// זה הסדר הרגיל של דיפלוי, ולא היה מותר לו להפיל את כל דפי החנויות.
import pg from "pg";

const BASE = "http://localhost:3777";
const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${n}${d ? " — " + d : ""}`);
};

const { rows: [store] } = await db.query(
  "select slug from stores where activated_at is not null order by created_at limit 1"
);
const text = async () => {
  const res = await fetch(`${BASE}/s/${store.slug}?t=${Date.now()}`, { cache: "no-store" });
  return (await res.text()).replace(/<script[\s\S]*?<\/script>/g, "");
};

const before = await text();
check("with the column present the store renders", !before.includes("החנות סגורה כרגע"));

// מפילים את העמודה — בדיוק המצב בפרודקשן אחרי דיפלוי ולפני מיגרציה
await db.query("alter table stores drop column payout_link");
await db.query("notify pgrst, 'reload schema'");
await new Promise((r) => setTimeout(r, 1500));

const during = await text();
check("without the column the store still opens", !during.includes("החנות סגורה כרגע"));
check("and the products are still there", during.includes("₪"));

// מחזירים
await db.query("alter table stores add column if not exists payout_link text");
await db.query("notify pgrst, 'reload schema'");
await new Promise((r) => setTimeout(r, 1500));
const after = await text();
check("and it recovers once the migration runs", !after.includes("החנות סגורה כרגע"));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} schema-drift checks passed`);
await db.end();
process.exit(failed.length ? 1 : 0);
