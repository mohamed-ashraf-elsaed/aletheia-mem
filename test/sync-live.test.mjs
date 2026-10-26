// T-105: live update frames over WebSocket. The server pushes advisory {kind, id, project} frames after a
// write; the 10-second poll stays the source of truth. Tests use a temp data dir and a loopback server.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { createLiveHub } from "../src/hub/live.mjs";
import { HubStore } from "../src/hub/store.mjs";

const API_KEY = "test-live-secret";
const temp = mkdtempSync(join(tmpdir(), "aletheia-live-"));
let app;
let base;
let port;

beforeAll(() => {
  const cfg = loadConfig({
    port: 0,
    sourceDb: join(temp, "source.db"),
    dataDir: join(temp, "data"),
    overlayDb: join(temp, "overlay.db"),
    reviewDb: join(temp, "review.db"),
    ledgerDir: join(temp, "ledger"),
    humanCopyCache: join(temp, "human.json"),
    rulesFile: join(temp, "RULES.md"),
    claudeInstructionsFile: join(temp, "CLAUDE.md"),
    hubDb: join(temp, "hub.db"),
    syncDb: join(temp, "sync.db"),
    provider: "none",
    apiKey: API_KEY,
    extractionWorker: false,
  });
  app = startServer(cfg);
  port = app.server.port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => {
  app.stop();
  rmSync(temp, { recursive: true, force: true });
});

function openSocket(path, { origin, auth = `Bearer ${API_KEY}` } = {}) {
  const headers = {};
  if (origin != null) headers.Origin = origin;
  if (auth != null) headers.Authorization = auth;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
  return new Promise((resolve, reject) => {
    const frames = [];
    const waiters = [];
    let opened = false;
    ws.onopen = () => {
      opened = true;
      resolve({
        ws,
        next: (timeout = 3000) => {
          if (frames.length) return Promise.resolve(frames.shift());
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error("no live frame arrived")), timeout);
            waiters.push((frame) => { clearTimeout(timer); res(frame); });
          });
        },
        close: () => ws.close(),
      });
    };
    ws.onerror = () => { if (!opened) reject(new Error("websocket handshake failed")); };
    ws.onclose = () => { if (!opened) reject(new Error("websocket closed before opening")); };
    ws.onmessage = (event) => {
      const frame = JSON.parse(event.data);
      const waiter = waiters.shift();
      if (waiter) waiter(frame); else frames.push(frame);
    };
  });
}

const writeMemory = async (project, text = "hello") => {
  const response = await fetch(`${base}/v1/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ project, kind: "note", title: text, narrative: text }),
  });
  return response.json();
};

describe("T-105: live update frames over WebSocket", () => {
  test("a write pushes a session frame with id and kind only", async () => {
    const client = await openSocket("/v1/live");
    const written = await writeMemory("shop", "live session");
    const frame = await client.next();
    expect(written.created).toBe(true);
    expect(frame).toMatchObject({ kind: "session", project: "shop" });
    expect(frame.id).toBeGreaterThan(0);
    expect(frame).not.toHaveProperty("text");
    expect(frame).not.toHaveProperty("payload");
    client.close();
  });

  test("an unauthenticated socket is refused", async () => {
    await expect(openSocket("/v1/live", { auth: "Bearer wrong" })).rejects.toThrow(/handshake failed|closed before opening/);
  });

  test("a bad Origin is refused", async () => {
    await expect(openSocket("/v1/live", { origin: "https://evil.example" })).rejects.toThrow(/handshake failed|closed before opening/);
  });

  test("a socket can reconnect and keep receiving frames", async () => {
    const first = await openSocket("/v1/live");
    await writeMemory("shop", "before reconnect");
    await first.next();
    first.close();

    const second = await openSocket("/v1/live");
    await writeMemory("shop", "after reconnect");
    const frame = await second.next();
    expect(frame).toMatchObject({ kind: "session", project: "shop" });
    second.close();
  });

  test("an out-of-scope project does not get a frame", async () => {
    const shop = await openSocket("/v1/live?project=shop");
    await writeMemory("docs", "docs only");
    await writeMemory("shop", "shop only");
    const frame = await shop.next();
    expect(frame).toMatchObject({ kind: "session", project: "shop" });
    shop.close();
  });

  test("a dismissed memory does not get a frame", () => {
    const store = new HubStore(":memory:");
    const row = store.add({ project: "shop", kind: "note", title: "gone", narrative: "gone" });
    store.dismiss("memory", row.id, { actor: "test" });
    const hub = createLiveHub(store);
    const received = [];
    hub.add({ data: { project: "shop" }, send: (text) => received.push(JSON.parse(text)) });
    hub.broadcast({ kind: "session", id: row.id, project: "shop" });
    expect(received).toEqual([]);
    store.close();
  });
});
