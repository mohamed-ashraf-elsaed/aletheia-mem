#!/usr/bin/env bun
// Start the work view: bun bin/aletheia-server.mjs
import { loadConfig } from "../src/config.mjs";
import { createAutoRefresh } from "../src/refresh/auto-refresh.mjs";
import { startServer } from "../src/server.mjs";

const config = loadConfig();
const autoRefresh = config.provider !== "none" && config.autoRefresh ? createAutoRefresh(config) : null;
const { server, stop } = startServer({ ...config, extractionWorker: true }, { autoRefresh });
autoRefresh?.start();

console.log(`aletheia-mem listening on http://localhost:${server.port}`);
console.log(`  source db : ${config.sourceDb} (read-only)`);
console.log(`  data dir  : ${config.dataDir}`);
console.log(`  refresh   : ${autoRefresh ? `on (${config.provider}, every ${Math.round(config.refreshCheckMs / 60000)} min)` : "off (set ALETHEIA_PROVIDER=claude-cli|openai to enable)"}`);
console.log(`  extraction: worker on (${config.provider === "none" ? "rule-based" : config.provider})`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}
