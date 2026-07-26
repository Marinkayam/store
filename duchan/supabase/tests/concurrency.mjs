// 15 קונות לוחצות "שליחה בוואטסאפ" באותה שנייה — כולן חייבות לקבל מספר שונה
import pg from "pg";

const mk = () => new pg.Client({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });
const setup = mk();
await setup.connect();
await setup.query(`insert into stores (id, slug, display_name, contact_phone)
  values ('cccccccc-0000-0000-0000-000000000001','burst','חנות עומס','972500000001')`);
await setup.end();

const N = 15;
const clients = await Promise.all(Array.from({ length: N }, async () => { const c = mk(); await c.connect(); return c; }));
const results = await Promise.all(
  clients.map((c, i) =>
    c.query(`select place_order('cccccccc-0000-0000-0000-000000000001',
      $1::jsonb, 10, null, 'ip${i}') as n`, [JSON.stringify([{ name: "x", qty: 1, price: 10 }])])
      .then((r) => r.rows[0].n)
  )
);
await Promise.all(clients.map((c) => c.end()));

const unique = new Set(results);
console.log("order numbers:", [...results].sort((a, b) => a - b).join(","));
console.log(unique.size === N && Math.min(...results) === 1 && Math.max(...results) === N
  ? `PASS: ${N} concurrent orders, all unique 1..${N}`
  : `FAIL: duplicates or gaps`);
