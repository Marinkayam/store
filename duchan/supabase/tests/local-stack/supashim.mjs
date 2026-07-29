// שים מקומי תואם-Supabase: /auth/v1/* ממומש ישירות, /rest/v1/* מועבר ל-PostgREST.
// לבדיקות בלבד — סיסמאות בטקסט פשוט, אין ולידציות אמיתיות.
import http from "http";
import crypto from "crypto";
import pg from "pg";

const JWT_SECRET = "local-test-secret-with-at-least-32-chars!!";
const PORT = 8000;
const POSTGREST = "http://127.0.0.1:3001";

const db = new pg.Pool({ host: "/tmp", port: 5433, user: "postgres", database: "duchan" });

const b64u = (buf) => Buffer.from(buf).toString("base64url");
function signJwt(payload) {
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = token.split(".");
  const expect = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url");
  if (s !== expect) return null;
  return JSON.parse(Buffer.from(b, "base64url").toString());
}

/** טוקני magic-link חד-פעמיים, בזיכרון בלבד. */
const magicTokens = new Map();

function session(user) {
  const expiresIn = 60 * 60 * 24 * 7;
  const access_token = signJwt({
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  });
  return {
    access_token,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: crypto.randomUUID(),
    user: userJson(user),
  };
}
const userJson = (u) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}
const json = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
      });
      return res.end();
    }

    /* ---------- auth ---------- */
    if (url.pathname === "/auth/v1/signup" && req.method === "POST") {
      const { email, password } = await readBody(req);
      if (!email || !password) return json(res, 400, { error: "missing" });
      const exists = await db.query("select id from auth.users where email=$1", [email.toLowerCase()]);
      if (exists.rows.length) return json(res, 400, { error_code: "user_already_exists", msg: "User already registered" });
      const id = crypto.randomUUID();
      await db.query("insert into auth.users (id, email) values ($1,$2)", [id, email.toLowerCase()]);
      await db.query("insert into auth.shim_passwords (user_id, password) values ($1,$2)", [id, password]);
      return json(res, 200, session({ id, email: email.toLowerCase() }));
    }

    if (url.pathname === "/auth/v1/token" && req.method === "POST") {
      const body = await readBody(req);
      if (url.searchParams.get("grant_type") === "password") {
        const r = await db.query(
          "select u.id, u.email from auth.users u join auth.shim_passwords p on p.user_id=u.id where u.email=$1 and p.password=$2",
          [(body.email ?? "").toLowerCase(), body.password ?? ""]
        );
        if (!r.rows.length) return json(res, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
        return json(res, 200, session(r.rows[0]));
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        return json(res, 400, { error_code: "refresh_token_not_found", msg: "shim: re-login" });
      }
      return json(res, 400, { msg: "unsupported grant" });
    }

    if (url.pathname === "/auth/v1/user" && req.method === "GET") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      const claims = token && verifyJwt(token);
      if (!claims?.sub || claims.exp < Date.now() / 1000) return json(res, 401, { msg: "invalid token" });
      const r = await db.query("select id, email from auth.users where id=$1", [claims.sub]);
      if (!r.rows.length) return json(res, 401, { msg: "user not found" });
      return json(res, 200, userJson(r.rows[0]));
    }

    if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      return res.end();
    }

    /* admin.listUsers — משמש בגיבוי היומי. */
    if (url.pathname === "/auth/v1/admin/users" && req.method === "GET") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      const claims = token && verifyJwt(token);
      if (claims?.role !== "service_role") return json(res, 403, { msg: "forbidden" });
      const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
      const per = Math.min(1000, Number(url.searchParams.get("per_page") ?? 50));
      const r = await db.query(
        "select id, email from auth.users order by id limit $1 offset $2",
        [per, (page - 1) * per]
      );
      return json(res, 200, { users: r.rows.map((u) => userJson(u)), aud: "authenticated" });
    }

    /* admin.getUserById — נקרא בכניסה בסמס לפני יצירת הסשן. */
    if (/^\/auth\/v1\/admin\/users\/[0-9a-f-]{36}$/.test(url.pathname) && req.method === "GET") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      const claims = token && verifyJwt(token);
      if (claims?.role !== "service_role") return json(res, 403, { msg: "forbidden" });
      const id = url.pathname.split("/").pop();
      const r = await db.query("select id, email from auth.users where id=$1", [id]);
      if (!r.rows.length) return json(res, 404, { msg: "user not found" });
      return json(res, 200, userJson(r.rows[0]));
    }

    /* admin.generateLink — הכניסה בסמס נשענת עליו.
       GoTrue האמיתי מחזיר את hashed_token *שטוח* בתשובה, ו-supabase-js
       הוא שמפצל אותו ל-properties. שים שמחזיר אותו מקונן שובר את
       כל מסלול הכניסה בלי שום שגיאה ברורה. */
    if (url.pathname === "/auth/v1/admin/generate_link" && req.method === "POST") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      const claims = token && verifyJwt(token);
      if (claims?.role !== "service_role") return json(res, 403, { msg: "forbidden" });
      const { email } = await readBody(req);
      const r = await db.query("select id, email from auth.users where email=$1", [
        String(email ?? "").toLowerCase(),
      ]);
      if (!r.rows.length) return json(res, 404, { msg: "user not found" });
      const hashed = crypto.randomUUID().replace(/-/g, "");
      magicTokens.set(hashed, r.rows[0].id);
      return json(res, 200, {
        ...userJson(r.rows[0]),
        action_link: `http://localhost:8000/auth/v1/verify?token=${hashed}`,
        hashed_token: hashed,
        verification_type: "magiclink",
      });
    }

    /* verifyOtp({ token_hash }) — צורך את הטוקן ומחזיר סשן. */
    if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
      const body = await readBody(req);
      const hashed = body.token_hash ?? body.token;
      const uid = magicTokens.get(hashed);
      if (!uid) return json(res, 401, { msg: "invalid token" });
      magicTokens.delete(hashed);
      const r = await db.query("select id, email from auth.users where id=$1", [uid]);
      if (!r.rows.length) return json(res, 401, { msg: "user not found" });
      return json(res, 200, session(r.rows[0]));
    }

    if (url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      const claims = token && verifyJwt(token);
      if (claims?.role !== "service_role") return json(res, 403, { msg: "forbidden" });
      const { email, password } = await readBody(req);
      const id = crypto.randomUUID();
      await db.query("insert into auth.users (id, email) values ($1,$2)", [id, email.toLowerCase()]);
      await db.query("insert into auth.shim_passwords (user_id, password) values ($1,$2)", [id, password]);
      return json(res, 200, userJson({ id, email: email.toLowerCase() }));
    }

    // admin.updateUserById — משמש לסיבוב הסיסמה בכניסה בסמס
    if (/^\/auth\/v1\/admin\/users\/[0-9a-f-]{36}$/.test(url.pathname) && req.method === "PUT") {
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      const claims = token && verifyJwt(token);
      if (claims?.role !== "service_role") return json(res, 403, { msg: "forbidden" });
      const id = url.pathname.split("/").pop();
      const patch = await readBody(req);
      const r = await db.query("select id, email from auth.users where id=$1", [id]);
      if (!r.rows.length) return json(res, 404, { msg: "user not found" });
      if (patch.email) {
        await db.query("update auth.users set email=$2 where id=$1", [id, patch.email.toLowerCase()]);
      }
      if (patch.password) {
        await db.query(
          `insert into auth.shim_passwords (user_id, password) values ($1,$2)
           on conflict (user_id) do update set password = excluded.password`,
          [id, patch.password]
        );
      }
      const after = await db.query("select id, email from auth.users where id=$1", [id]);
      return json(res, 200, userJson(after.rows[0]));
    }

    /* ---------- rest → PostgREST ---------- */
    if (url.pathname.startsWith("/rest/v1/")) {
      const target = POSTGREST + url.pathname.replace("/rest/v1", "") + url.search;
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await new Promise((r) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => r(Buffer.concat(chunks)));
      });
      const upstream = await fetch(target, { method: req.method, headers, body });
      const buf = Buffer.from(await upstream.arrayBuffer());
      const outHeaders = Object.fromEntries(upstream.headers.entries());
      delete outHeaders["content-encoding"];
      delete outHeaders["transfer-encoding"];
      outHeaders["content-length"] = String(buf.length);
      outHeaders["access-control-allow-origin"] = "*";
      res.writeHead(upstream.status, outHeaders);
      return res.end(buf);
    }

    json(res, 404, { msg: "not found: " + url.pathname });
  } catch (e) {
    json(res, 500, { msg: String(e) });
  }
});

server.listen(PORT, () => console.log(`supashim on :${PORT}`));
