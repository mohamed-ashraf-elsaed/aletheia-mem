// "Checked" marks on request cards. A check is bound to the card's content fingerprint, so any change to
// the request's source work un-checks it.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sha256, sortKeysDeep } from "../lib/util.mjs";

const FINGERPRINT_FIELDS = [
  "id", "original", "explicitRequestText", "scopeUpdates", "title", "projects", "agentIds", "items",
  "lifecycle", "afterShip", "shipEstimate", "stageSourceText", "sourceContentHashes",
];

/** sha256 over the request fields a reviewer would have read. 64 hex chars. */
export function contentFingerprint(request) {
  return sha256(JSON.stringify(sortKeysDeep(Object.fromEntries(FINGERPRINT_FIELDS.map((f) => [f, request[f]])))));
}

export class ReviewStore {
  constructor(path) {
    this.db = null;
    try {
      if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
      this.db = new Database(path, { create: true });
      this.db.exec("PRAGMA busy_timeout = 1500");
      this.db.exec(`CREATE TABLE IF NOT EXISTS work_view_reviews (
        request_id TEXT PRIMARY KEY,
        content_fingerprint TEXT NOT NULL,
        checked_at_epoch INTEGER NOT NULL,
        actor TEXT NOT NULL CHECK (actor = 'local-user')
      )`);
    } catch {
      try { this.db?.close(); } catch {}
      this.db = null;
    }
  }

  read(requestId, fingerprint) {
    try {
      if (!this.db) throw new Error("Review storage unavailable");
      const row = this.db.prepare("SELECT checked_at_epoch FROM work_view_reviews WHERE request_id = ? AND content_fingerprint = ?").get(requestId, fingerprint);
      return row
        ? { checked: true, checkedAtEpoch: row.checked_at_epoch, actor: "local-user", available: true }
        : { checked: false, checkedAtEpoch: null, actor: null, available: true };
    } catch {
      return { checked: false, checkedAtEpoch: null, actor: null, available: false };
    }
  }

  set(requestId, fingerprint, checked) {
    if (!this.db) throw new Error("Local review storage is unavailable. Your source work is unchanged.");
    if (checked) {
      this.db
        .prepare(`INSERT INTO work_view_reviews (request_id, content_fingerprint, checked_at_epoch, actor) VALUES (?, ?, ?, 'local-user')
                  ON CONFLICT(request_id) DO UPDATE SET content_fingerprint = excluded.content_fingerprint, checked_at_epoch = excluded.checked_at_epoch, actor = excluded.actor`)
        .run(requestId, fingerprint, Date.now());
    } else {
      this.db.prepare("DELETE FROM work_view_reviews WHERE request_id = ? AND content_fingerprint = ?").run(requestId, fingerprint);
    }
  }

  close() {
    this.db?.close();
  }
}
