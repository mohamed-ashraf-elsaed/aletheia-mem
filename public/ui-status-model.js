// What the status bar shows, as plain data (T-206). Every value comes from an API answer; a source that has not
// answered yet gives state "unknown" and says so, and nothing is guessed. DOM-free, so it is unit-tested.
import { formatNumber, relativeTime } from "./ui-pure.js";

export const STATES = ["ok", "working", "warn", "error", "idle", "unknown"];
const HOUR = 3_600_000;
const STALE_SYNC_MS = 15 * 60_000;

const item = (id, label, state, summary, details = [], fix = null) => ({ id, label, state, summary, details, fix });

/** One of the nine indicators from the answers received so far. A missing answer is "unknown". */
export function buildIndicators({ health = null, work = null, sync = null, overview = null, live = "off", offline = false, now = Date.now() } = {}) {
  const out = [];

  if (offline) out.push(item("server", "Server", "error", "The server did not answer.", ["The page could not reach the Aletheia server."], "bun bin/aletheia-server.mjs"));
  else if (!health) out.push(item("server", "Server", "unknown", "Checking…", []));
  else out.push(item("server", "Server", health.status === "ok" ? "ok" : "error", health.status === "ok" ? "The server answered and its checks pass." : "The server answered, but a check failed.", [], health.status === "ok" ? null : "aletheia doctor"));

  const dbOk = health?.db?.ok;
  out.push(item("database", "Database", health ? (dbOk ? "ok" : "error") : "unknown", health ? (dbOk ? "SQLite quick check passed." : "SQLite quick check failed.") : "Waiting for the health check.", health?.db?.detail ? [health.db.detail] : [], dbOk === false ? "aletheia doctor" : null));

  const ftsOk = health?.fts?.ok;
  out.push(item("fts", "Search index", health ? (ftsOk ? "ok" : "error") : "unknown", health ? (ftsOk ? "The full-text index answers queries." : "The full-text index did not answer.") : "Waiting for the health check.", health?.fts?.detail ? [health.fts.detail] : [], ftsOk === false ? "aletheia optimize" : null));

  const vm = health?.vectors?.memories;
  const vf = health?.vectors?.facts;
  const vectorTotal = (vm ?? 0) + (vf ?? 0);
  out.push(item("vectors", "Vectors", !health ? "unknown" : vectorTotal > 0 ? "ok" : "idle",
    !health ? "Waiting for the health check." : vectorTotal > 0 ? `${formatNumber(vm ?? 0)} memory vectors and ${formatNumber(vf ?? 0)} fact vectors.` : "No vectors yet. Search uses keywords only; vectors are optional.",
    [], !health || vectorTotal > 0 ? null : "aletheia embed"));

  out.push(item("model", "Embedding model", !health ? "unknown" : vectorTotal > 0 ? "ok" : "idle",
    !health ? "Waiting for the health check." : vectorTotal > 0 ? "Vectors were written with this model." : "Configured model; no vectors use it yet.",
    health?.model ? [`model: ${health.model}`] : [], !health || vectorTotal > 0 ? null : "bun add @huggingface/transformers"));

  const q = work?.queue;
  if (!q) out.push(item("queue", "Queue", "unknown", "Waiting for the work overview.", []));
  else {
    const state = q.failed > 0 ? "error" : q.running > 0 ? "working" : q.pending > 0 ? "warn" : "ok";
    out.push(item("queue", `Queue ${formatNumber(q.depth ?? q.pending + q.running)}`, state,
      q.failed > 0 ? `${formatNumber(q.failed)} extraction job(s) failed.` : q.running > 0 ? `${formatNumber(q.running)} job(s) running, ${formatNumber(q.pending)} waiting.` : q.pending > 0 ? `${formatNumber(q.pending)} job(s) waiting for the worker.` : "The extraction queue is empty.",
      [`pending ${q.pending}`, `running ${q.running}`, `failed ${q.failed}`, `done ${q.done}`], q.failed > 0 || q.pending > 0 ? "aletheia compress" : null));
  }

  if (!work) out.push(item("extractor", "Extractor", "unknown", "Waiting for the work overview.", []));
  else {
    const provider = overview?.provider ?? null;
    out.push(item("extractor", `Extractor ${work.mode ?? "?"}`, "ok",
      provider && provider !== "none" ? `Mode ${work.mode}, model provider ${provider}.` : `Mode ${work.mode}, rule-based (no model provider is set).`,
      [`mode: ${work.mode}`, provider ? `provider: ${provider}` : "provider: not reported"], provider === "none" ? "ALETHEIA_PROVIDER=claude-cli bun bin/aletheia-server.mjs" : null));
  }

  if (!work) out.push(item("capture", "Capture", "unknown", "Waiting for the work overview.", []));
  else {
    const captures = (work.lastCapture ?? []).filter((entry) => entry.at);
    if (!captures.length) out.push(item("capture", "No capture yet", "idle", "No tool has sent anything yet.", [], "aletheia install claude-code --write"));
    else {
      const newest = captures.reduce((a, b) => (Date.parse(a.at) >= Date.parse(b.at) ? a : b));
      const age = now - Date.parse(newest.at);
      out.push(item("capture", `Capture ${relativeTime(newest.at, now)}`, age < HOUR ? "ok" : "idle",
        `The last capture was from ${newest.tool}, ${relativeTime(newest.at, now)}.`,
        captures.map((entry) => `${entry.tool}: ${relativeTime(entry.at, now)} (${formatNumber(entry.count)} rows)`), age < HOUR ? null : "aletheia doctor"));
    }
  }

  if (!sync) out.push(item("sync", "Sync", live === "off" && offline ? "error" : "unknown", "Waiting for the sync status.", []));
  else if (sync.error) out.push(item("sync", "Sync error", "error", `The sync status could not be read: ${sync.error}`, [], "aletheia sync status"));
  else {
    const devices = (sync.devices ?? []).filter((device) => !device.revoked);
    if (!devices.length) out.push(item("sync", "Sync off", "idle", "No device is paired, so nothing syncs.", [`epoch ${sync.epoch}`, `head seq ${sync.headSeq}`], "aletheia sync pair"));
    else {
      const pending = devices.reduce((sum, device) => sum + (device.pendingOps ?? 0), 0);
      const lastSeen = Math.max(...devices.map((device) => (device.lastSync ? Date.parse(device.lastSync) : 0)));
      const stale = pending > 0 && lastSeen > 0 && now - lastSeen > STALE_SYNC_MS;
      const state = pending === 0 ? "ok" : stale ? "warn" : "working";
      out.push(item("sync", pending === 0 ? "Sync connected" : stale ? `Sync behind ${formatNumber(pending)}` : `Syncing ${formatNumber(pending)}`, state,
        pending === 0 ? `${devices.length} device(s) paired and up to date.` : stale ? `${formatNumber(pending)} operation(s) are waiting and no device has synced for over 15 minutes.` : `${formatNumber(pending)} operation(s) are on their way to ${devices.length} device(s).`,
        devices.map((device) => `${device.name ?? device.deviceId}: ${device.lastSync ? relativeTime(device.lastSync, now) : "never synced"}, ${formatNumber(device.pendingOps ?? 0)} pending`), pending > 0 ? "aletheia sync run" : null));
    }
  }

  out.push(item("live", live === "on" ? "Live" : "Polling", live === "on" ? "ok" : "idle",
    live === "on" ? "The page gets change frames over a WebSocket." : "The page asks for updates on a timer. A WebSocket is not connected.", [], null));
  return out;
}

