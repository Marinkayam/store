// בדיקה לכתובת סופרבייס שהודבקה לא נכון — בדיוק התקלה שהפילה את הסמסים
// בפרודקשן. נבדק המודול האמיתי (lib/supabase/url.ts), לא העתק שלו.
import { spawnSync } from "child_process";
import { writeFileSync } from "fs";

const APP = "/home/user/store/duchan";
const SP = "/tmp/claude-0/-home-user-store/b8ef833d-fc75-574f-b1f4-12e282a8e978/scratchpad";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
};

/** JWT מזויף עם ref, במבנה של מפתח סופרבייס אמיתי */
const jwt = (ref) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ iss: "supabase", ref, role: "service_role" })).toString("base64url"),
    "signature",
  ].join(".");

const REF = "abcdefghijklmnop";
const KEY = jwt(REF);

const probe = `${SP}/url-probe.mts`;
writeFileSync(
  probe,
  `import { resolveSupabaseUrl } from "${APP}/lib/supabase/url.ts";
console.log(JSON.stringify(resolveSupabaseUrl()));`
);

const resolve = (url, key = KEY) => {
  const r = spawnSync("node", ["--experimental-strip-types", "--no-warnings", probe], {
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: key,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout.trim());
};

let r = resolve("https://xyzcompany.supabase.co");
check("a correct url is used as-is", r.url === "https://xyzcompany.supabase.co" && r.source === "env", r.url);

r = resolve("https://xyzcompany.supabase.co/");
check("a trailing slash is stripped, not treated as a failure", r.url === "https://xyzcompany.supabase.co" && r.source === "env", r.url);

r = resolve("https://supabase.com/dashboard/project/qrstuvwxyz012345/settings");
check("the dashboard url is turned into the project url",
  r.url === "https://qrstuvwxyz012345.supabase.co" && r.source === "path", `${r.url} (${r.source})`);

r = resolve("https://duchan.app");
check("the site's own domain is recovered from the key",
  r.url === `https://${REF}.supabase.co` && r.source === "key", `${r.url} (${r.source})`);

r = resolve("");
check("an empty value is recovered from the key too",
  r.url === `https://${REF}.supabase.co` && r.source === "key", `${r.url} (${r.source})`);

r = resolve("http://localhost:8000");
check("the local test stack is left alone", r.url === "http://localhost:8000" && r.source === "env", r.url);

r = resolve("https://duchan.app", "not-a-jwt");
check("with nothing to recover from, it says so instead of guessing", r.source === "missing", r.source);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} self-heal checks passed`);
process.exit(failed.length ? 1 : 0);
