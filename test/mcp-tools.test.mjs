// T-069: work-state lists over MCP. One named list is stored as a single observation with a reserved type,
// a write then read round-trips, a second write replaces the list, and a malformed list is rejected.
import { describe, expect, test } from "bun:test";
import { callTool, TOOL_DEFS } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";

const ctx = (store) => ({ store, tool: "test", cwd: process.cwd() });

describe("work-state MCP tools", () => {
  test("a write then read round-trips", () => {
    const store = new HubStore(":memory:");
    const write = callTool("work_state_write", { list: "todo", items: ["ship", "test", "release"], project: "p" }, ctx(store));
    expect(write.content[0].text).toMatch(/Saved list "todo"/);
    const read = callTool("work_state_read", { list: "todo", project: "p" }, ctx(store));
    expect(JSON.parse(read.content[0].text)).toEqual(["ship", "test", "release"]);
    store.close();
  });

  test("writing the same list again replaces it, never duplicates it", () => {
    const store = new HubStore(":memory:");
    callTool("work_state_write", { list: "todo", items: ["a"], project: "p" }, ctx(store));
    const again = callTool("work_state_write", { list: "todo", items: ["b", "c"], project: "p" }, ctx(store));
    expect(again.content[0].text).toMatch(/Updated list "todo"/);
    expect(JSON.parse(callTool("work_state_read", { list: "todo", project: "p" }, ctx(store)).content[0].text)).toEqual(["b", "c"]);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM memories WHERE type = 'work-state'").get().n).toBe(1);
    store.close();
  });

  test("a malformed list is rejected", () => {
    const store = new HubStore(":memory:");
    expect(callTool("work_state_write", { list: "x", items: "not-an-array", project: "p" }, ctx(store)).isError).toBe(true);
    expect(callTool("work_state_write", { list: "  ", items: [], project: "p" }, ctx(store)).isError).toBe(true);
    store.close();
  });

  test("the tool list documents the new tools", () => {
    const names = TOOL_DEFS.map((tool) => tool.name);
    expect(names).toContain("work_state_write");
    expect(names).toContain("work_state_read");
  });
});
