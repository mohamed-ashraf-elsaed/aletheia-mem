// Alert rules and delivery. Rules match events from the audit stream, the extraction queue and the sync
// hub; a match queues one delivery to a webhook or a local file. Webhook delivery signs the body with
// HMAC-SHA256, retries with exponential backoff, times out, and refuses private/loopback/link-local targets
// unless the rule says --allow-private. A rate limit per rule stops an alert storm. No telemetry.
import { Database } from "bun:sqlite";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const ALERT_EVENTS = ["device.paired", "token.revoked", "quota.hit", "sync.error", "extraction.failed", "queue.depth"];
export const ALERT_TARGETS = ["webhook", "file"];
export const SIGNATURE_HEADER = "x-aletheia-signature";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS alert_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  count_threshold INTEGER NOT NULL DEFAULT 1,
  min_value REAL,
  window_s INTEGER NOT NULL DEFAULT 3600,
  target TEXT NOT NULL DEFAULT 'file',
  url TEXT,
  path TEXT,
  secret TEXT,
  allow_private INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  rate_limit_s INTEGER NOT NULL DEFAULT 300,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  value REAL,
  detail TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alert_event ON alert_event(event, at);
CREATE TABLE IF NOT EXISTS alert_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  event_id INTEGER,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_epoch INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_due ON alert_delivery(status, next_attempt_epoch, id);
`;

const parse = (value, fallback) => {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

function checkRule(input) {
  const event = String(input.event ?? "").trim();
  if (!ALERT_EVENTS.includes(event)) throw new RangeError(`event must be one of ${ALERT_EVENTS.join(", ")}.`);
  const target = String(input.target ?? "").trim();
  if (!ALERT_TARGETS.includes(target)) throw new RangeError(`target must be one of ${ALERT_TARGETS.join(", ")}.`);
  const countThreshold = Math.max(1, Number(input.countThreshold ?? 1) || 1);
  const minValue = input.minValue == null || input.minValue === "" ? null : Number(input.minValue);
  if (minValue != null && !Number.isFinite(minValue)) throw new RangeError("minValue must be a number.");
  const windowS = Math.max(1, Number(input.windowS ?? 3600) || 3600);
  const rateLimitS = Math.max(0, Number(input.rateLimitS ?? 300) || 0);
  const url = input.url == null ? null : String(input.url);
  const path = input.path == null ? null : String(input.path);
  if (target === "webhook") {
    if (!url) throw new RangeError("A webhook rule needs --url.");
    let parsed;
    try { parsed = new URL(url); } catch { throw new RangeError("The webhook URL is not valid."); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new RangeError("A webhook must use http or https.");
  }
  if (target === "file" && !path) throw new RangeError("A file rule needs --path.");
  return {
    name: String(input.name ?? event).slice(0, 200) || event,
    event,
    countThreshold,
    minValue,
    windowS,
    target,
    url: target === "webhook" ? url : null,
    path: target === "file" ? path : null,
    secret: input.secret == null || input.secret === "" ? null : String(input.secret),
    allowPrivate: input.allowPrivate === true,
    enabled: input.enabled !== false,
    rateLimitS,
  };
}

const ruleView = (row) => row && {
  id: row.id,
  name: row.name,
  event: row.event,
  countThreshold: row.count_threshold,
  minValue: row.min_value,
  windowS: row.window_s,
  target: row.target,
  url: row.url,
  path: row.path,
  hasSecret: !!row.secret,
  allowPrivate: !!row.allow_private,
  enabled: !!row.enabled,
  rateLimitS: row.rate_limit_s,
  createdAt: new Date(row.created_at).toISOString(),
};

const deliveryView = (row) => row && {
  id: row.id,
  ruleId: row.rule_id,
  event: row.event,
  payload: parse(row.payload, null),
  status: row.status,
  attempts: row.attempts,
  nextAttemptEpoch: row.next_attempt_epoch || null,
  lastError: row.last_error,
  createdAt: new Date(row.created_at).toISOString(),
  deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
};

export class AlertStore {
  constructor(path) {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  addRule(input, { now = Date.now() } = {}) {
    const rule = checkRule(input);
    const info = this.db.prepare(`INSERT INTO alert_rule (name, event, count_threshold, min_value, window_s, target, url, path, secret, allow_private, enabled, rate_limit_s, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(rule.name, rule.event, rule.countThreshold, rule.minValue, rule.windowS, rule.target, rule.url, rule.path, rule.secret, rule.allowPrivate ? 1 : 0, rule.enabled ? 1 : 0, rule.rateLimitS, now);
    return this.getRule(Number(info.lastInsertRowid));
  }

  getRule(id) {
    return ruleView(this.db.prepare("SELECT * FROM alert_rule WHERE id = ?").get(Number(id)));
  }

  listRules() {
    return this.db.prepare("SELECT * FROM alert_rule ORDER BY id").all().map(ruleView);
  }

  updateRule(id, patch) {
    const current = this.db.prepare("SELECT * FROM alert_rule WHERE id = ?").get(Number(id));
    if (!current) return null;
    const merged = checkRule({
      name: patch.name ?? current.name,
      event: patch.event ?? current.event,
      countThreshold: patch.countThreshold ?? current.count_threshold,
      minValue: patch.minValue !== undefined ? patch.minValue : current.min_value,
      windowS: patch.windowS ?? current.window_s,
      target: patch.target ?? current.target,
      url: patch.url !== undefined ? patch.url : current.url,
      path: patch.path !== undefined ? patch.path : current.path,
      secret: patch.secret !== undefined ? patch.secret : current.secret,
      allowPrivate: patch.allowPrivate !== undefined ? patch.allowPrivate : !!current.allow_private,
      enabled: patch.enabled !== undefined ? patch.enabled : !!current.enabled,
      rateLimitS: patch.rateLimitS ?? current.rate_limit_s,
    });
    this.db.prepare(`UPDATE alert_rule SET name=?, event=?, count_threshold=?, min_value=?, window_s=?, target=?, url=?, path=?, secret=?, allow_private=?, enabled=?, rate_limit_s=? WHERE id=?`)
      .run(merged.name, merged.event, merged.countThreshold, merged.minValue, merged.windowS, merged.target, merged.url, merged.path, merged.secret, merged.allowPrivate ? 1 : 0, merged.enabled ? 1 : 0, merged.rateLimitS, Number(id));
    return this.getRule(id);
  }

  removeRule(id) {
    return this.db.prepare("DELETE FROM alert_rule WHERE id = ?").run(Number(id)).changes > 0;
  }

  /**
   * Record one event and queue the deliveries its rules ask for. `detail` must already be safe to store: ids and
   * counts, never a payload or a secret. A rule with countThreshold N waits until N matching events fall inside
   * its window; a rule with minValue compares the event's numeric value.
   */
  emit(event, { value = null, detail = null, now = Date.now() } = {}) {
    if (!ALERT_EVENTS.includes(event)) throw new RangeError(`Unknown alert event "${event}".`);
    const eventInfo = this.db.prepare("INSERT INTO alert_event (event, value, detail, at) VALUES (?,?,?,?)")
      .run(event, value == null ? null : Number(value), detail == null ? null : JSON.stringify(detail), now);
    const eventId = Number(eventInfo.lastInsertRowid);
    const created = [];
    for (const row of this.db.prepare("SELECT * FROM alert_rule WHERE event = ? AND enabled = 1").all(event)) {
      if (Number(row.count_threshold) > 1) {
        const count = this.db.prepare("SELECT COUNT(*) AS n FROM alert_event WHERE event = ? AND at >= ?").get(event, now - Number(row.window_s) * 1000).n;
        if (count < Number(row.count_threshold)) continue;
      }
      if (row.min_value != null && (value == null || Number(value) < Number(row.min_value))) continue;
      if (Number(row.rate_limit_s) > 0) {
        const recent = this.db.prepare("SELECT 1 FROM alert_delivery WHERE rule_id = ? AND created_at >= ? LIMIT 1").get(row.id, now - Number(row.rate_limit_s) * 1000);
        if (recent) continue;
      }
      const payload = JSON.stringify({ event, value: value == null ? null : Number(value), detail: detail ?? null, at: new Date(now).toISOString(), rule: { id: row.id, name: row.name } });
      const info = this.db.prepare("INSERT INTO alert_delivery (rule_id, event_id, event, payload, status, attempts, next_attempt_epoch, created_at) VALUES (?,?,?,?, 'pending', 0, ?, ?)")
        .run(row.id, eventId, event, payload, now, now);
      created.push(Number(info.lastInsertRowid));
    }
    return created;
  }

  due({ now = Date.now(), limit = 50 } = {}) {
    return this.db.prepare("SELECT * FROM alert_delivery WHERE status = 'pending' AND next_attempt_epoch <= ? ORDER BY id LIMIT ?").all(now, Math.min(Math.max(Number(limit) || 50, 1), 500)).map(deliveryView);
  }

  feed({ limit = 100 } = {}) {
    return this.db.prepare("SELECT * FROM alert_delivery ORDER BY id DESC LIMIT ?").all(Math.min(Math.max(Number(limit) || 100, 1), 500)).map(deliveryView);
  }

  /** Queue one delivery for one rule without matching an event (the UI/CLI "test" button). */
  testRule(id, { now = Date.now() } = {}) {
    const row = this.db.prepare("SELECT * FROM alert_rule WHERE id = ?").get(Number(id));
    if (!row) return null;
    const payload = JSON.stringify({ event: row.event, value: null, detail: { test: true }, at: new Date(now).toISOString(), rule: { id: row.id, name: row.name } });
    const info = this.db.prepare("INSERT INTO alert_delivery (rule_id, event_id, event, payload, status, attempts, next_attempt_epoch, created_at) VALUES (?, NULL, ?, ?, 'pending', 0, ?, ?)")
      .run(row.id, row.event, payload, now, now);
    return Number(info.lastInsertRowid);
  }

  markDelivered(id, now = Date.now()) {
    this.db.prepare("UPDATE alert_delivery SET status = 'delivered', delivered_at = ?, last_error = NULL WHERE id = ?").run(now, Number(id));
  }

  markRetry(id, { attempts, lastError, nextAttemptEpoch, now = Date.now() } = {}) {
    this.db.prepare("UPDATE alert_delivery SET status = 'pending', attempts = ?, last_error = ?, next_attempt_epoch = ?, created_at = created_at WHERE id = ?")
      .run(Number(attempts) || 0, String(lastError ?? "").slice(0, 800), Number(nextAttemptEpoch) || now, Number(id));
  }

  markFailed(id, lastError, now = Date.now()) {
    this.db.prepare("UPDATE alert_delivery SET status = 'failed', last_error = ?, delivered_at = NULL WHERE id = ?").run(String(lastError ?? "").slice(0, 800), Number(id));
  }
}

