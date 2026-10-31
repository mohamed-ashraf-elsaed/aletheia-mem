// Editable settings. Stored in the hub settings table under a namespace, so a saved value survives a
// restart. Every key is validated by kind and range before it is written.
// Only settings that code reads belong here. The provider, its chain and key, the fact budgets and excluded projects
// are environment variables (ALETHEIA_PROVIDER, ALETHEIA_PROVIDERS, ALETHEIA_FACT_MAX_EPISODES, ALETHEIA_FACT_CHAR_BUDGET,
// ALETHEIA_EXCLUDED_PROJECTS), and redaction is always on, so none of them is an editable setting.

const PREFIX = "ui.settings.";

export const SETTINGS_SCHEMA = [
  { key: "facts.minConfidence", kind: "number", label: "Fact confidence floor", min: 0.3, max: 0.9, default: 0.4, secret: false },
  { key: "context.facts", kind: "enum", label: "Facts in context", options: ["auto", "on", "off"], default: "auto", secret: false },
  { key: "rules.reviewDays", kind: "int", label: "Rule review window (days)", min: 7, max: 730, default: 90, secret: false },
];

const byKey = new Map(SETTINGS_SCHEMA.map((spec) => [spec.key, spec]));
const keyOf = (key) => `${PREFIX}${key}`;
const defaultFor = (spec) => (spec.kind === "boolean" ? false : spec.kind === "int" ? spec.default ?? spec.min : spec.kind === "number" ? spec.default ?? spec.min : spec.kind === "list" ? [] : spec.kind === "enum" ? spec.default ?? spec.options?.[0] ?? "" : "");

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
  if (spec.kind === "enum") {
    const options = spec.options ?? [];
    if (typeof value !== "string" || !options.includes(value)) return { ok: false, error: `${key} must be one of ${options.join(", ")}` };
    return { ok: true, value };
  }
  if (spec.kind === "int") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < spec.min || number > spec.max) return { ok: false, error: `${key} must be an integer between ${spec.min} and ${spec.max}` };
    return { ok: true, value: number };
  }
  if (spec.kind === "number") {
    const number = Number(value);
    if (!Number.isFinite(number) || number < spec.min || number > spec.max) return { ok: false, error: `${key} must be a number between ${spec.min} and ${spec.max}` };
    return { ok: true, value: number };
  }
  if (spec.kind === "boolean") {
    return typeof value === "boolean" ? { ok: true, value } : { ok: false, error: `${key} must be true or false` };
  }
  return { ok: false, error: `Unknown kind for ${key}` };
}

export function readSettings(store) {
  return SETTINGS_SCHEMA.map((spec) => ({
    key: spec.key,
    label: spec.label,
    kind: spec.kind,
    secret: false,
    value: store.setting(keyOf(spec.key), defaultFor(spec)),
    set: false,
    ...(spec.options ? { options: spec.options } : {}),
  }));
}

export function writeSettings(store, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { saved: [], errors: [{ key: null, error: "Body must be an object." }] };
  const saved = [];
  const errors = [];
  for (const spec of SETTINGS_SCHEMA) {
    if (!Object.hasOwn(patch, spec.key)) continue;
    const result = validateSetting(spec.key, patch[spec.key]);
    if (!result.ok) { errors.push({ key: spec.key, error: result.error }); continue; }
    store.setSetting(keyOf(spec.key), result.value);
    saved.push(spec.key);
  }
  return { saved, errors };
}
