// Rules sync: one list of rules, written into every tool's own instruction file.
//   - "block" files (CLAUDE.md, AGENTS.md, GEMINI.md, .windsurfrules, copilot-instructions.md, CONVENTIONS.md)
//     get a managed block between markers. Everything outside the markers is left alone.
//   - "owned" files (Cursor .mdc) are written whole, with the frontmatter Cursor needs.
// Every operation can be previewed (dry run returns before/after) and the first write keeps a backup.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { MARK_BEGIN, MARK_END, toolById } from "./tools.mjs";

const TIER_ORDER = ["everywhere", "project", "situation"];

/** Rules that apply to `tool`, grouped like MY-RULES.md. Only enabled rules. */
export function renderRules(rules, toolId) {
  const active = rules.filter((r) => r.enabled && (!r.tools || r.tools.length === 0 || r.tools.includes(toolId)));
  const groups = new Map();
  for (const r of active) {
    const key = `${r.scopeTier}:${r.scopeName}`;
    if (!groups.has(key)) groups.set(key, { tier: r.scopeTier, name: r.scopeName, rules: [] });
    groups.get(key).rules.push(r);
  }
  const ordered = [...groups.values()].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name));
  const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const lines = ["# Rules", "", "Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync."];
  for (const g of ordered) {
    lines.push("", `## ${g.tier === "project" ? `In ${g.name}` : g.tier === "situation" ? g.name : "Everywhere"}`, "");
    for (const r of g.rules) lines.push(r.when ? `- When ${r.when}: ${lowerFirst(r.then)}` : `- ${r.then}`);
  }
  return { markdown: `${lines.join("\n")}\n`, count: active.length };
}

/** Replace the managed block in `text` (or append one). Content outside the markers is untouched. */
export function applyBlock(text, markdown) {
  const block = `${MARK_BEGIN}\n${markdown.trimEnd()}\n${MARK_END}`;
  const start = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END);
  if (start !== -1 && end > start) return `${text.slice(0, start)}${block}${text.slice(end + MARK_END.length)}`;
  const lead = text === "" ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${lead}${block}\n`;
}

/** Remove the managed block (and nothing else). */
export function removeBlock(text) {
  const start = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END);
  if (start === -1 || end < start) return text;
  return `${text.slice(0, start).replace(/\n+$/, "\n")}${text.slice(end + MARK_END.length).replace(/^\n+/, "")}`.replace(/^\n+$/, "");
}

const owned = (frontmatter, markdown) => `${frontmatter}\n\n${applyBlock("", markdown)}`;
const cursorMdc = (markdown) => owned("---\ndescription: Standing rules managed by aletheia-mem\nalwaysApply: true\n---", markdown);
const windsurfRule = (markdown) => owned("---\ntrigger: always_on\n---", markdown);

/**
 * The exact text a tool's rules file should hold. `owned` files are written whole with the frontmatter the
 * tool documents; every other file gets the managed block, so user text outside the markers is untouched.
 * Global scope always uses the block form: global files do not take workspace-rule frontmatter.
 */
export function renderTarget(toolId, before, markdown, { scope = "project" } = {}) {
  const style = toolById(toolId).rules.style;
  if (scope === "project" && style === "owned") return cursorMdc(markdown);
  if (scope === "project" && style === "owned-windsurf") return windsurfRule(markdown);
  return applyBlock(before, markdown);
}

/** Where this tool's rules file lives for `scope` ("project" with a directory, or "global"). null when the tool has none. */
export function targetPath(toolId, { scope, projectDir, home }) {
  const tool = toolById(toolId);
  if (!tool) throw new RangeError(`Unknown tool: ${toolId}`);
  if (scope === "global") return tool.rules.global ? join(home, tool.rules.global) : null;
  if (!projectDir) throw new RangeError("A project folder is needed for project scope.");
  return join(resolve(projectDir), tool.rules.project);
}

/** Compute (and optionally write) the new content of one tool's rules file. */
export function syncTool(rules, toolId, { scope = "project", projectDir, home, dryRun = true }) {
  const tool = toolById(toolId);
  const path = targetPath(toolId, { scope, projectDir, home });
  if (!path) return { tool: toolId, path: null, skipped: `${tool.name} has no ${scope} rules file.` };
  const { markdown, count } = renderRules(rules, toolId);
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const after = renderTarget(toolId, before, markdown, { scope });
  const result = { tool: toolId, path, scope, rules: count, changed: before !== after, before, after, backup: null, written: false };
  if (dryRun || !result.changed) return result;
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    result.backup = `${path}.aletheia-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    copyFileSync(path, result.backup);
  }
  writeFileSync(path, after);
  result.written = true;
  return result;
}

/** Pull rules out of an existing file: bullet lines (`- ...` or `* ...`) inside the managed block, else the whole file. */
export function parseRulesFromText(text) {
  const start = text.indexOf(MARK_BEGIN);
  const end = text.indexOf(MARK_END);
  const body = start !== -1 && end > start ? text.slice(start + MARK_BEGIN.length, end) : text.replace(/^---[\s\S]*?---\n/, "");
  const found = [];
  let scope = { tier: "everywhere", name: "Everywhere" };
  for (const raw of body.split("\n")) {
    const heading = /^##\s+(.+)$/.exec(raw);
    if (heading) {
      const h = heading[1].trim();
      const proj = /^In\s+(.+)$/.exec(h);
      scope = h === "Everywhere" ? { tier: "everywhere", name: "Everywhere" } : proj ? { tier: "project", name: proj[1] } : { tier: "situation", name: h };
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+?)\s*$/.exec(raw);
    if (!bullet) continue;
    const text1 = bullet[1];
    if (text1.length < 4 || text1.length > 800 || /^\[.\]\s*$/.test(text1)) continue;
    const when = /^When\s+(.+?):\s+(.+)$/.exec(text1);
    found.push(when ? { when: when[1], then: when[2], scopeTier: scope.tier, scopeName: scope.name } : { when: "", then: text1, scopeTier: scope.tier, scopeName: scope.name });
  }
  return found;
}
