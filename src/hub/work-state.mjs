// Work-state lists: a named list the agent keeps in memory (a to-do or scratch list). One list is stored as a single
// observation with a reserved type, so it appears in the cheap search index while the full items stay one row.

export const WORK_STATE_TYPE = "work-state";

const isJsonSafe = (value) =>
  value === null || ["string", "number", "boolean"].includes(typeof value) ||
  (typeof value === "object" && !Array.isArray(value));

export function validateWorkState({ list, items }) {
  const name = String(list ?? "").trim();
  if (!name) throw new RangeError("A list name is required.");
  if (!Array.isArray(items)) throw new RangeError("items must be an array.");
  const clean = items.map((item, index) => {
    if (!isJsonSafe(item)) throw new RangeError(`items[${index}] must be a string, number, boolean or object.`);
    return item;
  });
  return { list: name, items: clean };
}

const findRow = (store, project, name) =>
  store.db.prepare("SELECT id FROM memories WHERE project = ? AND kind = 'observation' AND type = ? AND title = ? ORDER BY id DESC LIMIT 1")
    .get(project ?? "default", WORK_STATE_TYPE, name);

export function writeWorkStateList(store, { project, list, items, tool = "mcp" }) {
  const { list: name, items: clean } = validateWorkState({ list, items });
  const narrative = JSON.stringify(clean);
  const existing = findRow(store, project, name);
  if (existing) {
    store.update(existing.id, { narrative }, { actor: tool });
    return { id: existing.id, created: false, list: name, items: clean };
  }
  const row = store.add({ project, kind: "observation", type: WORK_STATE_TYPE, title: name, narrative, tool }, { actor: tool });
  return { id: row.id, created: row.created, list: name, items: clean };
}

export function readWorkStateList(store, { project, list }) {
  const name = String(list ?? "").trim();
  if (!name) throw new RangeError("A list name is required.");
  const row = findRow(store, project, name);
  if (!row) return null;
  const memory = store.get(row.id);
  let items;
  try {
    items = JSON.parse(memory.narrative ?? "[]");
  } catch {
    items = [];
  }
  return { id: row.id, list: memory.title, items, project: memory.project };
}
