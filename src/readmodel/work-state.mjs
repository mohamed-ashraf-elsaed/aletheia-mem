// Work state: an append-only log of {project, list_name, fields} entries, folded into lists and tasks.
// Each entry sets fields on a list (no "task") or on one task of a list; a null value deletes the field.
import { isoFromEpoch, lower } from "../lib/util.mjs";

export const OWNER_GOALS_LIST = "owner-goals";
export const MY_RULES_LIST = "my-rules";
export const AGENT_LIFECYCLE_LIST = "agent-lifecycle";

export const isGoalsHistoryList = (name) => name === OWNER_GOALS_LIST || String(name ?? "").startsWith(`${OWNER_GOALS_LIST}/`);
export const isMyRulesList = (name) => name === MY_RULES_LIST;
export const isAgentLifecycleList = (name) => name === AGENT_LIFECYCLE_LIST;

const CLOSED = new Set(["done", "dropped"]);
const isClosed = (status) => status != null && CLOSED.has(String(status).toLowerCase());
const statusOf = (status) => (status == null || status === "" ? "unknown" : String(status).toLowerCase());
const listKey = (project, name) => JSON.stringify([lower(project), name]);
const taskKey = (listId, task) => JSON.stringify([listId, task]);

/**
 * Fold raw entries into lists, tasks, events and summary counts.
 * entries: [{id, project, list_name, fields (object|string), created_at_epoch, origin_device_id?, origin_local_id?}]
 */
export function foldWorkState(entries, { currentProject = "", currentProjectScope = [], eventLimit = Infinity, localDeviceId = "" } = {}) {
  const scope = new Set(currentProjectScope.map(lower));
  const lists = new Map();
  const events = [];
  let maxId = 0;
  const device = (row) => row.origin_device_id ?? localDeviceId;
  const ordered = [...entries].sort((a, b) => {
    const t = a.created_at_epoch - b.created_at_epoch || (device(a) < device(b) ? -1 : device(a) > device(b) ? 1 : 0);
    if (t) return t;
    const x = BigInt(a.origin_local_id ?? a.id);
    const y = BigInt(b.origin_local_id ?? b.id);
    return x < y ? -1 : x > y ? 1 : 0;
  });

  for (const row of ordered) {
    maxId = Math.max(maxId, row.id);
    const fields = typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new Error("Invalid work-state entry");
    const project = row.scope_project ?? row.project;
    const id = listKey(project, row.list_name);
    let list = lists.get(id);
    if (!list) {
      list = { id, project, name: row.list_name, fields: {}, tasksByName: new Map(), updatedAtEpoch: 0, stateUpdatedAtEpoch: null, latestEntryId: 0 };
      lists.set(id, list);
    }
    const taskName = fields.task == null || fields.task === "" ? null : String(fields.task);
    let target = list;
    if (taskName !== null) {
      target = list.tasksByName.get(taskName);
      if (!target) {
        target = { id: taskKey(id, taskName), name: taskName, fields: {}, updatedAtEpoch: 0, latestEntryId: 0 };
        list.tasksByName.set(taskName, target);
      }
    } else {
      list.stateUpdatedAtEpoch = row.created_at_epoch;
    }
    const changes = [];
    for (const [name, value] of Object.entries(fields)) {
      const had = Object.hasOwn(target.fields, name);
      const previous = target.fields[name];
      if (name !== "task" && ((value === null && had) || (value !== null && (!had || previous !== value)))) {
        changes.push({ field: name, ...(had ? { previous } : {}), value, hadPrevious: had });
      }
      if (value === null) delete target.fields[name];
      else target.fields[name] = value;
    }
    target.updatedAtEpoch = row.created_at_epoch;
    target.latestEntryId = row.id;
    list.updatedAtEpoch = row.created_at_epoch;
    list.latestEntryId = row.id;
    events.push({
      id: row.id,
      project: list.project,
      originProject: row.project,
      listName: row.list_name,
      listId: id,
      task: taskName,
      taskId: taskName === null ? null : target.id,
      type: taskName === null ? "state" : "task",
      fields,
      changes,
      status: taskName === null ? (target.fields.status == null ? "open" : String(target.fields.status).toLowerCase()) : statusOf(target.fields.status),
      at: isoFromEpoch(row.created_at_epoch),
      atEpoch: row.created_at_epoch,
      sourceOrder: [row.created_at_epoch, device(row), String(row.origin_local_id ?? row.id)],
      inCurrentScope: scope.has(lower(row.project)),
    });
  }

  const folded = [...lists.values()]
    .sort((a, b) => b.latestEntryId - a.latestEntryId)
    .map((list) => {
      const tasks = [...list.tasksByName.values()].map((task) => ({
        ...task,
        status: statusOf(task.fields.status),
        isOpen: !isClosed(task.fields.status),
        updatedAt: isoFromEpoch(task.updatedAtEpoch),
      }));
      const hasListState = Object.keys(list.fields).some((k) => k !== "task") && !isClosed(list.fields.status);
      const { tasksByName, ...rest } = list;
      return {
        ...rest,
        status: isClosed(list.fields.status) ? String(list.fields.status).toLowerCase() : "open",
        isOpen: hasListState || tasks.some((t) => t.isOpen),
        inCurrentScope: scope.has(lower(list.project)),
        updatedAt: isoFromEpoch(list.updatedAtEpoch),
        stateUpdatedAt: isoFromEpoch(list.stateUpdatedAtEpoch),
        tasks,
      };
    });

  const projects = new Map();
  for (const list of folded) {
    const key = lower(list.project);
    const p = projects.get(key) ?? { id: list.project, name: list.project, lists: 0, openLists: 0, tasks: 0, doing: 0, inCurrentScope: list.inCurrentScope, lastUpdatedAt: list.updatedAt };
    p.lists++;
    p.openLists += Number(list.isOpen);
    p.tasks += list.tasks.length;
    p.doing += list.tasks.filter((t) => t.isOpen && t.status === "doing").length;
    projects.set(key, p);
  }
  const tasks = folded.flatMap((l) => l.tasks);
  const count = (status) => tasks.filter((t) => t.status === status).length;
  return {
    schemaVersion: 1,
    revision: maxId,
    entryCount: entries.length,
    currentProject,
    currentProjectScope,
    summary: {
      projects: projects.size,
      lists: folded.length,
      openLists: folded.filter((l) => l.isOpen).length,
      tasks: tasks.length,
      openTasks: tasks.filter((t) => t.isOpen).length,
      todo: count("todo"), doing: count("doing"), done: count("done"), dropped: count("dropped"), unknown: count("unknown"),
    },
    projects: [...projects.values()],
    lists: folded,
    events: events.slice(-eventLimit).reverse(),
    lastUpdatedAt: events.length ? events.at(-1).at : null,
  };
}
