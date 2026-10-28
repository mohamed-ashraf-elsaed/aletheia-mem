// optional end-to-end encryption for sync. The device seals each put payload with the account's
// 256-bit data key (AES-256-GCM, random 96-bit nonce) before it enters the outbox; the hub stores only
// ciphertext plus ordering metadata. The data key exists on the server only wrapped by a scrypt-derived
// KEK. Tests prove: no plaintext markers on the wire or in the server DB, tamper rejection, nonce
// uniqueness over 10,000 ops, clean wrong-passphrase failure, two-device convergence, the server-compromise
// view, no plaintext in the audit table, rotation, passphrase change, recovery files and purge-plaintext.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeContentHash, stableStringify } from "../src/hub/sync/engine.mjs";
import { DEFAULT_KDF, decryptPayload, deriveKek, encryptPayload, isEnvelope, randomKey, unwrapKey, wrapKey } from "../src/hub/sync/e2ee.mjs";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-e2ee-"));
const MARKER = "TOP-SECRET-MARKER-xyzzy-42";
const PASSPHRASE = "correct horse battery staple";

let hub;
let accountId;
let syncDbPath;

beforeAll(() => {
  syncDbPath = join(temp, "hub", "sync.db");
  hub = startSyncServer({ syncDb: syncDbPath, host: "127.0.0.1", port: 0, name: "default" });
  accountId = hub.store.ensureAccount("default").id;
});

afterAll(() => {
  hub.stop();
  rmSync(temp, { recursive: true, force: true });
});

