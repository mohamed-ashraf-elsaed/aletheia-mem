// The hook entry point. Every path here is best-effort: a hook returns exit 0 and empty stdout on any internal
// error, never blocks a session, and never calls the network or a model. If the store cannot be opened or a write
// fails, the already-redacted item goes to a local spool file and the next successful hook flushes it.
import { loadConfig } from "../../config.mjs";
import { HubStore } from "../store.mjs";
import { isProjectExcluded } from "../capture.mjs";
import claudeCode from "./claude-code.mjs";
import commandCode from "./command-code.mjs";
import { enqueueCompression, flushSpool, projectOf, readPayload, spoolAppend } from "./shared.mjs";

export const ADAPTERS = { "claude-code": claudeCode, "command-code": commandCode };

export function adapterFor(tool) {
  const adapter = ADAPTERS[tool];
  if (!adapter) throw new RangeError(`Unknown hook tool: ${tool}. Try: ${Object.keys(ADAPTERS).join(", ")}`);
  return adapter;
}

const empty = () => ({ memory: null, compress: null });

export async function runHook({ tool, event, stdin, config, dataDir } = {}) {
  const cfg = config ?? loadConfig();
  const dir = dataDir ?? cfg.dataDir;
  const payload = readPayload(stdin);
  const name = event || payload.hook_event_name || payload.event || "";
  const fallback = { stdout: "", exitCode: 0 };

  let adapter;
  try {
    adapter = adapterFor(tool);
  } catch (error) {
    return { ...fallback, error: error.message };
  }

  // An excluded project is skipped before any row (memory or episode) is written. The hook still exits 0.
  const project = projectOf(payload);
  if (isProjectExcluded(project, cfg.excludedProjects ?? [])) {
    return { ...fallback, stored: false, queued: false, reason: "excluded_project", project };
  }

  let item = empty();
  try {
    item = adapter.capture(name, payload) ?? empty();
  } catch {
    item = empty();
  }

  const spool = () => {
    try {
      if (item.memory) spoolAppend(dir, { kind: "memory", memory: item.memory, at: Date.now() });
      if (item.compress) spoolAppend(dir, { kind: "compress", ...item.compress, at: Date.now() });
    } catch {
      // A broken spool is still not the session's problem.
    }
  };

  // No memory, no compression and no context: skip the database entirely.
  if (!item.memory && !item.compress && !/^sessionstart$/i.test(name)) return { ...fallback, stored: false, queued: false, flushed: 0 };

  let store = null;
  try {
    store = new HubStore(cfg.hubDb);
    store.db.exec("PRAGMA busy_timeout = 50");
  } catch {
    store = null;
  }

  if (!store) {
    spool();
    return { ...fallback, stored: false, spooled: true };
  }

  let flushed = 0;
  try {
    flushed = flushSpool(store, dir).flushed;
  } catch {
    flushed = 0;
  }

  let stored = false;
  let queued = false;
  try {
    if (item.memory) stored = store.add(item.memory, { actor: item.memory.tool ?? "hook", audit: false }).created;
    if (item.compress) queued = enqueueCompression(store, item.compress);
  } catch {
    spool();
  }

  let stdout = "";
  try {
    stdout = adapter.context(name, payload, store) ?? "";
  } catch {
    stdout = "";
  }
  try {
    store.close();
  } catch {
    // ignore
  }
  return { ...fallback, stdout, stored, queued, flushed };
}
