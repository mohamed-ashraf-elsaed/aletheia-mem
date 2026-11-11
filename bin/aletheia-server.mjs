#!/usr/bin/env bun
// Start the work view: bun bin/aletheia-server.mjs [--host 0.0.0.0] [--behind-tls] [--help]
// A non-loopback bind turns on Hub login; without --behind-tls it prints a warning.
const HELP = `aletheia-server: the dashboard, the HTTP API and the extraction worker.

Usage: aletheia-server [--host addr] [--behind-tls] [--help]

  --host addr    bind address (default 127.0.0.1; a non-loopback bind turns on Hub login)
  --behind-tls   a TLS-terminating proxy sits in front; login cookies are sent with Secure
  --help, -h     print this text and exit

Environment: ALETHEIA_PORT (default 37790), ALETHEIA_DATA_DIR, ALETHEIA_PROVIDER, ALETHEIA_API_KEY.
`;
if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
  process.stdout.write(HELP);
  process.exit(0);
}

import { loadConfig } from "../src/config.mjs";
import { createAutoRefresh } from "../src/refresh/auto-refresh.mjs";
import { startServer } from "../src/server.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
};

// Pass --host only when it was given with a value. String(undefined) is the text "undefined", which is not a host name.
const hostFlag = flag("host", undefined);
const config = loadConfig({ host: typeof hostFlag === "string" ? hostFlag : undefined, behindTls: !!flag("behind-tls", false) });
const autoRefresh = config.provider !== "none" && config.autoRefresh ? createAutoRefresh(config) : null;
const { server, stop } = startServer({ ...config, extractionWorker: true }, { autoRefresh, behindTls: config.behindTls });
autoRefresh?.start();

console.log(`aletheia-mem listening on http://localhost:${server.port}`);
console.log(`  source db : ${config.sourceDb} (read-only)`);
console.log(`  data dir  : ${config.dataDir}`);
console.log(`  refresh   : ${autoRefresh ? `on (${config.provider}, every ${Math.round(config.refreshCheckMs / 60000)} min)` : "off (set ALETHEIA_PROVIDER=claude-cli|openai to enable)"}`);
console.log(`  extraction: worker on (${config.provider === "none" ? "rule-based" : config.provider})`);
if (!["127.0.0.1", "localhost", "::1"].includes(config.host) && !config.apiKey) {
  console.log(`  warning  : remote mode with no ALETHEIA_API_KEY: the dashboard needs a login, and tools cannot use /v1 or /mcp until the key is set`);
}
if (!["127.0.0.1", "localhost", "::1"].includes(config.host) && !config.behindTls) {
  console.log(`  warning  : this bind is not TLS-terminated and login cookies are sent without Secure; use --behind-tls with a reverse proxy or tunnel`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}
