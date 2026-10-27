// Where the tools disagree: for each tool's rules file, which store rules are missing from the file's managed block,
// which rules sit in the block but not in the store, and which rules say something different in the two places, each
// with file and line. Read-only: nothing here writes a file or a row. A file without the managed markers is not ours
// and is reported as unmanaged, not as a difference.
import { existsSync, readFileSync } from "node:fs";
import { normalizeRuleText, ruleKey } from "./rule-lint.mjs";
import { parseManagedRulesWithLines, targetPath } from "./rules-sync.mjs";
import { toolById, TOOLS } from "./tools.mjs";

const tokens = (rule) => new Set(normalizeRuleText(`${rule.when ?? ""} ${rule.then ?? ""}`).split(" ").filter((word) => word.length > 1));
function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}
const sameScope = (a, b) => (a.scopeTier ?? "everywhere") === (b.scopeTier ?? "everywhere") && (a.scopeName ?? "Everywhere") === (b.scopeName ?? "Everywhere");
const show = (rule) => (rule.when ? `When ${rule.when}: ${rule.then}` : rule.then);

/** Compare one file's managed block with the store rules that apply to its tool. */
export function diffFile(rules, { path, tool = null, scope = null }) {
  const base = { tool, scope, path, exists: existsSync(path), managed: false, inSync: true, onlyInStore: [], onlyInFile: [], differs: [] };
  if (!base.exists) return base;
  const parsed = parseManagedRulesWithLines(readFileSync(path, "utf8"));
  if (!parsed) return base;
  const applicable = rules.filter((rule) => rule.enabled !== false && (!tool || !rule.tools || !rule.tools.length || rule.tools.includes(tool)));
  const fileKeys = new Set(parsed.map(ruleKey));
  const storeKeys = new Set(applicable.map(ruleKey));
  const missing = applicable.filter((rule) => !fileKeys.has(ruleKey(rule)));
  const extra = parsed.filter((rule) => !storeKeys.has(ruleKey(rule)));
  const differs = [];
  const pairedExtra = new Set();
  const stillMissing = [];
  for (const rule of missing) {
    let best = null;
    for (const candidate of extra) {
      if (pairedExtra.has(candidate) || !sameScope(rule, candidate)) continue;
      const score = similarity(rule, candidate);
      if (score >= 0.5 && (!best || score > best.score)) best = { candidate, score };
    }
    if (best) {
      pairedExtra.add(best.candidate);
      differs.push({ id: rule.id, line: best.candidate.line, store: show(rule), file: show(best.candidate) });
    } else {
      stillMissing.push(rule);
    }
  }
  base.managed = true;
  base.onlyInStore = stillMissing.map((rule) => ({ id: rule.id, text: show(rule) }));
  base.onlyInFile = extra.filter((rule) => !pairedExtra.has(rule)).map((rule) => ({ line: rule.line, text: show(rule) }));
  base.differs = differs;
  base.inSync = !base.onlyInStore.length && !base.onlyInFile.length && !differs.length;
  return base;
}

/** Diff every given file. `outOfSync` counts the distinct tools with at least one managed file that differs. */
export function diffRules({ rules = [], files = [] } = {}) {
  const results = files.map((file) => diffFile(rules, file));
  const outOfSync = new Set(results.filter((result) => result.managed && !result.inSync).map((result) => result.tool ?? result.path));
  return { files: results, outOfSync: outOfSync.size, checked: { rules: rules.length, files: files.length } };
}

/** The rules files that exist for `toolIds` (default every tool): the project file under `dir` and the global file under `home`. */
export function diffTargets({ toolIds = null, dir = null, home, scopes = ["project", "global"] } = {}) {
  const ids = toolIds ?? TOOLS.map((tool) => tool.id);
  const files = [];
  for (const id of ids) {
    if (!toolById(id)) throw new RangeError(`Unknown tool: ${id}`);
    for (const scope of scopes) {
      if (scope === "project" && !dir) continue;
      let path = null;
      try {
        path = targetPath(id, { scope, projectDir: scope === "project" ? dir : undefined, home });
      } catch {
        path = null;
      }
      if (path && existsSync(path)) files.push({ path, tool: id, scope });
    }
  }
  return files;
}

export function formatDiff(report) {
  const lines = [];
  for (const file of report.files) {
    if (!file.managed) {
      lines.push(`${file.tool ?? "file"}  ${file.path}  no managed block (not compared)`);
      continue;
    }
    lines.push(`${file.tool ?? "file"}  ${file.path}  ${file.inSync ? "in sync" : "differs"}`);
    for (const row of file.onlyInStore) lines.push(`  only in store  ${row.id}  ${row.text}`);
    for (const row of file.onlyInFile) lines.push(`  only in file   ${file.path}:${row.line}  ${row.text}`);
    for (const row of file.differs) lines.push(`  text differs   ${row.id} vs ${file.path}:${row.line}\n    store: ${row.store}\n    file:  ${row.file}`);
  }
  lines.push(report.outOfSync ? `${report.outOfSync} tool${report.outOfSync === 1 ? "" : "s"} out of sync.` : "All compared tools are in sync.");
  return lines.join("\n");
}
