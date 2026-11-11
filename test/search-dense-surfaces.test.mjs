// T-240: the hybrid ranking on every surface. REST /v1/search, the dashboard's paged search and MCP `search` answer a
// query that only the dense channel can find, and with no embedding package they answer from keywords and say so.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { denseQuery, workerEmbedder, MISSING_PACKAGE_NOTE } from "../src/hub/dense.mjs";
import { handleMessageAsync } from "../src/hub/mcp.mjs";
import { embedMissingFacts } from "../src/hub/search.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { tempDir } from "./temp-dirs.mjs";

const fakeEmbedder = {
  model: "fake-2d",
  dim: 2,
  embedDocs: async (texts) => texts.map((text) => (String(text).toLowerCase().includes("alpha") ? [1, 0] : [0, 1])),
  embedQuery: async (query) => (String(query).toLowerCase().includes("gamma") ? [1, 0] : [0, 1]),
};
const missingPackage = () => { throw new Error("Semantic search needs the optional package: bun add @huggingface/transformers"); };

let dir;
let dbPath;
let factId;
let memoryId;
const servers = [];

function seed(path, { vectors }) {
  const store = new HubStore(path);
  const episode = store.addEpisode({ project: "shop", text: "The alpha subsystem lives here.", sourceRef: "alpha:1", createdAtEpoch: 1_000 });
  factId = store.addFact({ project: "shop", subject: "alpha subsystem", predicate: "uses", object: "a queue", text: "The alpha subsystem uses a queue", episodeId: episode.id, confidence: 0.9, recordedAtEpoch: 1_000 }).fact.id;
  memoryId = store.add({ project: "shop", kind: "note", type: "note", title: "Alpha subsystem note", narrative: "The alpha subsystem uses a queue" }).id;
  store.add({ project: "shop", kind: "note", type: "note", title: "Beta note", narrative: "Unrelated beta text about billing" });
  return Promise.resolve(vectors ? embedMissingFacts(store, fakeEmbedder).then(() => store.embedMissing(fakeEmbedder)) : null).then(() => store.close());
}

