// Editable settings (T-078). Stored in the hub settings table under a namespace, so a saved value survives a
// restart. Secrets are never returned: GET returns a mask and PUT replaces the value only when a non-empty one
// is sent. Every other key is validated by kind and range before it is written.

const PREFIX = "ui.settings.";

export const SETTINGS_SCHEMA = [
  { key: "provider", kind: "string", label: "Provider", secret: false },
  { key: "providers", kind: "list", label: "Provider chain", secret: false },
  { key: "factBudget.maxEpisodes", kind: "int", label: "Fact episodes budget", min: 1, max: 1000, secret: false },
  { key: "factBudget.maxChars", kind: "int", label: "Fact characters budget", min: 100, max: 200000, secret: false },
  { key: "rules.reviewDays", kind: "int", label: "Rule review window (days)", min: 7, max: 730, default: 90, secret: false },
  { key: "redaction", kind: "boolean", label: "Redact before storing", secret: false },
  { key: "excludedProjects", kind: "list", label: "Excluded projects", secret: false },
  { key: "apiKey", kind: "string", label: "API key", secret: true },
];

const byKey = new Map(SETTINGS_SCHEMA.map((spec) => [spec.key, spec]));
const keyOf = (key) => `${PREFIX}${key}`;
const defaultFor = (spec) => (spec.kind === "boolean" ? false : spec.kind === "int" ? spec.default ?? spec.min : spec.kind === "list" ? [] : "");

export function validateSetting(key, value) {
  const spec = byKey.get(key);
  if (!spec) return { ok: false, error: `Unknown setting: ${key}` };
  if (spec.kind === "string") {
    return typeof value === "string" ? { ok: true, value } : { ok: false, error: `${key} must be a string` };
  }
  if (spec.kind === "list") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return { ok: false, error: `${key} must be an array of strings` };
    return { ok: true, value: value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 200) };
  }
  if (spec.kind === "int") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < spec.min || number > spec.max) return { ok: false, error: `${key} must be an integer between ${spec.min} and ${spec.max}` };
    return { ok: true, value: number };
  }
  if (spec.kind === "boolean") {
    return typeof value === "boolean" ? { ok: true, value } : { ok: false, error: `${key} must be true or false` };
  }
  return { ok: false, error: `Unknown kind for ${key}` };
}

export function readSettings(store) {
  return SETTINGS_SCHEMA.map((spec) => {
    const value = store.setting(keyOf(spec.key), defaultFor(spec));
    const hasSecret = spec.secret && value != null && value !== "";
    return { key: spec.key, label: spec.label, kind: spec.kind, secret: spec.secret, value: hasSecret ? "••••••••" : value, set: hasSecret };
  });
}

export function writeSettings(store, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { saved: [], errors: [{ key: null, error: "Body must be an object." }] };
  const saved = [];
  const errors = [];
  for (const spec of SETTINGS_SCHEMA) {
    if (!Object.hasOwn(patch, spec.key)) continue;
    const raw = patch[spec.key];
    if (spec.secret) {
      if (raw == null || raw === "") continue;
      if (typeof raw !== "string") { errors.push({ key: spec.key, error: `${spec.key} must be a string` }); continue; }
      store.setSetting(keyOf(spec.key), raw);
      saved.push(spec.key);
      continue;
    }
    const result = validateSetting(spec.key, raw);
    if (!result.ok) { errors.push({ key: spec.key, error: result.error }); continue; }
    store.setSetting(keyOf(spec.key), result.value);
    saved.push(spec.key);
  }
  return { saved, errors };
}
