// Small helpers shared by every module.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export { sha256 } from "./hash.mjs";

export const lower = (value) => String(value ?? "").replace(/[A-Z]/g, (ch) => ch.toLowerCase());

export const isoFromEpoch = (epoch) => (Number.isFinite(Number(epoch)) && Number(epoch) > 0 ? new Date(Number(epoch)).toISOString() : null);

/** Collapse whitespace, trim, and cut to `max` characters with an ellipsis. Non-scalars give null. */
export function clip(value, max = 260) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** First string field of `fields` (in `names` order) that is not a bare boolean/number/null word. */
export function fieldText(fields, names, max = 260) {
  for (const name of names) {
    if (typeof fields?.[name] !== "string") continue;
    const text = clip(fields[name], max);
    if (text && /^(?:true|false|null|undefined|[-+]?\d+(?:\.\d+)?)$/i.test(text)) continue;
    if (text) return { text, source: "work-state-field", field: name };
  }
  return null;
}

export function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function writeJsonAtomic(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  renameSync(tmp, path);
}

/** Run a SELECT; a missing table or column yields [] so an older database still renders. */
export function safeAll(db, sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (error) {
    if (/no such (table|column)/i.test(String(error.message))) return [];
    throw error;
  }
}

export const placeholders = (values) => values.map(() => "?").join(",");

export const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};

/** JSON with object keys sorted, for stable fingerprints. */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}
