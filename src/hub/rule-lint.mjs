// Rule hygiene (T-072): find duplicate rules, direct always/never contradictions, over-long rules and rule sets,
// rules that tell an agent to ignore safety, secrets inside a rule, and drift between a managed block and the
// store. Every finding carries the rule id (or the file and line for drift) and a fix hint. Nothing here blocks
// sync; the checks return warnings.
import { existsSync, readFileSync } from "node:fs";
import { MARK_BEGIN } from "./tools.mjs";
import { redact } from "./redact.mjs";
import { parseRulesFromText } from "./rules-sync.mjs";

export const DEFAULT_BUDGET = { maxRuleChars: 300, maxTotalChars: 4000 };

const POSITIVE = /\b(always|must|should|do|use|prefer|include|run|add|enable)\b/;
const NEGATIVE = /\b(never|must not|do not|don't|avoid|skip|omit|disable)\b/;

const SAFETY = [
  /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above)\s+instructions?\b/i,
  /\bignore\s+(all\s+|any\s+|the\s+)?safety\b/i,
  /\b(disable|bypass|skip)\s+(all\s+|the\s+)?(safety|security)\b/i,
  /\b(exfiltrat\w*|send\s+(the\s+)?(credentials|secrets?|tokens?))\b/i,
  /\bdisable\s+(auth|authentication|authorization)\b/i,
  /\brm\s+-rf\s+\/(\s|$)/i,
  /\bcurl\b[^\n]*\|\s*(ba)?sh\b/i,
];

export function normalizeRuleText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function polarity(normalized) {
  if (NEGATIVE.test(normalized)) return -1;
  if (POSITIVE.test(normalized)) return 1;
  return 0;
}

function core(normalized) {
  return normalized
    .replace(/\b(always|never|must|should|do|not|don't|avoid|skip|omit|disable|please|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const ruleKey = (rule) => `${rule.scopeTier ?? "everywhere"}|${rule.scopeName ?? "Everywhere"}|${normalizeRuleText(rule.when)}|${normalizeRuleText(rule.then)}`;

const finding = (ruleId, code, message, fix) => ({ ruleId, code, severity: "warning", message, fix });

/** Check one rule's text. Kept separate so the CLI can explain a single rule if needed. */
export function lintRule(rule, { budget = DEFAULT_BUDGET } = {}) {
  const text = String(rule.then ?? "");
  const out = [];
  if (text.length > budget.maxRuleChars) {
    out.push(finding(rule.id, "rule_too_long", `Rule ${rule.id} is ${text.length} characters (budget ${budget.maxRuleChars}).`, "Split it or move the detail into a note the agent can look up."));
  }
  if (SAFETY.some((pattern) => pattern.test(text))) {
    out.push(finding(rule.id, "ignores_safety", `Rule ${rule.id} tells an agent to ignore safety or a security boundary.`, "Remove the instruction; a standing rule must not disable safety checks."));
  }
  if (redact(text) !== text) {
    out.push(finding(rule.id, "secret_in_rule", `Rule ${rule.id} looks like it contains a secret.`, "Remove the value; keep the secret in the environment or a secret manager."));
  }
  return out;
}

/**
 * Lint a rule list and, optionally, managed-block files. `files` is an array of paths or `{path, tool}`.
 * A file without the managed-block marker is skipped; only managed blocks are compared with the store.
 */
export function lintRules({ rules = [], files = [], budget = DEFAULT_BUDGET } = {}) {
  const findings = [];
  const list = rules.filter((rule) => rule && rule.id);

  // Duplicates: one finding per group, not one per pair.
  const groups = new Map();
  for (const rule of list) {
    const key = ruleKey(rule);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    findings.push(finding(first.id, "duplicate", `Rule ${first.id} has ${rest.length} duplicate(s): ${rest.map((rule) => rule.id).join(", ")}.`, "Remove the duplicates or make one rule the only copy."));
  }

  // Direct contradictions: same scope and condition, opposite polarity, same core words.
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if ((a.scopeTier ?? "everywhere") !== (b.scopeTier ?? "everywhere")) continue;
      if ((a.scopeName ?? "Everywhere") !== (b.scopeName ?? "Everywhere")) continue;
      if (normalizeRuleText(a.when) !== normalizeRuleText(b.when)) continue;
      const na = normalizeRuleText(a.then);
      const nb = normalizeRuleText(b.then);
      const pa = polarity(na);
      const pb = polarity(nb);
      if (!pa || !pb || pa === pb) continue;
      if (core(na) && core(na) === core(nb)) {
        findings.push(finding(a.id, "contradiction", `Rule ${a.id} contradicts rule ${b.id} ("${a.then}" vs "${b.then}").`, "Keep the rule you mean and delete or rewrite the other."));
      }
    }
  }

  // Per-rule checks.
  for (const rule of list) findings.push(...lintRule(rule, { budget }));

  // Rules the caller marked stale (see rule-evidence.mjs): a flag to act on, never a block.
  for (const rule of list) {
    if (rule.enabled === false || !rule.stale) continue;
    const why = (rule.reasons ?? []).map((reason) => reason.message).join(" ");
    findings.push(finding(rule.id, "stale_rule", `Rule ${rule.id} may be out of date. ${why}`.trim(), "Confirm it with aletheia rules confirm, or retire it with aletheia rules retire."));
  }
  const total = list.filter((rule) => rule.enabled !== false).reduce((sum, rule) => sum + String(rule.then ?? "").length, 0);
  if (total > budget.maxTotalChars) {
    findings.push(finding("set", "set_too_large", `Enabled rules total ${total} characters (budget ${budget.maxTotalChars}).`, "Move project detail out of the always-on set; keep the standing rules short."));
  }

  // Drift between a managed block and the store.
  for (const entry of files) {
    const path = typeof entry === "string" ? entry : entry.path;
    const tool = typeof entry === "string" ? null : entry.tool ?? null;
    if (!path || !existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    if (!text.includes(MARK_BEGIN)) continue;
    const parsed = parseRulesFromText(text);
    const applicable = list.filter((rule) => rule.enabled !== false && (!tool || !rule.tools || !rule.tools.length || rule.tools.includes(tool)));
    const storeKeys = new Map(applicable.map((rule) => [ruleKey(rule), rule]));
    const fileKeys = new Map(parsed.map((rule) => [ruleKey(rule), rule]));
    parsed.forEach((rule, index) => {
      if (!storeKeys.has(ruleKey(rule))) {
        findings.push(finding(`file:${path}:${index + 1}`, "drift_file_only", `The managed block in ${path} has a rule the store does not: "${rule.then}".`, "Add it in the Rules view or run aletheia rules sync --write to restore the block."));
      }
    });
    for (const [key, rule] of storeKeys) {
      if (!fileKeys.has(key)) {
        findings.push(finding(rule.id, "drift_store_only", `Rule ${rule.id} is in the store but missing from the managed block in ${path}.`, "Run aletheia rules sync --write for that tool."));
      }
    }
  }

  return { findings, checked: { rules: list.length, files: files.length } };
}

export function formatFindings(findings) {
  if (!findings.length) return "No findings.";
  return findings.map((row) => `${row.ruleId}  ${row.code}  ${row.message}\n  fix: ${row.fix}`).join("\n");
}
