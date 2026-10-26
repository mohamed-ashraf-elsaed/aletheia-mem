#!/usr/bin/env bun
// Aletheia Sync hub: a self-hosted, dependency-free sync server. Binds to loopback by default.
//   bun bin/aletheia-sync.mjs [--host 0.0.0.0] [--port 37791] [--db path] [--name default] [--behind-tls]
// A non-loopback bind without --behind-tls prints a warning; TLS is handled by a reverse proxy or tunnel.
import { loadConfig } from "../src/config.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
};

const config = loadConfig();
const host = String(flag("host", config.syncHost));
const port = Number(flag("port", config.syncPort));
const syncDb = String(flag("db", config.syncDb));
const name = String(flag("name", "default"));
const behindTls = !!flag("behind-tls", false);

const { server, stop } = startSyncServer({ syncDb, host, port, name, behindTls });
const bound = `http://${host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host}:${server.port}`;

console.log(`aletheia-sync listening on ${bound}`);
console.log(`  sync db  : ${syncDb}`);
console.log(`  account  : ${name}`);
console.log(`  pairing  : aletheia sync pair --db ${syncDb}`);
console.log(`  join     : aletheia sync join ${bound} <code>`);
if (!behindTls && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
  console.log(`  warning  : this bind is not TLS-terminated; use --behind-tls with a reverse proxy or tunnel`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}
