// What the status bar shows, as plain data. Every value comes from an API answer; a source that has not
// answered yet gives state "unknown" and says so, and nothing is guessed. DOM-free, so it is unit-tested.
import { t } from "./ui-i18n.js";
import { formatNumber, relativeTime } from "./ui-pure.js";

export const STATES = ["ok", "working", "warn", "error", "idle", "unknown"];
const HOUR = 3_600_000;
const STALE_SYNC_MS = 15 * 60_000;

const item = (id, label, state, summary, details = [], fix = null) => ({ id, label, state, summary, details, fix });

/** One of the nine indicators from the answers received so far. A missing answer is "unknown". */
export function buildIndicators({ health = null, work = null, sync = null, overview = null, live = "off", offline = false, now = Date.now() } = {}) {
  const out = [];

  if (offline) out.push(item("server", t("status.server"), "error", t("status.serverDown"), [t("status.serverDownDetail")], "bun bin/aletheia-server.mjs"));
  else if (!health) out.push(item("server", t("status.server"), "unknown", t("status.checking"), []));
  else out.push(item("server", t("status.server"), health.status === "ok" ? "ok" : "error", health.status === "ok" ? t("status.serverOk") : t("status.serverCheckFailed"), [], health.status === "ok" ? null : "aletheia doctor"));

  const dbOk = health?.db?.ok;
  out.push(item("database", t("status.database"), health ? (dbOk ? "ok" : "error") : "unknown", health ? (dbOk ? t("status.dbOk") : t("status.dbFailed")) : t("status.waitingHealth"), health?.db?.detail ? [health.db.detail] : [], dbOk === false ? "aletheia doctor" : null));

  const ftsOk = health?.fts?.ok;
  out.push(item("fts", t("status.searchIndex"), health ? (ftsOk ? "ok" : "error") : "unknown", health ? (ftsOk ? t("status.ftsOk") : t("status.ftsFailed")) : t("status.waitingHealth"), health?.fts?.detail ? [health.fts.detail] : [], ftsOk === false ? "aletheia optimize" : null));

  const vm = health?.vectors?.memories;
  const vf = health?.vectors?.facts;
  const vectorTotal = (vm ?? 0) + (vf ?? 0);
  out.push(item("vectors", t("status.vectors"), !health ? "unknown" : vectorTotal > 0 ? "ok" : "idle",
    !health ? t("status.waitingHealth") : vectorTotal > 0 ? t("status.vectorsCount", { memories: formatNumber(vm ?? 0), facts: formatNumber(vf ?? 0) }) : t("status.vectorsNone"),
    [], !health || vectorTotal > 0 ? null : "aletheia embed"));

  out.push(item("model", t("status.model"), !health ? "unknown" : vectorTotal > 0 ? "ok" : "idle",
    !health ? t("status.waitingHealth") : vectorTotal > 0 ? t("status.modelUsed") : t("status.modelUnused"),
    health?.model ? [t("status.modelDetail", { model: health.model })] : [], !health || vectorTotal > 0 ? null : "bun add @huggingface/transformers"));

  const q = work?.queue;
  if (!q) out.push(item("queue", t("status.queue"), "unknown", t("status.waitingWork"), []));
  else {
    const state = q.failed > 0 ? "error" : q.running > 0 ? "working" : q.pending > 0 ? "warn" : "ok";
    out.push(item("queue", t("status.queueCount", { count: formatNumber(q.depth ?? q.pending + q.running) }), state,
      q.failed > 0 ? t("status.queueFailed", { count: formatNumber(q.failed) }) : q.running > 0 ? t("status.queueRunning", { running: formatNumber(q.running), pending: formatNumber(q.pending) }) : q.pending > 0 ? t("status.queuePending", { count: formatNumber(q.pending) }) : t("status.queueEmpty"),
      [t("status.qPending", { count: q.pending }), t("status.qRunning", { count: q.running }), t("status.qFailed", { count: q.failed }), t("status.qDone", { count: q.done })], q.failed > 0 || q.pending > 0 ? "aletheia compress" : null));
  }

  if (!work) out.push(item("extractor", t("status.extractor"), "unknown", t("status.waitingWork"), []));
  else {
    const provider = overview?.provider ?? null;
    out.push(item("extractor", t("status.extractorMode", { mode: work.mode ?? "?" }), "ok",
      provider && provider !== "none" ? t("status.extractorProvider", { mode: work.mode, provider }) : t("status.extractorRules", { mode: work.mode }),
      [t("status.modeDetail", { mode: work.mode }), provider ? t("status.providerDetail", { provider }) : t("status.providerUnknown")], provider === "none" ? "ALETHEIA_PROVIDER=claude-cli bun bin/aletheia-server.mjs" : null));
  }

  if (!work) out.push(item("capture", t("status.capture"), "unknown", t("status.waitingWork"), []));
  else {
    const captures = (work.lastCapture ?? []).filter((entry) => entry.at);
    if (!captures.length) out.push(item("capture", t("status.noCapture"), "idle", t("status.noCaptureSummary"), [], "aletheia install claude-code --write"));
    else {
      const newest = captures.reduce((a, b) => (Date.parse(a.at) >= Date.parse(b.at) ? a : b));
      const age = now - Date.parse(newest.at);
      out.push(item("capture", t("status.captureAgo", { ago: relativeTime(newest.at, now) }), age < HOUR ? "ok" : "idle",
        t("status.captureLast", { tool: newest.tool, ago: relativeTime(newest.at, now) }),
        captures.map((entry) => t("status.captureRow", { tool: entry.tool, ago: relativeTime(entry.at, now), count: formatNumber(entry.count) })), age < HOUR ? null : "aletheia doctor"));
    }
  }

  if (!sync) out.push(item("sync", t("status.sync"), live === "off" && offline ? "error" : "unknown", t("status.waitingSync"), []));
  else if (sync.error) out.push(item("sync", t("status.syncError"), "error", t("status.syncErrorSummary", { error: sync.error }), [], "aletheia sync status"));
  else {
    const devices = (sync.devices ?? []).filter((device) => !device.revoked);
    if (!devices.length) out.push(item("sync", t("status.syncOff"), "idle", t("status.syncOffSummary"), [t("status.syncEpoch", { epoch: sync.epoch }), t("status.syncHead", { seq: sync.headSeq })], "aletheia sync pair"));
    else {
      const pending = devices.reduce((sum, device) => sum + (device.pendingOps ?? 0), 0);
      const lastSeen = Math.max(...devices.map((device) => (device.lastSync ? Date.parse(device.lastSync) : 0)));
      const stale = pending > 0 && lastSeen > 0 && now - lastSeen > STALE_SYNC_MS;
      const state = pending === 0 ? "ok" : stale ? "warn" : "working";
      out.push(item("sync", pending === 0 ? t("status.syncConnected") : stale ? t("status.syncBehind", { count: formatNumber(pending) }) : t("status.syncing", { count: formatNumber(pending) }), state,
        pending === 0 ? t("status.syncUpToDate", { devices: devices.length }) : stale ? t("status.syncStale", { count: formatNumber(pending) }) : t("status.syncOnWay", { count: formatNumber(pending), devices: devices.length }),
        devices.map((device) => t("status.syncDevice", { name: device.name ?? device.deviceId, when: device.lastSync ? relativeTime(device.lastSync, now) : t("status.neverSynced"), count: formatNumber(device.pendingOps ?? 0) })), pending > 0 ? "aletheia sync run" : null));
    }
  }

  out.push(item("live", live === "on" ? t("status.live") : t("status.polling"), live === "on" ? "ok" : "idle",
    live === "on" ? t("status.liveSummary") : t("status.pollingSummary"), [], null));
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
  return secondsLeft > 0 ? t("status.bannerRetry", { seconds: secondsLeft, attempt }) : t("status.bannerNow");
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
