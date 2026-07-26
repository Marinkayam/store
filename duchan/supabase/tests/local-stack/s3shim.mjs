// שים S3 מינימלי במקום R2 לבדיקות: PUT שומר, GET מגיש. חתימות לא נבדקות.
import http from "http";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "fs";
import { dirname, join, normalize } from "path";

const ROOT = process.env.S3_ROOT ?? "/var/lib/pgtest/s3data";
mkdirSync(ROOT, { recursive: true });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, "");
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(400); return res.end(); }

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    return res.end();
  }

  if (req.method === "PUT") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.concat(chunks));
      writeFileSync(file + ".ct", req.headers["content-type"] ?? "application/octet-stream");
      res.writeHead(200, { ...cors, ETag: '"shim"' });
      res.end();
    });
    return;
  }

  if (req.method === "GET") {
    // GET על תיקייה (למשל "/" בבדיקת בריאות) — 404, לא קריסה של השים
    if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, cors); return res.end(); }
    const ct = existsSync(file + ".ct") ? readFileSync(file + ".ct", "utf8") : "application/octet-stream";
    const data = readFileSync(file);
    res.writeHead(200, { ...cors, "Content-Type": ct, "Content-Length": data.length });
    return res.end(data);
  }

  res.writeHead(405, cors);
  res.end();
});

server.listen(9000, () => console.log("s3shim on :9000"));
