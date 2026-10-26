// T-104: device pairing, device tokens and revoke. Pairing codes are short-lived and single use; tokens are
// 256-bit random values stored only as hashes, revocable, compared in constant time. The server binds to
// loopback by default. Revoked and expired tokens are refused; pairing attempts are rate limited.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { safeEqualHex, SyncStore } from "../src/hub/sync/store.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-sync-dev-"));
let hub;
let accountId;

beforeAll(() => {
  hub = startSyncServer({ syncDb: join(temp, "hub", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
  accountId = hub.store.ensureAccount("default").id;
});

afterAll(() => {
  hub.stop();
  rmSync(temp, { recursive: true, force: true });
});

const joinHub = (code, deviceId, name = deviceId) => fetch(`${hub.url}/v1/sync/join`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, device_id: deviceId, name }),
});
const pushWith = (token, deviceId) => fetch(`${hub.url}/v1/sync/push`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Device-Id": deviceId, "X-Device-Name": deviceId },
  body: JSON.stringify({ ops: [] }),
});

describe("T-104: device pairing, tokens and revoke", () => {
  test("the hub binds to loopback by default", () => {
    expect(hub.url.startsWith("http://127.0.0.1:")).toBe(true);
  });

  test("a pairing code is single use and exchanges for a device token", async () => {
    const code = hub.store.createPairCode(accountId);
    expect(code).toMatch(/^[a-f0-9]{8}$/);
    const first = await joinHub(code, "device-1", "Laptop");
    expect(first.status).toBe(200);
    const { token } = await first.json();
    expect(token).toMatch(/^[a-f0-9]{64}$/);

    const again = await joinHub(code, "device-2", "Phone");
    expect(again.status).toBe(403);
    expect((await again.json()).error).toContain("already used");
  });

  test("(h) an expired pairing code is refused", async () => {
    const code = hub.store.createPairCode(accountId, { ttlMs: 1 });
    await Bun.sleep(5);
    const response = await joinHub(code, "device-3");
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("expired");
  });

  test("tokens are random 256-bit values stored hashed, never plaintext", () => {
    const minted = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-h", name: "H" });
    expect(minted.token).toMatch(/^[a-f0-9]{64}$/);
    const listed = hub.store.listTokens(accountId).find((token) => token.id === minted.id);
    expect(listed.token).toBeNull(); // the raw token is never returned
    const row = hub.store.db.prepare("SELECT token_sha256 FROM sync_token WHERE id = ?").get(minted.id);
    expect(row.token_sha256).not.toBe(minted.token);
    expect(row.token_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("token comparison is constant time", () => {
    expect(safeEqualHex("ab", "ab")).toBe(true);
    expect(safeEqualHex("ab", "cd")).toBe(false);
    expect(safeEqualHex("ab", "abc")).toBe(false); // different length
  });

  test("(g) a revoked token gets 401 on the next call", async () => {
    const minted = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-r", name: "R" });
    expect((await pushWith(minted.token, "device-r")).status).toBe(200);
    hub.store.revokeDevice(accountId, "device-r");
    const response = await pushWith(minted.token, "device-r");
    expect(response.status).toBe(401);
  });

  test("devices list shows name, last seen and revoke state", async () => {
    hub.store.upsertDevice(accountId, "device-l", "Listed");
    const admin = hub.store.mintToken(accountId, { scope: "admin", deviceId: "device-admin", name: "Admin" }).token;
    const response = await fetch(`${hub.url}/v1/sync/devices`, { headers: { Authorization: `Bearer ${admin}` } });
    const { devices } = await response.json();
    expect(response.status).toBe(200);
    expect(devices.some((device) => device.deviceId === "device-l" && device.name === "Listed")).toBe(true);
  });

  test("revoking a device stops its pushes immediately", async () => {
    const minted = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-rv", name: "RV" });
    expect((await pushWith(minted.token, "device-rv")).status).toBe(200);
    const admin = hub.store.mintToken(accountId, { scope: "admin", deviceId: "device-admin", name: "Admin" }).token;
    const revoked = await fetch(`${hub.url}/v1/sync/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ device_id: "device-rv" }),
    });
    expect(revoked.status).toBe(200);
    expect((await pushWith(minted.token, "device-rv")).status).toBe(401);
  });

  test("pairing attempts are rate limited", async () => {
    const fresh = startSyncServer({ syncDb: join(temp, "flood", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
    const attempt = (deviceId) => fetch(`${fresh.url}/v1/sync/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "00000000", device_id: deviceId }),
    });
    try {
      for (let i = 0; i < 5; i++) {
        const response = await attempt(`device-flood-${i}`);
        expect(response.status).toBe(404); // unknown code, before the limiter trips
      }
      const limited = await attempt("device-flood-6");
      expect(limited.status).toBe(429);
    } finally {
      fresh.stop();
    }
  });
});
