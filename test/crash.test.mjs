// a SIGKILL during a write leaves a recoverable SQLite database. Each run spawns a child that commits
// batches of 50 rows inside transactions; the parent kills it mid-write, reopens, and asserts integrity plus the
// absence of any half-committed batch. RED-TEAM NOTE: SIGKILL is used on purpose; the child never exits cleanly.
import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { tempDir } from "./temp-dirs.mjs";

const BATCH = 50;
const RUNS = 20;

const WRITER = `
import { Database } from "bun:sqlite";
const path = process.argv[2];
const db = new Database(path, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("CREATE TABLE IF NOT EXISTS crash_rows (batch INTEGER NOT NULL, n INTEGER NOT NULL)");
const insert = db.prepare("INSERT INTO crash_rows (batch, n) VALUES (?, ?)");
let batch = 0;
while (true) {
  batch += 1;
  db.exec("BEGIN");
  for (let i = 0; i < ${BATCH}; i += 1) insert.run(batch, i);
  db.exec("COMMIT");
}
`;

// On a busy machine the child can take a while to start. Kill it only after its first batch is committed, so the
// test never kills a process that has not created the database yet.
// Returns false when the writer died before committing anything (a failed start, not a crash under test).
async function waitForFirstBatch(dbPath, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const db = new Database(dbPath, { readonly: true });
      try {
        if (db.prepare("SELECT COUNT(*) AS n FROM crash_rows").get().n > 0) return true;
      } finally {
        db.close();
      }
    } catch {
      // The file or the table does not exist yet.
    }
    if (child.exitCode !== null) return false;
    await Bun.sleep(20);
  }
  throw new Error("the writer did not commit a batch within 30 seconds");
}

describe("kill -9 during writes leaves a recoverable database", () => {
  test(`${RUNS} SIGKILL runs reopen with integrity_check ok and no half batch`, async () => {
    const dir = tempDir("crash-");
    const writer = join(dir, "writer.mjs");
    writeFileSync(writer, WRITER);

    for (let run = 0; run < RUNS; run += 1) {
      let dbPath = join(dir, `crash-${run}.db`);
      // A writer can fail to start on a loaded machine (seen once on a Windows runner); retry the start up to 3 times and
      // show its error if it never works.
      let child;
      let started = false;
      let lastError = "";
      for (let attempt = 0; attempt < 3 && !started; attempt += 1) {
        child = Bun.spawn([process.execPath, writer, join(dir, `crash-${run}-${attempt}.db`)], { stdout: "ignore", stderr: "pipe" });
        started = await waitForFirstBatch(join(dir, `crash-${run}-${attempt}.db`), child);
        if (!started) lastError = `exit code ${child.exitCode}: ${(await new Response(child.stderr).text()).trim().slice(0, 300)}`;
        else dbPath = join(dir, `crash-${run}-${attempt}.db`);
      }
      if (!started) throw new Error(`the writer did not start after 3 tries (${lastError})`);
      await Bun.sleep(Math.floor(Math.random() * 180));
      child.kill("SIGKILL");
      await child.exited;

      const db = new Database(dbPath, { readonly: true });
      try {
        expect(db.prepare("PRAGMA integrity_check").get().integrity_check).toBe("ok");
        const batches = db.prepare("SELECT batch, COUNT(*) AS n FROM crash_rows GROUP BY batch ORDER BY batch").all();
        for (const row of batches) expect(row.n).toBe(BATCH);
        // Committed batches are contiguous from 1: a rollback may drop the tail, never a gap in the middle.
        for (let index = 0; index < batches.length; index += 1) expect(batches[index].batch).toBe(index + 1);
      } finally {
        db.close();
      }
    }
  }, 120_000);
});
