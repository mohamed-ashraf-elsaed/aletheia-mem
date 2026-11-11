// Scheduled local backups: VACUUM INTO snapshots in <dataDir>/backups, retention, a safe restore, and the CLI.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { backupDir, backupStatus, backupTick, listBackups, pruneBackups, restoreBackup, runBackup } from "../src/hub/backup.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { readSettings, validateSetting, writeSettings } from "../src/hub/settings.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const posix = process.platform !== "win32";
const mode = (path) => statSync(path).mode & 0o777;
const root = join(import.meta.dir, "..");

function makeHub(rows = 3) {
  const dataDir = tempDir("aletheia-backup-");
  const dbPath = join(dataDir, "hub.db");
  const store = new HubStore(dbPath);
  for (let i = 0; i < rows; i += 1) store.add({ project: "shop", kind: "note", type: "note", title: `Row ${i}`, narrative: `Row number ${i}.` });
  return { dataDir, dbPath, store };
}
const count = (path) => {
  const db = new Database(path, { readonly: true });
  try { return db.prepare("SELECT COUNT(*) AS n FROM memories").get().n; } finally { db.close(); }
};

describe("runBackup", () => {
  test("writes a snapshot that opens, passes integrity_check and holds the rows", () => {
    const { dataDir, store } = makeHub(4);
    const result = runBackup(store, { dataDir });
    expect(result.path.startsWith(backupDir(dataDir))).toBe(true);
    expect(count(result.path)).toBe(4);
    const db = new Database(result.path, { readonly: true });
    expect(db.prepare("PRAGMA integrity_check").get().integrity_check).toBe("ok");
    db.close();
    expect(readdirSync(backupDir(dataDir)).some((name) => name.includes("partial"))).toBe(false);
    store.close();
  });

  test.skipIf(!posix)("snapshot and backups folder are private (POSIX)", () => {
    const { dataDir, store } = makeHub();
    const { path } = runBackup(store, { dataDir });
    expect(mode(path)).toBe(0o600);
    expect(mode(backupDir(dataDir))).toBe(0o700);
    store.close();
  });

  test("is consistent while another connection keeps writing", async () => {
    const { dataDir, dbPath, store } = makeHub(10);
    const writer = new HubStore(dbPath);
    let stop = false;
    let written = 0;
    const loop = (async () => {
      while (!stop) {
        writer.add({ project: "shop", kind: "note", type: "note", title: `W${written}`, narrative: "Written during a backup." });
        written += 1;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })();
    const paths = [];
    for (let i = 0; i < 5; i += 1) {
      paths.push(runBackup(store, { dataDir, keep: 50 }).path);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    stop = true;
    await loop;
    expect(written).toBeGreaterThan(0);
    for (const path of paths) {
      const db = new Database(path, { readonly: true });
      expect(db.prepare("PRAGMA integrity_check").get().integrity_check).toBe("ok");
      expect(db.prepare("SELECT COUNT(*) AS n FROM memories").get().n).toBeGreaterThanOrEqual(10);
      db.close();
    }
    writer.close();
    store.close();
  });
});

describe("retention", () => {
  test("keeps only the configured number and always the newest", () => {
    const { dataDir, store } = makeHub();
    const made = [];
    for (let i = 0; i < 5; i += 1) made.push(runBackup(store, { dataDir, keep: 100, now: new Date(Date.UTC(2026, 10, 1 + i)) }).path);
    const result = pruneBackups(dataDir, 2);
    expect(result.removed.length).toBe(3);
    const left = listBackups(dataDir).map((item) => item.path);
    expect(left).toEqual([made[4], made[3]]);
    store.close();
  });

  test("run prunes on its own", () => {
    const { dataDir, store } = makeHub();
    for (let i = 0; i < 4; i += 1) runBackup(store, { dataDir, keep: 2, now: new Date(Date.UTC(2026, 10, 1 + i)) });
    expect(listBackups(dataDir).length).toBe(2);
    store.close();
  });

  test("keep of 0 or less still keeps the newest snapshot", () => {
    const { dataDir, store } = makeHub();
    for (let i = 0; i < 3; i += 1) runBackup(store, { dataDir, keep: 100, now: new Date(Date.UTC(2026, 10, 1 + i)) });
    pruneBackups(dataDir, 0);
    pruneBackups(dataDir, -5);
    expect(listBackups(dataDir).length).toBe(1);
    store.close();
  });

  test("an old file's mtime does not decide which one is newest", () => {
    const { dataDir, store } = makeHub();
    const a = runBackup(store, { dataDir, keep: 100, now: new Date(Date.UTC(2026, 10, 1)) }).path;
    const b = runBackup(store, { dataDir, keep: 100, now: new Date(Date.UTC(2026, 10, 2)) }).path;
    utimesSync(b, new Date(2000, 0, 1), new Date(2000, 0, 1));
    pruneBackups(dataDir, 1);
    expect(existsSync(b)).toBe(true);
    expect(existsSync(a)).toBe(false);
    store.close();
  });

  test("files that are not snapshots are left alone", () => {
    const { dataDir, store } = makeHub();
    runBackup(store, { dataDir });
    writeFileSync(join(backupDir(dataDir), "notes.txt"), "mine");
    pruneBackups(dataDir, 1);
    expect(existsSync(join(backupDir(dataDir), "notes.txt"))).toBe(true);
    store.close();
  });
});

describe("list, status and the schedule", () => {
  test("status is off by default and reports the folder", () => {
    const { dataDir, store } = makeHub();
    const status = backupStatus(store, { dataDir });
    expect(status.enabled).toBe(false);
    expect(status.intervalHours).toBe(24);
    expect(status.keep).toBe(7);
    expect(status.count).toBe(0);
    expect(status.newest).toBeNull();
    store.close();
  });

  test("tick does nothing while disabled, runs once when enabled, then waits for the interval", () => {
    const { dataDir, store } = makeHub();
    const t0 = new Date(Date.UTC(2026, 10, 11, 9, 0, 0));
    expect(backupTick(store, { dataDir, now: t0 })).toBeNull();
    writeSettings(store, { "backup.enabled": true, "backup.intervalHours": 2, "backup.keep": 3 });
    expect(backupTick(store, { dataDir, now: t0 })?.path).toBeTruthy();
    expect(backupTick(store, { dataDir, now: new Date(t0.getTime() + 60 * 60 * 1000) })).toBeNull();
    expect(backupTick(store, { dataDir, now: new Date(t0.getTime() + 2 * 60 * 60 * 1000) })?.path).toBeTruthy();
    expect(listBackups(dataDir).length).toBe(2);
    expect(backupStatus(store, { dataDir, now: t0 }).enabled).toBe(true);
    store.close();
  });

  test("settings validate the interval and the count", () => {
    expect(validateSetting("backup.enabled", true).ok).toBe(true);
    expect(validateSetting("backup.enabled", "yes").ok).toBe(false);
    expect(validateSetting("backup.intervalHours", 0).ok).toBe(false);
    expect(validateSetting("backup.keep", 0).ok).toBe(false);
    expect(validateSetting("backup.keep", 7).ok).toBe(true);
    const { store } = makeHub();
    expect(readSettings(store).find((item) => item.key === "backup.enabled").value).toBe(false);
    store.close();
  });
});

describe("restoreBackup", () => {
  test("refuses while the server runs and changes nothing", async () => {
    const { dataDir, dbPath, store } = makeHub(3);
    const { path } = runBackup(store, { dataDir });
    store.add({ project: "shop", kind: "note", type: "note", title: "Later", narrative: "Added after the snapshot." });
    store.close();
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("ok") });
    try {
      await expect(restoreBackup(path, { dataDir, dbPath, port: server.port })).rejects.toThrow(/server is running/i);
    } finally {
      server.stop(true);
    }
    expect(count(dbPath)).toBe(4);
  });

  test("refuses while another connection holds a read transaction or a write lock", async () => {
    const { dataDir, dbPath, store } = makeHub(3);
    const { path } = runBackup(store, { dataDir });
    store.add({ project: "shop", kind: "note", type: "note", title: "Later", narrative: "Added after the snapshot." });
    store.close();
    for (const begin of ["BEGIN", "BEGIN IMMEDIATE"]) {
      const other = new Database(dbPath);
      other.exec("PRAGMA busy_timeout = 0");
      other.exec(begin);
      if (begin === "BEGIN") other.prepare("SELECT COUNT(*) FROM memories").get();
      try {
        await expect(restoreBackup(path, { dataDir, dbPath, port: 1 })).rejects.toThrow(/in use by another process.*MCP/s);
      } finally {
        other.exec("ROLLBACK");
        other.close();
      }
      expect(count(dbPath)).toBe(4);
      expect(readdirSync(dataDir).some((name) => name.includes(".restoring"))).toBe(false);
    }
    await restoreBackup(path, { dataDir, dbPath, port: 1 });
    expect(count(dbPath)).toBe(3);
  });

  test("keeps a copy of the current file, swaps in the snapshot, and the result opens cleanly", async () => {
    const { dataDir, dbPath, store } = makeHub(3);
    const { path } = runBackup(store, { dataDir });
    store.add({ project: "shop", kind: "note", type: "note", title: "Later", narrative: "Added after the snapshot." });
    store.close();
    expect(count(dbPath)).toBe(4);
    const result = await restoreBackup(path, { dataDir, dbPath, port: 1 });
    expect(count(dbPath)).toBe(3);
    expect(existsSync(result.safetyCopy)).toBe(true);
    expect(count(result.safetyCopy)).toBe(4);
    // A raw copy of a WAL-mode file cannot be opened read-only without a -shm on macOS; the copy is in rollback mode.
    const copy = new Database(result.safetyCopy, { readonly: true });
    try { expect(copy.prepare("PRAGMA journal_mode").get().journal_mode).toBe("delete"); } finally { copy.close(); }
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    const reopened = new HubStore(dbPath);
    expect(reopened.db.prepare("PRAGMA integrity_check").get().integrity_check).toBe("ok");
    reopened.close();
    if (posix) {
      expect(mode(dbPath)).toBe(0o600);
      expect(mode(result.safetyCopy)).toBe(0o600);
    }
  });

  test("accepts a bare snapshot name from the backups folder", async () => {
    const { dataDir, dbPath, store } = makeHub(2);
    const { path } = runBackup(store, { dataDir });
    store.close();
    const result = await restoreBackup(path.split(/[\\/]/).pop(), { dataDir, dbPath, port: 1 });
    expect(result.restoredFrom).toBe(path);
  });

  test("rejects a file that is not a usable database and leaves the store alone", async () => {
    const { dataDir, dbPath, store } = makeHub(3);
    store.close();
    const bad = join(dataDir, "junk.db");
    writeFileSync(bad, "this is not sqlite");
    await expect(restoreBackup(bad, { dataDir, dbPath, port: 1 })).rejects.toThrow();
    await expect(restoreBackup(join(dataDir, "missing.db"), { dataDir, dbPath, port: 1 })).rejects.toThrow(/not found/i);
    expect(count(dbPath)).toBe(3);
    expect(readdirSync(dataDir).some((name) => name.includes("pre-restore"))).toBe(false);
  });

  test("rejects a snapshot from a newer schema", async () => {
    const { dataDir, dbPath, store } = makeHub(1);
    const { path } = runBackup(store, { dataDir });
    store.close();
    const db = new Database(path);
    db.exec("PRAGMA user_version = 9999");
    db.close();
    await expect(restoreBackup(path, { dataDir, dbPath, port: 1 })).rejects.toThrow(/schema/i);
  });
});

