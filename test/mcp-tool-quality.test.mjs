// Tool definitions are what MCP clients and registries judge a server by. Every tool must carry annotations,
// a real description, a description on every input property, and hints that match what its handler does.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleMessage, callTool } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const store = new HubStore(":memory:");
const ctx = { store, tool: "quality", cwd: "/work/quality" };
const listed = handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, ctx).result.tools;
store.close();
const byName = Object.fromEntries(listed.map((tool) => [tool.name, tool]));

// One valid call per tool, in an order where restore_memory follows dismiss_memory.
const calls = {
  search: { query: "alpha" },
  timeline: { anchor: 1 },
  get_observations: { ids: [1] },
  fact_history: { subject: "alpha" },
  session_start_context: {},
  list_rules: {},
  work_state_read: { list: "todo" },
  save_memory: { text: "a new memory about beta", title: "beta" },
  add_rule: { then: "Answer briefly." },
  confirm_rule: { id: "@RULE" },
  work_state_write: { list: "todo", items: ["a"] },
  dismiss_memory: { id: 1 },
  restore_memory: { id: 1 },
};

describe("MCP tool definitions", () => {
  test("lists 13 tools", () => {
    expect(listed.length).toBe(13);
    expect(Object.keys(calls).sort()).toEqual(Object.keys(byName).sort());
  });

  test.each(Object.keys(calls))("%s has annotations, a description and described parameters", (name) => {
    const tool = byName[name];
    expect(tool.title?.length).toBeGreaterThan(3);
    expect(tool.description.length).toBeGreaterThanOrEqual(120);
    const a = tool.annotations;
    expect(a).toBeDefined();
    expect(typeof a.readOnlyHint).toBe("boolean");
    expect(typeof a.idempotentHint).toBe("boolean");
    expect(a.openWorldHint).toBe(false);
    if (a.readOnlyHint === false) expect(typeof a.destructiveHint).toBe("boolean");
    for (const [prop, schema] of Object.entries(tool.inputSchema.properties)) {
      expect(typeof schema.description === "string" && schema.description.length >= 10, `${name}.${prop} needs a description`).toBe(true);
    }
    for (const required of tool.inputSchema.required ?? []) expect(tool.inputSchema.properties[required]).toBeDefined();
  });

  test("tools that return recalled text say it is untrusted", () => {
    for (const name of ["search", "timeline", "get_observations", "fact_history", "session_start_context"]) {
      expect(byName[name].description).toContain("untrusted");
    }
  });

  test("readOnlyHint matches whether the handler changes the database", () => {
    const dir = tempDir();
    const db = new HubStore(join(dir, "quality.db"));
    db.add({ project: "p", kind: "observation", type: "note", title: "alpha", narrative: "alpha text" });
    const local = { store: db, tool: "quality", cwd: "/work/quality" };
    const snapshot = () => Buffer.from(db.db.serialize()).toString("base64");
    const ruleId = db.rules.add({ then: "Keep answers short." }).id;
    for (const [name, sample] of Object.entries(calls)) {
      const args = JSON.parse(JSON.stringify(sample).replace("@RULE", ruleId));
      const before = snapshot();
      const result = callTool(name, args, local);
      expect(result.isError, `${name} sample call must succeed`).toBeFalsy();
      const changed = snapshot() !== before;
      expect(changed, `${name}: readOnlyHint ${byName[name].annotations.readOnlyHint} vs changed ${changed}`).toBe(!byName[name].annotations.readOnlyHint);
    }
    db.close();
  });
});
