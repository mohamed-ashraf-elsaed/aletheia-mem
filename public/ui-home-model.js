// DOM-free helpers for the Home page: plain titles, which projects to show, plain words for memory types and the
// state of each tool. Nothing here touches the document, so a test can import it directly.
import { t } from "./ui-i18n.js";

const WORDS = /[\p{L}]/gu;

/**
 * A short, readable title from raw text. Raw text is often pasted content, a JSON tool input or a pile of numbers; this
 * returns the first real sentence, or null when there is nothing a person could read.
 */
export function plainTitle(text, { max = 90 } = {}) {
  let s = String(text ?? "");
  if (!s.trim()) return null;
  s = s.replace(/^\s*input:\s*/i, "");
  // A JSON tool input: use the first human field instead of the braces.
  if (/^\s*[{[]/.test(s)) {
    const field = /"(?:question|prompt|title|text|description|message|summary)"\s*:\s*"((?:[^"\\]|\\.)+)"/i.exec(s);
    s = field ? field[1].replace(/\\n/g, " ").replace(/\\"/g, '"') : "";
  }
  s = s.replace(/<\/?[a-z_][^>]*>/gi, " ").replace(/\\"/g, '"').replace(/\*\*/g, "");
  s = s.replace(/^\s*[-*•]\s+/, "").replace(/^\s*(session summary|summary)(\s+for\s+\S+(\s*\(\d+ fact\(s\)\))?)?\s*[:\-–]\s*/i, "");
  // Section labels such as "Request." or "Investigated." that summaries start with.
  s = s.replace(/^\s*(request|investigated|learned|completed|next steps?)\.\s+/i, "").replace(/^\s*[-*•]\s+/, "");
  s = s.replace(/https?:\/\/\S+/g, t("home.aLink")).replace(/\s+/g, " ").trim();
  if (s.length < 3) return null;
  const letters = (s.match(WORDS) ?? []).length;
  if (letters / s.length < 0.5) return null;
  const sentence = /^(.{12,}?[.?!])(\s|$)/.exec(s);
  let out = sentence ? sentence[1] : s;
  if (out.length > max) out = `${out.slice(0, max - 1).trimEnd()}…`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const SMALL = 3;
const TEMP = /^(tmp([.-]|$)|agent-|hookprobe$|unknown-project$|.$)/;

/**
 * Split the project list into the ones a person works in and the rest (worktree folders, temp folders, folders with almost
 * nothing in them). `selected` always stays in the main list.
 */
export function realProjects(projects, { selected = "" } = {}) {
  const list = Array.isArray(projects) ? projects : [];
  const names = new Set(list.map((project) => project.name));
  const main = [];
  const other = [];
  for (const project of list) {
    const name = String(project.name ?? "");
    const parent = name.includes("/") ? name.split("/")[0] : null;
    const leaf = parent ? name.slice(parent.length + 1) : name;
    const hidden = TEMP.test(name) || TEMP.test(leaf) || (parent && names.has(parent)) || Number(project.memories ?? 0) < SMALL;
    (hidden && name !== selected ? other : main).push(project);
  }
  const newest = (a, b) => Number(b.lastAtEpoch ?? 0) - Number(a.lastAtEpoch ?? 0);
  return { main: main.sort(newest), other: other.sort(newest) };
}

const TYPE_KEYS = {
  decision: "home.typeDecision", gotcha: "home.typeGotcha", bugfix: "home.typeBugfix", feature: "home.typeFeature", refactor: "home.typeRefactor", change: "home.typeChange",
  discovery: "home.typeDiscovery", note: "home.typeNote", summary: "home.typeSummary", security_alert: "home.typeSecurity", security_note: "home.typeSecurity",
};
export const typeWord = (type, kind) => t(TYPE_KEYS[type] ?? (kind === "summary" ? TYPE_KEYS.summary : TYPE_KEYS.note));

/** "today 17:20", "yesterday", "3 days ago", or a date. */
export function whenText(epoch, now = Date.now()) {
  const ms = Number(epoch);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const diff = now - ms;
  const time = new Date(ms).toTimeString().slice(0, 5);
  const day = (value) => new Date(value).toDateString();
  if (day(ms) === day(now)) return diff < 60_000 ? t("home.justNow") : t("home.todayAt", { time });
  if (day(ms) === day(now - 86_400_000)) return t("home.yesterdayAt", { time });
  const days = Math.floor(diff / 86_400_000);
  if (days < 14) return t("home.daysAgo", { count: days });
  return new Date(ms).toISOString().slice(0, 10);
}

/** What a person should read about one tool, from the doctor's report. */
export function toolState(tool) {
  const expected = Number(tool?.hooks?.expected ?? 0);
  const present = Number(tool?.hooks?.present ?? 0);
  if (!tool?.installed) return { state: "missing", label: t("home.toolNotInstalled"), tone: "muted", ready: false };
  if (expected === 0) return { state: "info", label: t("home.toolInfoOnly"), tone: "info", ready: true };
  if (present >= expected) return { state: "on", label: t("home.toolOn"), tone: "success", ready: true };
  if (present > 0) return { state: "partial", label: t("home.toolPartial", { present, expected }), tone: "warning", ready: false };
  return { state: "off", label: t("home.toolOff"), tone: "warning", ready: false };
}

/** Rules that apply to a project: the ones for everywhere and the ones named for it. */
export const rulesFor = (rules, project) => (Array.isArray(rules) ? rules : []).filter((rule) => rule.scopeTier === "everywhere" || (project && rule.scopeName === project));

/** The sentence under a rule: when it applies. */
export const ruleScopeText = (rule) => (rule.scopeTier === "everywhere" ? t("home.ruleScopeEverywhere") : t("home.ruleScopeProject", { name: rule.scopeName }));

// An array whose items are read at access time, so the language is the current one.
export const EXAMPLE_RULES = ["home.exampleRule1", "home.exampleRule2", "home.exampleRule3", "home.exampleRule4"].reduce((list, key, index) => {
  Object.defineProperty(list, index, { get: () => t(key), enumerable: true });
  return list;
}, new Array(4));
