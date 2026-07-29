// שרת דמה של sms4free. מדבר את אותו פרוטוקול ורושם כל הודעה לטבלה,
// כדי שהבדיקות יוכלו לקרוא את הקוד בלי לשלוח הודעה אמיתית ובלי לעלות כסף.
import http from "http";
import pg from "pg";

const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

await db.query(`create table if not exists sms_outbox (
  id serial primary key,
  recipient text,
  sender text,
  msg text,
  created_at timestamptz not null default now()
)`);

const KEY = "test-key";
const USER = "0500000000";
const PASS = "test-pass";

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    if (!req.url.includes("SendSMS")) {
      res.writeHead(404).end("not found");
      return;
    }
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: -5, message: "bad body" }));
      return;
    }
    // מחקה את בדיקת ההרשאות של הספק — כדי שהבדיקות יתפסו גם מפתח שגוי
    if (b.key !== KEY || b.user !== USER || b.pass !== PASS) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: -1, message: "bad credentials" }));
      return;
    }
    await db.query("insert into sms_outbox (recipient, sender, msg) values ($1,$2,$3)", [
      b.recipient,
      b.sender,
      b.msg,
    ]);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: 1, message: "ok" }));
  });
});

server.listen(9100, () => console.log("smsshim on :9100"));