/** The favicon and the page's overall mood: error beats working beats idle. */
export function overallState(indicators, { refreshing = false } = {}) {
  if (indicators.some((entry) => entry.state === "error" && entry.id !== "sync")) return "error";
  if (refreshing || indicators.some((entry) => entry.state === "working")) return "working";
  return "idle";
}

/** Which indicators moved to "error" since the last time: they shake once and are announced. */
export function newErrors(previous, next) {
  const before = new Map(previous.map((entry) => [entry.id, entry.state]));
  return next.filter((entry) => entry.state === "error" && before.get(entry.id) !== "error");
}

/** Which indicators left "error": announced as recovered. */
export function recovered(previous, next) {
  const now = new Map(next.map((entry) => [entry.id, entry.state]));
  return previous.filter((entry) => entry.state === "error" && now.has(entry.id) && now.get(entry.id) !== "error");
}

/** The connection banner's words for a given attempt: the retry waits 2, 4, 8, 16, then 30 seconds. */
export function retryDelaySeconds(attempt) {
  return Math.min(30, 2 ** Math.max(1, attempt));
}

export function bannerText(secondsLeft, attempt) {
  return secondsLeft > 0 ? `Connection to the Aletheia server lost. Trying again in ${secondsLeft} s (attempt ${attempt}).` : "Connection to the Aletheia server lost. Trying now…";
}

/** A change frame from /v1/live: only kinds the page knows are acted on. */
export function frameKind(raw) {
  try {
    const frame = JSON.parse(raw);
    return ["session", "fact", "review"].includes(frame?.kind) ? frame.kind : null;
  } catch {
    return null;
  }
}
