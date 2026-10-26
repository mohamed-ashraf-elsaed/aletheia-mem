// Hub login for remote use (T-110). When the server is not loopback-only, every `/` and `/api` route needs
// a session: an admin token from the sync account (T-104) is exchanged for an HttpOnly, SameSite=Strict,
// Secure-when-HTTPS session cookie plus a readable CSRF cookie. State-changing requests must echo the CSRF
// cookie in the X-CSRF-Token header. Sessions live in memory with an expiry; failed logins back off.
// Loopback-only servers keep today's behaviour: the guard answers null and the routes are unchanged.
import { randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_SESSION = "aletheia_session";
const COOKIE_CSRF = "aletheia_csrf";

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const LOGIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Log in to Aletheia</title>
<style>
body{font-family:system-ui,sans-serif;background:#111;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#1a1a1a;padding:2rem;border-radius:8px;display:grid;gap:1rem;min-width:320px}
label{font-size:.9rem;color:#aaa}
input{padding:.6rem;border:1px solid #444;border-radius:6px;background:#222;color:#eee}
button{padding:.6rem;border:0;border-radius:6px;background:#3b82f6;color:#fff;font-weight:600;cursor:pointer}
#msg{color:#f87171;min-height:1.2em;font-size:.9rem}
</style>
</head>
<body>
<form id="login">
<h1 style="margin:0">Aletheia</h1>
<label for="token">Admin token</label>
<input id="token" name="token" autocomplete="off" required>
<button type="submit">Log in</button>
<div id="msg" role="status"></div>
</form>
<script>
document.getElementById("login").addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: document.getElementById("token").value }) });
  if (response.ok) location.replace("/");
  else document.getElementById("msg").textContent = (await response.json()).error ?? "Login failed";
});
</script>
</body>
</html>`;

export function createLoginGuard({
  store,
  requireLogin = false,
  behindTls = false,
  sessionTtlMs = 24 * 60 * 60 * 1000,
  lockMs = 60_000,
  maxFailures = 5,
  getPeer = () => "unknown",
} = {}) {
  const sessions = new Map(); // session token -> { expiresAt, createdAt }
  const failures = new Map(); // peer -> { count, lockedUntil }

  const randomToken = (bytes = 32) => randomBytes(bytes).toString("hex");

  const cookie = (name, value, options = {}) => {
    const { httpOnly = false, maxAgeSeconds = sessionTtlMs / 1000 } = options;
    return `${name}=${value}; Path=/; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}${behindTls ? "; Secure" : ""}; Max-Age=${Math.max(1, Math.round(maxAgeSeconds))}`;
  };

  const cookieValue = (request, name) => {
    const pair = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
  };

  const sessionTokenOf = (request) => {
    const token = cookieValue(request, COOKIE_SESSION);
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return token;
  };

  const csrfOk = (request) => {
    const header = request.headers.get("x-csrf-token") ?? "";
    const expected = cookieValue(request, COOKIE_CSRF);
    return !!header && !!expected && safeEqual(header, expected);
  };

  const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

  async function handle(request, { server = null } = {}) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (pathname === "/api/login" && method === "POST") {
      const peer = getPeer(request, server);
      const lock = failures.get(peer);
      if (lock && lock.lockedUntil > Date.now()) {
        return json({ error: "Too many failed logins; wait." }, 429, { "Retry-After": String(Math.max(1, Math.ceil((lock.lockedUntil - Date.now()) / 1000))) });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        body = null;
      }
      const token = store.findToken(String(body?.token ?? ""));
      const valid = !!token && !token.revoked_at && !(token.expires_at && token.expires_at < Date.now()) && token.scope === "admin";
      if (!valid) {
        const entry = failures.get(peer) ?? { count: 0, lockedUntil: 0 };
        entry.count += 1;
        if (entry.count >= maxFailures) {
          const step = Math.max(0, entry.count - maxFailures);
          entry.lockedUntil = Date.now() + Math.min(lockMs * 2 ** step, 15 * 60_000);
        }
        failures.set(peer, entry);
        return json({ error: "The admin token is not valid." }, 401);
      }
      failures.delete(peer);
      const sessionToken = randomToken(32);
      const csrfToken = randomToken(16);
      sessions.set(sessionToken, { expiresAt: Date.now() + sessionTtlMs, createdAt: Date.now() });
      const setCookie = [cookie(COOKIE_SESSION, sessionToken, { httpOnly: true }), cookie(COOKIE_CSRF, csrfToken)].join(", ");
      return json({ ok: true }, 200, { "Set-Cookie": setCookie });
    }

    if (pathname === "/api/logout" && method === "POST") {
      if (!requireLogin) return null;
      const sessionToken = sessionTokenOf(request);
      if (!sessionToken) return json({ error: "No session." }, 401);
      if (!csrfOk(request)) return json({ error: "CSRF token missing or wrong." }, 403);
      sessions.delete(sessionToken);
      const setCookie = [cookie(COOKIE_SESSION, "", { httpOnly: true, maxAgeSeconds: 0 }), cookie(COOKIE_CSRF, "", { maxAgeSeconds: 0 })].join(", ");
      return json({ ok: true }, 200, { "Set-Cookie": setCookie });
    }

    if (!requireLogin) return null;
    if (pathname === "/" || pathname === "/index.html" || pathname.startsWith("/api/")) {
      if (!sessionTokenOf(request)) {
        if ((pathname === "/" || pathname === "/index.html") && method === "GET") {
          return new Response(LOGIN_PAGE, {
            status: 401,
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'", "X-Frame-Options": "DENY" },
          });
        }
        return json({ error: "A session is required." }, 401);
      }
      if (method !== "GET" && method !== "HEAD" && !csrfOk(request)) return json({ error: "CSRF token missing or wrong." }, 403);
      return null;
    }
    return null;
  }

  return { handle };
}
