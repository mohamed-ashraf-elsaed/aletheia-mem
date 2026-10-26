// Goals: the owner's top priorities and open asks, saved as the "owner-goals" work-state list
// (and "owner-goals/<YYYY-MM-DD>" lists for past months).
import { clip } from "../lib/util.mjs";
import { OWNER_GOALS_LIST, isGoalsHistoryList } from "./work-state.mjs";

/** Evidence quotes from hosted JSON, or from "YYYY-MM-DD HH:MM | quote" lines. */
function parseEvidence(text, hostedJson = null) {
  if (hostedJson !== null) {
    const parsed = JSON.parse(hostedJson);
    if (!Array.isArray(parsed) || !parsed.every((q) => q && typeof q.at === "string" && typeof q.quote === "string")) {
      throw new TypeError("Hosted goal evidence must contain dated quote objects.");
    }
    return parsed;
  }
  if (typeof text !== "string") return [];
  return text.split("\n").flatMap((line) => {
    const m = /^(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)\s*\|\s*(.+)$/.exec(line.trim());
    if (m) return [{ at: m[1], quote: clip(m[2], 400) }];
    return clip(line, 400) ? [{ at: null, quote: clip(line, 400) }] : [];
  });
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

function goalsFromList(list, history) {
  const f = list.fields;
  const hostedList = f.source === "hosted-intent" && f.hosted_generated_at === f.generated_at;
  const textOf = (v, max) => (hostedList ? (typeof v === "string" ? v : null) : clip(v, max));
  const items = list.tasks
    .filter((t) => (history ? t.status !== "dropped" : t.isOpen))
    .map((t) => {
      const hosted = t.fields.source === "hosted-intent" && t.fields.hosted_snapshot === t.fields.snapshot;
      const text = (v, max) => (hosted ? (typeof v === "string" ? v : null) : clip(v, max));
      return {
        id: t.id,
        task: t.name,
        kind: t.fields.goal_kind === "open-ask" ? "open-ask" : "priority",
        rank: num(t.fields.rank),
        title: text(t.fields.title ?? t.name, 240),
        product: text(t.fields.product, 60),
        latestAt: text(t.fields.latest_at, 20),
        timesAsked: num(t.fields.times_asked),
        status: t.status,
        evidence: parseEvidence(t.fields.evidence, hosted ? (t.fields.evidence_json ?? null) : null),
      };
    })
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.title.localeCompare(b.title));
  return {
    listId: list.id,
    listName: list.name,
    history,
    project: list.project,
    updatedAt: list.updatedAt,
    periodStart: day(f.period_start) ?? (history ? day(list.name.slice(OWNER_GOALS_LIST.length + 1)) : null),
    periodEnd: day(f.period_end),
    summary: textOf(f.human_summary, 1600),
    generatedAt: textOf(f.generated_at, 40),
    windowDays: num(f.window_days),
    sourcePromptCount: num(f.source_prompt_count),
    mapPath: textOf(f.map_path, 400),
    priorities: items.filter((i) => i.kind === "priority"),
    openAsks: items.filter((i) => i.kind === "open-ask"),
  };
}

export function currentGoals(workState) {
  const list = workState.lists.find((l) => l.name === OWNER_GOALS_LIST);
  return list && list.isOpen ? goalsFromList(list, false) : null;
}

export function goalHistory(workState) {
  return workState.lists
    .filter((l) => l.name !== OWNER_GOALS_LIST && isGoalsHistoryList(l.name) && l.status !== "dropped")
    .map((l) => goalsFromList(l, true))
    .filter((g) => g.priorities.length || g.openAsks.length)
    .sort((a, b) => String(b.periodStart ?? b.listName).localeCompare(String(a.periodStart ?? a.listName)));
}