/** `sha256=<hex>` over the exact request body. Exported so a receiver can check it without guessing. */
export function signPayload(secret, body) {
  return `sha256=${createHmac("sha256", String(secret ?? "")).update(String(body)).digest("hex")}`;
}

export function isPrivateAddress(address) {
  const value = String(address ?? "").trim().toLowerCase();
  if (!value) return true;
  if (isIP(value) === 4) {
    const parts = value.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (isIP(value) === 6) {
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("fe80") || value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
    return false;
  }
  return true;
}

/**
 * True when a URL points at a private, loopback or link-local target. The hostname is resolved, so a public
 * name that maps to 127.0.0.1 is refused too. A name that does not resolve is refused (fail closed).
 */
export async function isPrivateTarget(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return true; }
  if (!["http:", "https:"].includes(parsed.protocol)) return true;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isIP(host)) return isPrivateAddress(host);
  let addresses;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    return true;
  }
  if (!addresses.length) return true;
  return addresses.some((entry) => isPrivateAddress(entry.address));
}

const backoffFor = (attempts) => Math.min(60_000, 1000 * 2 ** Math.max(0, Number(attempts) - 1));

/**
 * Deliver every due row once. A 2xx webhook or a successful file append is final. 5xx/429, a timeout or a
 * network error retries with exponential backoff; other 4xx and a blocked target fail immediately. No rule means
 * no network call.
 */