const boot = (embedder) => {
  const running = startServer(loadConfig({ port: 0, dataDir: dir, hubDb: dbPath, sourceDb: join(dir, "no-source.db"), publicDir: join(import.meta.dir, "..", "public"), provider: "none", autoRefresh: false, extractionWorker: false }), { embedder });
  servers.push(running);
  return `http://127.0.0.1:${running.server.port}`;
};
const post = async (base, path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const toolCall = (query) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search", arguments: { query, project: "shop" } } });
const mcpText = (response) => response.result.content.map((part) => part.text).join("\n");

let denseBase;
let keywordBase;
let noVectorsBase;
let noVectorsDb;

beforeAll(async () => {
  dir = tempDir("dense-surfaces-");
  dbPath = join(dir, "hub.db");
  await seed(dbPath, { vectors: true });
  denseBase = boot(fakeEmbedder);
  keywordBase = boot(missingPackage);
  noVectorsDb = join(dir, "novec.db");
});

afterAll(() => { for (const s of servers) s.stop?.(); });

describe("dense results on every surface", () => {
  test("keyword search alone cannot find the query", async () => {
    const store = new HubStore(dbPath);
    try {
      expect(store.searchFacts({ query: "gamma", project: "shop" })).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("POST /v1/search returns the fact only the dense channel finds", async () => {
    const { status, body } = await post(denseBase, "/v1/search", { query: "gamma", project: "shop" });
    expect(status).toBe(200);
    expect(body.facts.map((fact) => fact.id)).toContain(factId);
    expect(body.results.map((row) => row.id)).toContain(memoryId);
    expect(body.channels.facts.vector).toBe(true);
    expect(body.channels.dense).toMatchObject({ status: "on", model: "fake-2d" });
    expect(body.channels.fused).toBe("rrf");
  });

  test("the dashboard's paged search returns the same dense hit", async () => {
    const { body } = await post(denseBase, "/v1/search", { query: "gamma", project: "shop", limit: 25, offset: 0, paged: true });
    expect(body.facts.map((fact) => fact.id)).toContain(factId);
    expect(body.results.map((row) => row.id)).toContain(memoryId);
    expect(body.channels.dense.status).toBe("on");
  });

  test("MCP search over stdio and over /mcp returns the dense hit", async () => {
    const store = new HubStore(dbPath);
    try {
      const direct = await handleMessageAsync(toolCall("gamma"), { store, embedder: fakeEmbedder });
      expect(mcpText(direct)).toContain(`fact #${factId}`);
      expect(mcpText(direct)).not.toContain("optional package");
    } finally {
      store.close();
    }
    const init = await post(denseBase, "/mcp", { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t" } } });
    const session = init.headers.get("mcp-session-id");
    const over = await post(denseBase, "/mcp", toolCall("gamma"), { "Mcp-Session-Id": session });
    expect(mcpText(over.body)).toContain(`fact #${factId}`);
  });

  test("a query the keyword channel answers still works with the dense channel on", async () => {
    const { body } = await post(denseBase, "/v1/search", { query: "alpha subsystem", project: "shop" });
    expect(body.facts.map((fact) => fact.id)).toContain(factId);
  });
});

describe("no embedding package", () => {
  test("REST answers keywords and a note that names the package", async () => {
    const { status, body } = await post(keywordBase, "/v1/search", { query: "alpha subsystem", project: "shop" });
    expect(status).toBe(200);
    expect(body.facts.map((fact) => fact.id)).toContain(factId);
    expect(body.channels.facts.vector).toBe(false);
    expect(body.channels.dense).toMatchObject({ status: "off", reason: "missing_package" });
    expect(body.channels.notice).toContain("@huggingface/transformers");
  });

  test("the paged (dashboard) reply carries the same note", async () => {
    const { body } = await post(keywordBase, "/v1/search", { query: "alpha subsystem", project: "shop", paged: true, limit: 25, offset: 0 });
    expect(body.total).toBeGreaterThan(0);
    expect(body.channels.notice).toContain("@huggingface/transformers");
  });

  test("MCP search keeps its keyword results and adds the note", async () => {
    const store = new HubStore(dbPath);
    try {
      const response = await handleMessageAsync(toolCall("alpha subsystem"), { store, embedder: missingPackage });
      const text = mcpText(response);
      expect(text).toContain(`fact #${factId}`);
      expect(text).toContain("@huggingface/transformers");
      expect(response.result.isError).toBeUndefined();
    } finally {
      store.close();
    }
  });

  test("a dense-only query returns nothing, with the note", async () => {
    const { body } = await post(keywordBase, "/v1/search", { query: "gamma", project: "shop" });
    expect(body.facts).toHaveLength(0);
    expect(body.channels.notice).toContain("@huggingface/transformers");
  });
});

describe("budget and fallbacks", () => {
  const store = () => new HubStore(dbPath);
  test("a slow model falls back to keywords inside the budget", async () => {
    const s = store();
    try {
      const slow = { model: "slow", embedQuery: () => new Promise(() => {}), embedDocs: async () => [] };
      const started = performance.now();
      const out = await denseQuery({ store: s, query: "gamma", embedder: slow, budgetMs: 50 });
      expect(performance.now() - started).toBeLessThan(1000);
      expect(out.queryVec).toBeNull();
      expect(out.dense.status).toBe("fallback");
    } finally {
      s.close();
    }
  });

  test("a model that is still loading falls back and says so", async () => {
    const s = store();
    try {
      const out = await denseQuery({ store: s, query: "gamma", embedder: () => new Promise(() => {}), budgetMs: 50 });
      expect(out.dense).toMatchObject({ status: "fallback", reason: "loading" });
    } finally {
      s.close();
    }
  });

  test("with the package but no stored vectors the note says to run embed", async () => {
    await seed(noVectorsDb, { vectors: false });
    const s = new HubStore(noVectorsDb);
    try {
      const out = await denseQuery({ store: s, query: "gamma", embedder: fakeEmbedder });
      expect(out.dense).toMatchObject({ status: "off", reason: "no_vectors" });
      expect(out.notice).toContain("aletheia embed");
    } finally {
      s.close();
    }
  });

  test("an embedder that throws is a fallback, not an error", async () => {
    const s = store();
    try {
      const bad = { model: "bad", embedQuery: async () => { throw new Error("boom"); }, embedDocs: async () => [] };
      const out = await denseQuery({ store: s, query: "gamma", embedder: bad });
      expect(out.queryVec).toBeNull();
      expect(out.dense.status).toBe("fallback");
    } finally {
      s.close();
    }
  });
});

describe("background embedding", () => {
  test("embedMissingFacts accepts a lazy embedder and writes vectors for new facts", async () => {
    const s = new HubStore(":memory:");
    try {
      const episode = s.addEpisode({ project: "p", text: "alpha", sourceRef: "a:1", createdAtEpoch: 1 });
      s.addFact({ project: "p", subject: "alpha", predicate: "is", object: "x", text: "alpha is x", episodeId: episode.id, confidence: 0.9, recordedAtEpoch: 1 });
      expect(await embedMissingFacts(s, workerEmbedder(fakeEmbedder))).toBe(1);
      expect(s.db.prepare("SELECT COUNT(*) AS n FROM fact_vectors").get().n).toBe(1);
    } finally {
      s.close();
    }
  });

  test("a missing package is zero facts embedded, not a throw", async () => {
    const s = new HubStore(":memory:");
    try {
      const episode = s.addEpisode({ project: "p", text: "alpha", sourceRef: "a:1", createdAtEpoch: 1 });
      s.addFact({ project: "p", subject: "alpha", predicate: "is", object: "x", text: "alpha is x", episodeId: episode.id, confidence: 0.9, recordedAtEpoch: 1 });
      expect(await embedMissingFacts(s, workerEmbedder(missingPackage))).toBe(0);
    } finally {
      s.close();
    }
  });
});

describe("replies describe only what the route reads", () => {
  test("no reply or source text offers a query vector the route ignores", async () => {
    const replies = [
      await post(denseBase, "/v1/search", { query: "alpha", project: "shop" }),
      await post(keywordBase, "/v1/search", { query: "alpha", project: "shop" }),
      await post(keywordBase, "/v1/search", { query: "alpha", project: "shop", paged: true }),
    ];
    for (const reply of replies) expect(JSON.stringify(reply.body)).not.toMatch(/query vector|POST a vector/i);
    expect(readFileSync(join(import.meta.dir, "..", "src/hub/routes.mjs"), "utf8")).not.toMatch(/POST a query vector/);
    expect(MISSING_PACKAGE_NOTE).not.toMatch(/query vector/i);
  });
});
