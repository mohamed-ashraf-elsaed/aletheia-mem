// Audit export (T-093): render the append-only sync audit log as JSONL (default) or CSV, with an
// optional date range. Reads the existing `sync_audit` table and adds no new table or column. The audit
// table stores ids and counts, never payloads or secrets, so the export cannot leak them either.
import { stableStringify } from "./sync/engine.mjs";

const parseJson = (value, fallback = null) => {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/** Accept an epoch-millisecond number or an ISO date string; null when invalid or empty. */
export function epochOrNull(value) {
  if (value == null || value === "") return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** One stable, self-contained export row. Every `sync_audit` column is present, so it round-trips. */
export function auditRowView(row) {
  return {
    id: row.id,
    account_id: row.account_id,
    ts: row.ts,
    token_id: row.token_id ?? null,
    device_id: row.device_id ?? null,
    action: row.action,
    result: row.result,
    target: parseJson(row.detail),
  };
}

/** The identity that performed the action, for the human-readable CSV `actor` column. */
export function actorOf(row) {
  if (row.token_id != null) return `token:${row.token_id}`;
  if (row.device_id != null) return `device:${row.device_id}`;
  return "";
}

/** All audit rows for one account in ascending id order, filtered to the inclusive `from`/`to` window. */
export function auditExportRows(store, accountId, { from = null, to = null } = {}) {
  const fromTs = epochOrNull(from);
  const toTs = epochOrNull(to);
  const where = ["account_id = ?"];
  const params = [Number(accountId)];
  if (fromTs != null) { where.push("ts >= ?"); params.push(fromTs); }
  if (toTs != null) { where.push("ts <= ?"); params.push(toTs); }
  return store.db.prepare(`SELECT id, account_id, token_id, device_id, action, detail, result, ts FROM sync_audit WHERE ${where.join(" AND ")} ORDER BY id ASC`)
    .all(...params)
    .map(auditRowView);
}

const csvCell = (value) => {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function exportAuditJsonl(rows) {
  return `${rows.map((row) => stableStringify(row)).join("\n")}${rows.length ? "\n" : ""}`;
}

export function exportAuditCsv(rows) {
  const header = ["id", "account_id", "ts", "iso", "actor", "action", "result", "target"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      csvCell(row.id),
      csvCell(row.account_id),
      csvCell(row.ts),
      csvCell(new Date(row.ts).toISOString()),
      csvCell(actorOf(row)),
      csvCell(row.action),
      csvCell(row.result),
      csvCell(row.target == null ? "" : stableStringify(row.target)),
    ].join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Render the export for a format. Returns { body, contentType, filename, count }. */
export function exportAudit(store, accountId, { from = null, to = null, format = "jsonl" } = {}) {
  const rows = auditExportRows(store, accountId, { from, to });
  const kind = format === "csv" ? "csv" : "jsonl";
  const date = new Date().toISOString().slice(0, 10);
  return {
    body: kind === "csv" ? exportAuditCsv(rows) : exportAuditJsonl(rows),
    contentType: kind === "csv" ? "text/csv; charset=utf-8" : "application/x-ndjson; charset=utf-8",
    filename: `aletheia-audit-${date}.${kind === "csv" ? "csv" : "jsonl"}`,
    count: rows.length,
  };
}