const joinClient = async (dir, code, name = "device") => {
  const client = new SyncClient(join(temp, dir, "client.db"), { name });
  const response = await fetch(`${hub.url}/v1/sync/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, device_id: client.deviceId, name }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  client.setMeta("hub_url", hub.url);
  client.setMeta("token", data.token);
  return client;
};

const serverBodies = () =>
  hub.store.db.prepare("SELECT body FROM sync_op WHERE account_id = ? AND body != ''").all(accountId).map((row) => row.body);

const OLD_KDF = { name: "scrypt", N: 16384, r: 8, p: 1, keyLen: 32 };

/** Write a wrapped data key with explicit params, as an account created before the KDF default changed would have. */
function installOldKey(store, id, passphrase, params = OLD_KDF, kid = 1) {
  const dataKey = randomKey(32);
  const salt = randomKey(16).toString("base64");
  const wrapped = wrapKey(dataKey, deriveKek(passphrase, salt, params));
  store.db.prepare("INSERT INTO sync_e2ee_key (account_id, kid, salt, wrapped_key, kdf, params, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(Number(id), kid, salt, stableStringify(wrapped), params.name, stableStringify(params), Date.now());
  store.db.prepare("UPDATE sync_account SET e2ee = 1, current_kid = ? WHERE id = ?").run(kid, Number(id));
  return dataKey;
}

describe("end-to-end encryption for sync", () => {
  test("the crypto primitives round-trip, a wrong passphrase fails cleanly, tampering is rejected", () => {
    const dataKey = Buffer.alloc(32, 7);
    const salt = Buffer.alloc(16, 9).toString("base64");
    const kek = deriveKek(PASSPHRASE, salt);
    const wrappedKey = wrapKey(dataKey, kek);
    expect(unwrapKey(wrappedKey, kek).equals(dataKey)).toBe(true);
    expect(() => unwrapKey(wrappedKey, deriveKek("wrong", salt))).toThrow();

    const envelope = encryptPayload(Buffer.from(JSON.stringify({ text: MARKER }), "utf8"), dataKey, "aad-1", 1);
    expect(decryptPayload(envelope, dataKey, "aad-1")).toContain(MARKER);
    expect(() => decryptPayload(envelope, dataKey, "different-aad")).toThrow(); // AAD binds the ciphertext
    const flipped = envelope.ct[0] === "A" ? "B" : "A";
    const tampered = { ...envelope, ct: `${flipped}${envelope.ct.slice(1)}` };
    expect(() => decryptPayload(tampered, dataKey, "aad-1")).toThrow(); // GCM tag fails
  });

  test("enable-e2ee stores only a wrapped key; the raw data key never appears in the server DB", async () => {
    hub.store.enableE2ee(accountId, { passphrase: PASSPHRASE });
    const status = hub.store.e2eeStatus(accountId);
    expect(status.enabled).toBe(true);
    expect(status.currentKid).toBe(1);
    expect(status.keys).toHaveLength(1);
    expect(JSON.stringify(status.keys)).not.toContain("raw");
    expect(() => hub.store.enableE2ee(accountId, { passphrase: PASSPHRASE })).toThrow(/already enabled/);
    const dbBytes = readFileSync(syncDbPath, "utf8");
    expect(dbBytes).not.toContain(MARKER);
  });

  test("ciphertext on the wire and in the server DB has none of the plaintext markers", async () => {
    const code = hub.store.createPairCode(accountId);
    const a = await joinClient("a", code, "Alpha");
    try {
      await a.unlockE2ee({ url: hub.url, token: a.meta("token"), passphrase: PASSPHRASE });
      const op = a.put("memory", { project: "shop", title: "the secret", narrative: MARKER });
      expect(isEnvelope(op.payload)).toBe(true);
      expect(JSON.stringify(op)).not.toContain(MARKER);
      expect(op.content_hash).toBe(computeContentHash(op)); // hash is over the ciphertext

      const pushed = await a.push(hub.url, a.meta("token"));
      expect(pushed.pushed).toBe(1);
      const bodies = serverBodies();
      expect(bodies.join(" ")).not.toContain(MARKER);
      expect(bodies.join(" ")).not.toContain("the secret");

      // a fresh device with a token but no key sees envelopes, not plaintext
      const code2 = hub.store.createPairCode(accountId);
      const locked = await joinClient("locked", code2, "Locked");
      try {
        const pulled = await locked.pull(hub.url, locked.meta("token"));
        expect(pulled.e2ee).toBe(true);
        const ops = pulled.pulled;
        expect(ops).toBeGreaterThan(0);
        expect(JSON.stringify(locked.allOps())).not.toContain(MARKER);
        expect(isEnvelope(locked.allOps().find((o) => o.op === "put").payload)).toBe(true);
      } finally {
        locked.close();
      }
    } finally {
      a.close();
    }
  });

  test("a wrong passphrase fails cleanly", async () => {
    const code = hub.store.createPairCode(accountId);
    const device = await joinClient("wrong", code, "Wrong");
    try {
      await expect(device.unlockE2ee({ url: hub.url, token: device.meta("token"), passphrase: "not the passphrase" })).rejects.toThrow(/Wrong passphrase/);
    } finally {
      device.close();
    }
  });

  test("two devices converge with E2EE on", async () => {
    const codeA = hub.store.createPairCode(accountId);
    const a = await joinClient("conv-a", codeA, "A");
    const codeB = hub.store.createPairCode(accountId);
    const b = await joinClient("conv-b", codeB, "B");
    try {
      await a.unlockE2ee({ url: hub.url, token: a.meta("token"), passphrase: PASSPHRASE });
      await b.unlockE2ee({ url: hub.url, token: b.meta("token"), passphrase: PASSPHRASE });
      a.put("memory", { project: "shop", title: "from A", narrative: `A-${MARKER}` });
      b.put("memory", { project: "shop", title: "from B", narrative: `B-${MARKER}` });
      await a.push(hub.url, a.meta("token"));
      await b.push(hub.url, b.meta("token"));
      await a.pull(hub.url, a.meta("token"));
      await b.pull(hub.url, b.meta("token"));
      const texts = (client) => client.entities().map((e) => JSON.stringify(e.payload));
      expect(texts(a).join(" ")).toContain(`A-${MARKER}`);
      expect(texts(a).join(" ")).toContain(`B-${MARKER}`);
      expect(a.contentHash()).toBe(b.contentHash());
    } finally {
      a.close();
      b.close();
    }
  });

  test("tampering with the ciphertext is rejected by the client (GCM tag fails)", async () => {
    const code = hub.store.createPairCode(accountId);
    const device = await joinClient("tamper", code, "Tamper");
    try {
      await device.unlockE2ee({ url: hub.url, token: device.meta("token"), passphrase: PASSPHRASE });
      await device.pull(hub.url, device.meta("token"));
      const row = device.db.prepare("SELECT * FROM sync_op WHERE kind = 'put' AND source = 'remote' LIMIT 1").get();
      const envelope = JSON.parse(row.payload);
      const op = { device_id: row.device_id, seq: row.seq, hlc: row.hlc, entity_type: row.entity_type, entity_id: row.entity_id, op: row.kind, supersedes: row.supersedes ? JSON.parse(row.supersedes) : null };
      const raw = Buffer.from(envelope.ct, "base64");
      raw[0] ^= 0x01; // flip one bit inside the ciphertext
      const corrupted = { ...envelope, ct: raw.toString("base64") };
      const key = device.dataKey(envelope.kid);
      expect(key).toBeTruthy();
      expect(() => decryptPayload(corrupted, key, device.e2eeAad(op))).toThrow();
    } finally {
      device.close();
    }
  });

  test("nonces are unique over 10,000 ops", async () => {
    const code = hub.store.createPairCode(accountId);
    const device = await joinClient("nonces", code, "Nonces");
    try {
      await device.unlockE2ee({ url: hub.url, token: device.meta("token"), passphrase: PASSPHRASE });
      const nonces = new Set();
      for (let i = 0; i < 10_000; i++) {
        const op = device.put("memory", { project: "shop", title: `t${i}`, narrative: `n${i} ${MARKER}` });
        nonces.add(op.payload.nonce);
      }
      expect(nonces.size).toBe(10_000);
    } finally {
      device.close();
    }
  });

  test("a server compromise simulation: the DB holds ciphertext only and cannot be decrypted without the passphrase", async () => {
    const bodies = serverBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.join(" ")).not.toContain(MARKER);
    const dbBytes = readFileSync(syncDbPath, "utf8");
    expect(dbBytes).not.toContain(MARKER);
    // The wrapped key is not the data key; decrypting with a wrong passphrase fails.
    const status = hub.store.e2eeStatus(accountId);
    const wrapped = status.keys.find((key) => key.kid === status.currentKid);
    expect(() => unwrapKey(wrapped.wrappedKey, deriveKek("attacker guess", wrapped.salt))).toThrow();
    // The audit table holds no payload text either.
    const audit = JSON.stringify(hub.store.auditLog(accountId, 500));
    expect(audit).not.toContain(MARKER);
    expect(audit).not.toContain("the secret");
  });

  test("rotation: new ops use the new kid and both keys decrypt; passphrase change re-wraps", async () => {
    const before = hub.store.e2eeStatus(accountId);
    hub.store.rotateE2eeKey(accountId, { passphrase: PASSPHRASE });
    const after = hub.store.e2eeStatus(accountId);
    expect(after.currentKid).toBe(before.currentKid + 1);

    hub.store.changePassphrase(accountId, { oldPassphrase: PASSPHRASE, newPassphrase: "a brand new passphrase" });
    const code = hub.store.createPairCode(accountId);
    const device = await joinClient("rotate", code, "Rotate");
    try {
      await expect(device.unlockE2ee({ url: hub.url, token: device.meta("token"), passphrase: PASSPHRASE })).rejects.toThrow(/Wrong passphrase/);
      await device.unlockE2ee({ url: hub.url, token: device.meta("token"), passphrase: "a brand new passphrase" });
      const op = device.put("memory", { project: "shop", title: "rotated", narrative: `rot-${MARKER}` });
      expect(op.payload.kid).toBe(after.currentKid);
      await device.push(hub.url, device.meta("token"));
      await device.pull(hub.url, device.meta("token"));
      expect(JSON.stringify(device.entities())).toContain(`rot-${MARKER}`);
      expect(JSON.stringify(device.entities())).toContain(`A-${MARKER}`); // old ciphertext still decrypts
    } finally {
      device.close();
    }
  }, 30_000);

  test("export-recovery-key round-trips without a passphrase and has 0600 permissions", async () => {
    const code = hub.store.createPairCode(accountId);
    const source = await joinClient("recovery-src", code, "Source");
    try {
      await source.unlockE2ee({ url: hub.url, token: source.meta("token"), passphrase: "a brand new passphrase" });
      const recovery = source.exportRecoveryKey();
      expect(recovery).toContain("version");

      const code2 = hub.store.createPairCode(accountId);
      const restored = await joinClient("recovery-dst", code2, "Restored");
      try {
        restored.importRecoveryKey(recovery);
        await restored.pull(hub.url, restored.meta("token"));
        expect(JSON.stringify(restored.entities())).toContain(`rot-${MARKER}`);
      } finally {
        restored.close();
      }

      // POSIX mode bits do not exist on Windows; the 0600 write is still issued, but the assertion is POSIX-only.
      if (process.platform !== "win32") {
        const { statSync, writeFileSync } = await import("node:fs");
        const out = join(temp, "recovery.key");
        writeFileSync(out, `${recovery}\n`, { mode: 0o600 });
        expect(statSync(out).mode & 0o777).toBe(0o600);
      }
    } finally {
      source.close();
    }
  });

  test("unencrypted accounts keep working, and purge-plaintext re-wraps old bodies", async () => {
    const plain = startSyncServer({ syncDb: join(temp, "plain", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
    try {
      const plainAccount = plain.store.ensureAccount("default").id;
      const code = plain.store.createPairCode(plainAccount);
      const device = new SyncClient(join(temp, "plain", "client.db"), { name: "Plain" });
      const joinRes = await fetch(`${plain.url}/v1/sync/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, device_id: device.deviceId, name: "Plain" }) });
      const { token } = await joinRes.json();
      device.setMeta("hub_url", plain.url);
      device.setMeta("token", token);
      try {
        device.put("memory", { project: "shop", title: "plain", narrative: `plain-${MARKER}` });
        await device.push(plain.url, token);
        const bodies = plain.store.db.prepare("SELECT body FROM sync_op WHERE body != ''").all().map((row) => row.body);
        expect(bodies.join(" ")).toContain(`plain-${MARKER}`); // plaintext account: unchanged behaviour

        // enable E2EE afterwards; the old op stays until purge-plaintext --apply
        plain.store.enableE2ee(plainAccount, { passphrase: "purge pass" });
        const stats = plain.store.purgePlaintext(plainAccount, { apply: false });
        expect(stats.ops).toBeGreaterThan(0);
        expect(stats.applied).toBe(false);
        const purged = plain.store.purgePlaintext(plainAccount, { apply: true, passphrase: "purge pass" });
        expect(purged.ops).toBeGreaterThan(0);
        const after = plain.store.db.prepare("SELECT body FROM sync_op WHERE body != ''").all().map((row) => row.body);
        expect(after.join(" ")).not.toContain(`plain-${MARKER}`);
        expect(plain.store.plaintextStats(plainAccount)).toEqual({ ops: 0, heads: 0 });
      } finally {
        device.close();
      }
    } finally {
      plain.stop();
    }
  });

  test("the Hub UI sync status carries the E2EE line data", async () => {
    const e2ee = hub.store.e2eeStatus(accountId);
    expect(e2ee).toMatchObject({ enabled: true });
    expect(e2ee.currentKid).toBeGreaterThan(0);
  });

  test("an account created with the old scrypt parameters still unlocks from the record, not a constant", async () => {
    const legacy = startSyncServer({ syncDb: join(temp, "legacy", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
    try {
      const id = legacy.store.ensureAccount("default").id;
      installOldKey(legacy.store, id, PASSPHRASE);
      expect(legacy.store.e2eeStatus(id).keys[0].params.N).toBe(OLD_KDF.N);
      const code = legacy.store.createPairCode(id);
      const device = new SyncClient(join(temp, "legacy", "client.db"), { name: "Legacy" });
      const res = await fetch(`${legacy.url}/v1/sync/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, device_id: device.deviceId, name: "Legacy" }) });
      const { token } = await res.json();
      device.setMeta("hub_url", legacy.url);
      device.setMeta("token", token);
      try {
        await device.unlockE2ee({ url: legacy.url, token, passphrase: PASSPHRASE });
        const op = device.put("memory", { project: "shop", title: "legacy", narrative: `legacy-${MARKER}` });
        expect(isEnvelope(op.payload)).toBe(true);
        expect(JSON.stringify(op)).not.toContain(MARKER);
      } finally {
        device.close();
      }
    } finally {
      legacy.stop();
    }
  });

  test("upgrade-kdf re-wraps the data key under the OWASP minimum and never touches op ciphertext", async () => {
    const legacy = startSyncServer({ syncDb: join(temp, "upgrade", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
    try {
      const id = legacy.store.ensureAccount("default").id;
      installOldKey(legacy.store, id, PASSPHRASE);
      const code = legacy.store.createPairCode(id);
      const device = new SyncClient(join(temp, "upgrade", "client.db"), { name: "Upgrade" });
      const res = await fetch(`${legacy.url}/v1/sync/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, device_id: device.deviceId, name: "Upgrade" }) });
      const { token } = await res.json();
      device.setMeta("hub_url", legacy.url);
      device.setMeta("token", token);
      try {
        await device.unlockE2ee({ url: legacy.url, token, passphrase: PASSPHRASE });
        device.put("memory", { project: "shop", title: "before", narrative: `before-${MARKER}` });
        await device.push(legacy.url, token);
      } finally {
        device.close();
      }
      const bodiesBefore = legacy.store.db.prepare("SELECT body FROM sync_op WHERE body != ''").all().map((row) => row.body);
      expect(bodiesBefore.length).toBeGreaterThan(0);
      const before = legacy.store.e2eeStatus(id);
      expect(before.keys[0].params.N).toBe(OLD_KDF.N);

      const result = legacy.store.upgradeE2eeKdf(id, { passphrase: PASSPHRASE });
      expect(result.upgraded).toEqual([1]);

      const after = legacy.store.e2eeStatus(id);
      expect(after.keys[0].params.N).toBe(DEFAULT_KDF.N);
      expect(legacy.store.db.prepare("SELECT body FROM sync_op WHERE body != ''").all().map((row) => row.body)).toEqual(bodiesBefore);

      const code2 = legacy.store.createPairCode(id);
      const fresh = new SyncClient(join(temp, "upgrade", "fresh.db"), { name: "Fresh" });
      const res2 = await fetch(`${legacy.url}/v1/sync/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code2, device_id: fresh.deviceId, name: "Fresh" }) });
      const token2 = (await res2.json()).token;
      fresh.setMeta("hub_url", legacy.url);
      fresh.setMeta("token", token2);
      try {
        await fresh.unlockE2ee({ url: legacy.url, token: token2, passphrase: PASSPHRASE });
        await fresh.pull(legacy.url, token2);
        expect(JSON.stringify(fresh.entities())).toContain(`before-${MARKER}`);
      } finally {
        fresh.close();
      }
    } finally {
      legacy.stop();
    }
  });

  test("upgrade-kdf refuses a wrong passphrase", () => {
    const legacy = startSyncServer({ syncDb: join(temp, "upgrade-wrong", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
    try {
      const id = legacy.store.ensureAccount("default").id;
      installOldKey(legacy.store, id, PASSPHRASE);
      expect(() => legacy.store.upgradeE2eeKdf(id, { passphrase: "wrong" })).toThrow(/Wrong passphrase/);
    } finally {
      legacy.stop();
    }
  });
});