export async function deliverDue(store, { fetchImpl = fetch, now = Date.now(), timeoutMs = 5000, maxAttempts = 5, limit = 50 } = {}) {
  const rows = store.due({ now, limit });
  const result = { delivered: 0, retried: 0, failed: 0, blocked: 0, skipped: 0 };
  for (const row of rows) {
    const rule = store.getRule(row.ruleId);
    if (!rule || !rule.enabled) {
      store.markFailed(row.id, "the rule was removed or disabled");
      result.skipped++;
      continue;
    }
    const body = JSON.stringify(row.payload);
    const retry = (message) => {
      const attempts = Number(row.attempts) + 1;
      if (attempts >= maxAttempts) {
        store.markFailed(row.id, message);
        result.failed++;
        return;
      }
      store.markRetry(row.id, { attempts, lastError: message, nextAttemptEpoch: now + backoffFor(attempts) });
      result.retried++;
    };
    try {
      if (rule.target === "file") {
        mkdirSync(dirname(rule.path), { recursive: true });
        appendFileSync(rule.path, `${body}\n`);
        store.markDelivered(row.id, now);
        result.delivered++;
        continue;
      }
      if (!rule.allowPrivate && await isPrivateTarget(rule.url)) {
        store.markFailed(row.id, "refused a private, loopback or link-local target; set allow-private on the rule");
        result.blocked++;
        continue;
      }
      const headers = { "Content-Type": "application/json", "X-Aletheia-Event": rule.event };
      if (rule.hasSecret) {
        // Read the secret from the rule row; ruleView hides it.
        const secretRow = store.db.prepare("SELECT secret FROM alert_rule WHERE id = ?").get(rule.id);
        if (secretRow?.secret) headers[SIGNATURE_HEADER] = signPayload(secretRow.secret, body);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 5000));
      let response;
      try {
        response = await fetchImpl(rule.url, { method: "POST", headers, body, signal: controller.signal, redirect: "manual" });
      } finally {
        clearTimeout(timer);
      }
      if (response.ok) {
        store.markDelivered(row.id, now);
        result.delivered++;
      } else if (response.status >= 500 || response.status === 429) {
        retry(`HTTP ${response.status}`);
      } else {
        store.markFailed(row.id, `HTTP ${response.status}`);
        result.failed++;
      }
    } catch (error) {
      retry(error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

/** A lazy background delivery loop for the server. Unref'd so it never holds the process open. */
export function startAlertDelivery(store, { intervalMs = 2000, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  let stopped = false;
  let running = false;
  const timer = setInterval(async () => {
    if (stopped || running) return;
    running = true;
    try {
      await deliverDue(store, { fetchImpl, timeoutMs });
    } catch {
      // a delivery loop never takes the server down
    } finally {
      running = false;
    }
  }, Math.max(500, Number(intervalMs) || 2000));
  timer.unref?.();
  return { stop() { stopped = true; clearInterval(timer); } };
}

/** Queue depth from the hub's jobs table. */
export function queueDepth(hub) {
  try {
    return hub.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('pending','running')").get().n;
  } catch {
    return 0;
  }
}

/** Failed extraction jobs whose last update is inside the window. */
export function extractionFailures(hub, { since = Date.now() - 60 * 60_000 } = {}) {
  try {
    return hub.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE status = 'failed' AND updated_at_epoch >= ?").get(Number(since)).n;
  } catch {
    return 0;
  }
}
