#!/usr/bin/env bun
// MCP server over stdio. Point any MCP-capable tool at: bun <path>/bin/mcp.mjs
// Env: ALETHEIA_DATA_DIR / ALETHEIA_HUB_DB pick the store, ALETHEIA_TOOL names the caller in saved memories.
import { loadConfig } from "../src/config.mjs";
import { serveStdio } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";

const config = loadConfig();
await serveStdio({ store: new HubStore(config.hubDb) });
