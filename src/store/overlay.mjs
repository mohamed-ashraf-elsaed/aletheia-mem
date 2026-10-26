// The clone's own writable work-state log. The claude-mem database is opened read-only, so entries the clone
// writes (rules, "agent finished", goals saved by the refresh) go here. They fold together with the source
// entries. Ids are offset so they never collide with source ids.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const OVERLAY_ID_BASE = 2 ** 40;

export class OverlayStore {
  constructor(path) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA busy_timeout = 1500");
    this.db.exec(`CREATE TABLE IF NOT EXISTS work_state_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      list_name TEXT NOT NULL,
      fields TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_at_epoch INTEGER NOT NULL
    )`);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_overlay_project ON work_state_entries(project COLLATE NOCASE, list_name, id)");
  }

  /** Append one entry; returns its (offset) id. */
  append({ project, listName, fields, createdAtEpoch = Date.now() }) {
    const info = this.db
      .prepare("INSERT INTO work_state_entries (project, list_name, fields, created_at, created_at_epoch) VALUES (?, ?, ?, ?, ?)")
      .run(project, listName, JSON.stringify(fields), new Date(createdAtEpoch).toISOString(), createdAtEpoch);
    return OVERLAY_ID_BASE + Number(info.lastInsertRowid);
  }

  /** Every entry, ids offset. */
  entries() {
    return this.db
      .prepare("SELECT id, project, list_name, fields, created_at_epoch FROM work_state_entries")
      .all()
      .map((row) => ({ ...row, id: OVERLAY_ID_BASE + row.id }));
  }

  /** change detector: "count:maxId" */
  signature() {
    const row = this.db.prepare("SELECT COUNT(*) AS count, MAX(id) AS id FROM work_state_entries").get();
    return `${row.count}:${row.id ?? 0}`;
  }

  get(id) {
    if (id < OVERLAY_ID_BASE) return null;
    return this.db.prepare("SELECT id, project, list_name, fields, created_at_epoch FROM work_state_entries WHERE id = ?").get(id - OVERLAY_ID_BASE) ?? null;
  }

  close() {
    this.db.close();
  }
}
