// The claude-mem importer must fail loudly when the upstream schema is not what it expects, instead of importing
// zero rows and reporting success.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REQUIRED_SCHEMA, importClaudeMem, probeClaudeMemSchema } from "../src/hub/importers.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { makeFixture } from "./fixture.mjs";
import { removeDir } from "./temp-dirs.mjs";

const dirs = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "aletheia-importer-"));
  dirs.push(dir);
  return dir;
};

function stripped({ omitTable = null, omitColumn = null } = {}) {
  const path = join(tmp(), "claude-mem.db");
  const db = new Database(path, { create: true });
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    if (table === omitTable) continue;
    const kept = columns.filter((column) => !(omitColumn?.table === table && omitColumn.column === column));
    const types = kept.map((column) => (column.endsWith("_epoch") || column === "id" || column === "session_db_id" ? "INTEGER" : "TEXT"));
    db.exec(`CREATE TABLE ${table} (${kept.map((column, i) => `${column} ${types[i]}`).join(", ")})`);
  }
  db.close();
  return path;
}

afterAll(() => {
  for (const dir of dirs) {
    try {
      removeDir(dir, { recursive: true, force: true });
    } catch {
      // the OS cleans tmp on its own schedule
    }
  }
});

describe("claude-mem schema probe", () => {
  test("a database without observations names the missing table", () => {
    const path = stripped({ omitTable: "observations" });
    const db = new Database(path, { readonly: true });
    try {
      expect(() => probeClaudeMemSchema(db, path)).toThrow(/observations/);
      expect(() => probeClaudeMemSchema(db, path)).toThrow(path);
    } finally {
      db.close();
    }
  });

  test("a database with a missing column names the column", () => {
    const path = stripped({ omitColumn: { table: "observations", column: "title" } });
    const db = new Database(path, { readonly: true });
    try {
      expect(() => probeClaudeMemSchema(db, path)).toThrow(/observations\.title/);
    } finally {
      db.close();
    }
  });

  test("the importer refuses a stripped database instead of importing zero rows", () => {
    const path = stripped({ omitTable: "observations" });
    const store = new HubStore(join(tmp(), "hub.db"));
    try {
      expect(() => importClaudeMem(store, path)).toThrow(/observations/);
    } finally {
      store.close();
    }
  });

  test("a valid fixture still imports", () => {
    const fx = makeFixture();
    dirs.push(fx.dir);
    const store = new HubStore(join(tmp(), "hub.db"));
    try {
      const counts = importClaudeMem(store, fx.dbPath);
      expect(counts.observations.added).toBeGreaterThan(0);
      expect(counts.summaries.added).toBeGreaterThan(0);
      expect(counts.prompts.added).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });
});
