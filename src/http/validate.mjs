// Request body validation (hand-rolled so the project has no dependencies).
// Each validator returns the clean value or throws ValidationError with {path, message} issues.
export class ValidationError extends Error {
  constructor(issues) {
    super(issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
    this.issues = issues;
  }
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function strictObject(value, allowed, required, path = []) {
  const issues = [];
  if (!isObject(value)) throw new ValidationError([{ path, message: "Expected an object" }]);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push({ path: [...path, key], message: "Unrecognized key" });
  for (const key of required) if (!(key in value)) issues.push({ path: [...path, key], message: "Required" });
  if (issues.length) throw new ValidationError(issues);
  return value;
}

function str(value, path, { min = 0, max = Infinity, trim = false, pattern = null } = {}) {
  if (typeof value !== "string") throw new ValidationError([{ path, message: "Expected a string" }]);
  const v = trim ? value.trim() : value;
  if (v.length < min) throw new ValidationError([{ path, message: `Must be at least ${min} character${min === 1 ? "" : "s"}` }]);
  if (v.length > max) throw new ValidationError([{ path, message: `Must be at most ${max} characters` }]);
  if (pattern && !pattern.test(v)) throw new ValidationError([{ path, message: "Invalid format" }]);
  return v;
}

export function validateReview(body) {
  strictObject(body, ["requestId", "expectedFingerprint", "checked"], ["requestId", "expectedFingerprint", "checked"]);
  if (typeof body.checked !== "boolean") throw new ValidationError([{ path: ["checked"], message: "Expected a boolean" }]);
  return {
    requestId: str(body.requestId, ["requestId"], { min: 1, max: 2000 }),
    expectedFingerprint: str(body.expectedFingerprint, ["expectedFingerprint"], { pattern: /^[a-f0-9]{64}$/ }),
    checked: body.checked,
  };
}

const RULE_ACTIONS = ["approve", "edit", "turn-off", "turn-on", "dismiss", "add", "replace", "restore-suggestion"];

export function validateRuleAction(body) {
  strictObject(body, ["action", "ruleId", "rule"], ["action"]);
  if (!RULE_ACTIONS.includes(body.action)) throw new ValidationError([{ path: ["action"], message: `Expected one of ${RULE_ACTIONS.join(", ")}` }]);
  const out = { action: body.action };
  if (body.ruleId !== undefined) out.ruleId = str(body.ruleId, ["ruleId"], { min: 1, max: 80 });
  if (body.rule !== undefined) {
    strictObject(body.rule, ["scopeTier", "scopeName", "when", "then"], ["scopeTier", "scopeName", "when", "then"], ["rule"]);
    if (!["everywhere", "project", "situation"].includes(body.rule.scopeTier)) throw new ValidationError([{ path: ["rule", "scopeTier"], message: "Expected everywhere, project or situation" }]);
    out.rule = {
      scopeTier: body.rule.scopeTier,
      scopeName: str(body.rule.scopeName, ["rule", "scopeName"], { max: 80 }),
      when: str(body.rule.when, ["rule", "when"], { max: 300 }),
      then: str(body.rule.then, ["rule", "then"], { min: 1, max: 600, trim: true }),
    };
  }
  return out;
}

export function validateMarkFinished(body) {
  strictObject(body, ["agentGroupId"], ["agentGroupId"]);
  return { agentGroupId: str(body.agentGroupId, ["agentGroupId"], { min: 1, max: 2000 }) };
}

/** Body of POST /api/work-state/entries: {cwd, list, fields}. */
export function validateWorkStateWrite(body) {
  if (!isObject(body)) throw new ValidationError([{ path: [], message: "Expected an object" }]);
  const cwd = str(body.cwd, ["cwd"], { min: 1, trim: true });
  const list = str(body.list, ["list"], { min: 1, max: 200, trim: true });
  const fields = body.fields;
  if (!isObject(fields)) throw new ValidationError([{ path: ["fields"], message: "Expected an object" }]);
  const entries = Object.entries(fields);
  if (!entries.length) throw new ValidationError([{ path: ["fields"], message: "fields must set at least one key" }]);
  for (const [key, value] of entries) {
    const ok = key.length > 0 && (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))));
    if (!ok) throw new ValidationError([{ path: ["fields", key], message: "fields must map non-empty keys to strings, safe finite numbers, booleans or null" }]);
  }
  if (JSON.stringify(fields).length > 2000) throw new ValidationError([{ path: ["fields"], message: "fields must be at most 2000 characters as JSON" }]);
  return { cwd, list, fields: { ...fields } };
}
