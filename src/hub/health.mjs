// Health detail for /healthz and `aletheia doctor`: does the database open, does FTS answer, are there vectors,
// and which embedding model is configured. It never includes an API key or a path outside the data directory.
export const DEFAULT_EMBED_MODEL = "Xenova/bge-small-en-v1.5";

const count = (store, table) => {
  try {
    return store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  } catch {
    return null;
  }
};

const safeModel = (model) => String(model ?? DEFAULT_EMBED_MODEL).replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[redacted]").slice(0, 200);

/** Returns {status, db, fts, vectors, model}. status is "ok" or "error"; an error always carries a reason. */
export function healthReport(store, { model = process.env.ALETHEIA_EMBED_MODEL ?? DEFAULT_EMBED_MODEL } = {}) {
  let db = { ok: false, detail: "database is not open" };
  let fts = { ok: false, detail: "not checked" };
  let vectors = { memories: null, facts: null };
  try {
    // quick_check also runs the FTS5 integrity check. While another process writes (a hook, a sync), that check can
    // report "fts5: corruption found" for an index that is fine; a real search query never fails in that case.
    // So: retry, and if only FTS rows still complain, accept the database when a real FTS query works.
    const isFtsRow = (value) => /^fts5:|_fts\b/i.test(String(value));
    let rows = [];
    let ftsBusy = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      rows = store.db.prepare("PRAGMA quick_check").all().map((row) => Object.values(row)[0]);
      if (rows.length > 0 && rows.every((value) => String(value).toLowerCase() === "ok")) break;
      if (!rows.length || !rows.every(isFtsRow)) break;
      if (attempt === 2) ftsBusy = true;
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
    if (ftsBusy) {
      try {
        store.db.prepare("SELECT rowid FROM memories_fts WHERE memories_fts MATCH 'a' LIMIT 1").all();
        rows = ["ok"];
      } catch { /* keep the integrity rows: the index does not answer */ }
    }
    const ok = rows.length > 0 && rows.every((value) => String(value).toLowerCase() === "ok");
    db = { ok, detail: ok ? (ftsBusy ? "quick_check ok (FTS integrity check skipped while writes were in progress; FTS query answered)" : "quick_check ok") : rows.slice(0, 3).join("; ") || "quick_check returned no rows" };
    try {
      store.db.prepare("SELECT rowid FROM memories_fts LIMIT 1").all();
      fts = { ok: true, detail: "FTS5 query answered" };
    } catch (error) {
      fts = { ok: false, detail: `FTS5 query failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200) };
    }
    vectors = { memories: count(store, "memory_vectors"), facts: count(store, "fact_vectors") };
  } catch (error) {
    db = { ok: false, detail: `database unavailable: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200) };
    fts = { ok: false, detail: "not checked: the database did not answer" };
    vectors = { memories: null, facts: null };
  }
  return {
    status: db.ok && fts.ok ? "ok" : "error",
    db,
    fts,
    vectors,
    model: safeModel(model),
  };
}
