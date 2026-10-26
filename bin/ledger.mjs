#!/usr/bin/env bun
// The ledger CLI: bun bin/ledger.mjs <candidates|grouping-input|apply|pending|show|record-progress|story-input|record-story|align-input|record-alignment|refresh-needs> [...]
// Same commands the refresh runs. Reads ALETHEIA_LEDGER_DIR and CLAUDE_MEM_DB like the server.
import { loadConfig } from "../src/config.mjs";
import { configureLedger, runCli } from "../src/ledger/commands.mjs";

configureLedger({ overlayDb: loadConfig().overlayDb });

try {
  runCli(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
