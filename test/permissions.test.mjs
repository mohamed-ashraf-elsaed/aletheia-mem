// T-010: the data directory is 0700 and the database, WAL sidecars, spool and token files are 0600,
// both on create and when an older looser install is opened. chmod is POSIX-only: the helpers skip it on
// Windows with a documented reason, and the symlink test is skipped there for the same reason.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { ensureFileMode, modeOctal } from "../src/hub/permissions.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { spoolAppend } from "../src/hub/hooks/shared.mjs";
import { SyncClient } from "../src/hub/sync/client.mjs";

const mode = (path) => statSync(path).mode & 0o777;

afterAll(() => cleanupTempDirs());

describe("data permissions", () => {
  test("a new store secures the data dir, the db and the WAL sidecars", () => {
    const dataDir = join(tempDir("aletheia-perm-"), "data");
    mkdirSync(dataDir, { recursive: true }); // 0755 by default
    const dbPath = join(dataDir, "hub.db");
    const store = new HubStore(dbPath);
    store.add({ project: "shop", kind: "note", type: "note", title: "A", narrative: "Write so -wal and -shm exist." });
    store.close();

    expect(mode(dataDir)).toBe(0o700);
    expect(mode(dbPath)).toBe(0o600);
    expect(mode(`${dbPath}-wal`)).toBe(0o600);
    expect(mode(`${dbPath}-shm`)).toBe(0o600);
  });

  test("an existing 0755 dir and 0644 db are repaired on open", () => {
    const dataDir = join(tempDir("aletheia-repair-"), "data");
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, "hub.db");
    let store = new HubStore(dbPath);
    store.add({ project: "shop", kind: "note", type: "note", title: "A", narrative: "Write." });
    store.close();

    chmodSync(dataDir, 0o755);
    chmodSync(dbPath, 0o644);
    chmodSync(`${dbPath}-wal`, 0o644);
    chmodSync(`${dbPath}-shm`, 0o644);

    store = new HubStore(dbPath);
    store.close();

    expect(mode(dataDir)).toBe(0o700);
    expect(mode(dbPath)).toBe(0o600);
    expect(mode(`${dbPath}-wal`)).toBe(0o600);
    expect(mode(`${dbPath}-shm`)).toBe(0o600);
  });

  test.skipIf(process.platform === "win32")("POSIX symlinks and mode bits are not available on Windows", () => {
    const root = tempDir("aletheia-symlink-");
    const target = join(root, "real");
    const link = join(root, "data");
    mkdirSync(target, { recursive: true });
    symlinkSync(target, link);

    const store = new HubStore(join(link, "hub.db"));
    store.close();

    expect(mode(target)).toBe(0o700);
    expect(mode(link)).toBe(0o700); // stat follows the symlink to the secured target
  });

  test("spool and token files are 0600", () => {
    const dataDir = tempDir("aletheia-spool-");
    spoolAppend(dataDir, { kind: "memory", memory: { title: "A" } });
    expect(mode(join(dataDir, "spool", "hook-spool.jsonl"))).toBe(0o600);

    const client = new SyncClient(join(dataDir, "sync-client.db"));
    client.setMeta("token", "device-token-123");
    client.close();
    expect(mode(join(dataDir, "sync-client.db"))).toBe(0o600);
    expect(mode(join(dataDir, "sync-client.db-wal"))).toBe(0o600);
  });

  test("the helpers are graceful on missing paths and no-ops on :memory:", () => {
    expect(ensureFileMode(join(tempDir("aletheia-missing-"), "nope.db"), 0o600)).toBeNull();
    expect(modeOctal(join(tempDir("aletheia-missing2-"), "nope"))).toBeNull();
    expect(ensureFileMode(":memory:", 0o600)).toBeNull();
  });
});
