# Security

Aletheia listens on `127.0.0.1` only by default and stores data in a local SQLite file. Secrets are redacted before
storage, but redaction is pattern-based and cannot be complete: do not rely on it for material you must never store.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security tab). No email address is published for
this project, so that is the reporting channel. Include the version or commit, the command, and the smallest
reproduction with secrets removed. Do not open a public issue with the details.

There is no formal response-time promise. A fix is committed with a test when one is possible.

## Scope

In scope: the local server, CLI, MCP server, hooks, installers, rules sync, sync hub, remote MCP endpoint, and the
Docker files. Out of scope: a host application's own handling of the payloads it sends, and a reverse proxy or tunnel
that you place in front of the sync hub.

## Known issues fixed

- **Remote mode served the tool API without a login (fixed after 0.1.13).** When `aletheia-server` was bound to a
  non-loopback address with no `ALETHEIA_API_KEY`, the Hub login covered only `/` and `/api/*`. The routes `/v1/*`,
  the `/v1/live` socket and `/mcp` answered anyone who could reach the port. Loopback-only installs (the default)
  were not affected. Fix: upgrade. Until then, bind to `127.0.0.1`, or set `ALETHEIA_API_KEY`, or put an
  authenticating proxy in front. The same release also fixes the remote login page, whose Content-Security-Policy
  blocked its own login request.
- **Loopback `/mcp` behind a proxy (fixed after 0.1.13).** On a loopback bind with no `ALETHEIA_API_KEY`, `/mcp` did not
  apply the local-only check that `/v1` applies. A reverse proxy or tunnel in front of the port exposed MCP read and
  write. It now answers only requests from this computer, unless the key is set.
- **Sync pairing lockout (fixed after 0.1.13).** The sync hub checked a pairing code before its lockout, so a correct
  guess still succeeded while the account was locked out. The lockout is now checked first.
- **Remote login cookies (fixed after 0.1.13).** The session and CSRF cookies were sent in one `Set-Cookie` header, so
  browsers kept only the first. Remote writes and logout failed; this failed closed.
- **Low findings from the remote-mode review (fixed after 0.1.13).** None gave access without a login. (1) A `Host`
  header with `/ ? # @ \` or whitespace changed the routed path; the server now answers 400. (2) A malformed `%` in a
  cookie, a static file path or a hub UI path gave `500`; it is now `401` or `404`. (3) `/healthz`, open to anyone, ran
  `PRAGMA quick_check` on every call; the result is cached for 30 seconds, warmed at startup and refreshed after a response, so `/healthz` stays fast on a large database (`aletheia doctor` now waits 3 s and reports a late answer as slow). (4) The CSRF token was a cookie compared to a
  header, not tied to the session; it is now stored in the session record, and behind `--behind-tls` the cookie is
  `__Host-aletheia_csrf`. (5) Remote mode refuses an `ALETHEIA_API_KEY` shorter than 32 characters, and a peer that
  sends 10 wrong credentials in a minute to `/v1` or `/mcp` gets `429`. (6) The login lockout map is pruned and
  bounded, and `X-Forwarded-For` is trusted only with `--behind-tls`. (7) Logout and session expiry now close that
  session's event stream and `/v1/live` sockets.