describe("CLI", () => {
  const run = (dataDir, args, input) => {
    const proc = Bun.spawnSync(["bun", join(root, "bin/aletheia.mjs"), ...args], {
      cwd: root,
      env: { ...process.env, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_PORT: "1", ALETHEIA_HOME: dataDir, HOME: dataDir },
      stdin: input ? new TextEncoder().encode(input) : undefined,
    });
    return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
  };

  test("backup run, list, status, then restore, then doctor accepts the store", () => {
    const { dataDir, dbPath, store } = makeHub(3);
    store.close();
    const made = run(dataDir, ["backup", "run"]);
    expect(made.code).toBe(0);
    expect(made.out).toContain("backups");
    const listed = run(dataDir, ["backup", "list", "--json"]);
    const items = JSON.parse(listed.out);
    expect(items.length).toBe(1);
    const status = JSON.parse(run(dataDir, ["backup", "status", "--json"]).out);
    expect(status.enabled).toBe(false);
    expect(status.count).toBe(1);

    const more = new HubStore(dbPath);
    more.add({ project: "shop", kind: "note", type: "note", title: "Later", narrative: "After." });
    more.close();
    const restored = run(dataDir, ["restore", items[0].path]);
    expect(restored.code).toBe(0);
    expect(count(dbPath)).toBe(3);
    const doctor = run(dataDir, ["doctor", "--json"]);
    const checks = JSON.parse(doctor.out);
    for (const name of ["permissions", "database"]) {
      const check = checks.find((item) => item.name === name);
      if (check) expect(check.ok).toBe(true);
    }
  });

  test("restore <id> still undoes a dismissal", () => {
    const { dataDir, store } = makeHub(1);
    const id = store.db.prepare("SELECT id FROM memories LIMIT 1").get().id;
    store.close();
    expect(run(dataDir, ["dismiss", String(id)]).code).toBe(0);
    expect(run(dataDir, ["restore", String(id)]).out).toContain("Restored memory");
  });

  test("restore without an argument prints usage", () => {
    const { dataDir, store } = makeHub(1);
    store.close();
    const result = run(dataDir, ["restore"]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("Usage");
  });
});
