// search by file. Exact path is the default, a suffix match is opt-in, and a project filter keeps
// the same path in two projects from cross-matching.
import { describe, expect, test } from "bun:test";
import { callTool } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";

function seed(store) {
  const a = store.add({ project: "p", title: "Auth", narrative: "touched the auth service", files: ["src/auth.ts", "src/index.ts"], tool: "t1" });
  const b = store.add({ project: "p", title: "Cart", narrative: "touched the cart service", files: ["src/cart.ts"], tool: "t1" });
  const c = store.add({ project: "q", title: "Other", narrative: "same path in another project", files: ["src/index.ts"], tool: "t2" });
  return { a, b, c };
}

describe("search by file", () => {
  test("an exact path returns the memories that touched it and no other project", () => {
    const store = new HubStore(":memory:");
    const { a, c } = seed(store);
    const exact = store.byFile({ file: "src/auth.ts", project: "p" });
    expect(exact.items.map((m) => m.id)).toEqual([a.id]);

    const shared = store.byFile({ file: "src/index.ts", project: "p" });
    expect(shared.items.map((m) => m.id)).toEqual([a.id]); // project q's row must not leak in

    const allProjects = store.byFile({ file: "src/index.ts" });
    expect(allProjects.items.map((m) => m.id).sort((x, y) => x - y)).toEqual([a.id, c.id].sort((x, y) => x - y));
    store.close();
  });

  test("a suffix match is opt-in, not default", () => {
    const store = new HubStore(":memory:");
    const { a } = seed(store);
    expect(store.byFile({ file: "index.ts", project: "p" }).items).toEqual([]);
    expect(store.byFile({ file: "index.ts", project: "p", suffix: true }).items.map((m) => m.id)).toEqual([a.id]);
    store.close();
  });

  test("file combines with a text query as a filter", () => {
    const store = new HubStore(":memory:");
    const { a } = seed(store);
    expect(store.search({ query: "auth", file: "src/auth.ts", project: "p" }).map((m) => m.id)).toEqual([a.id]);
    expect(store.search({ query: "auth", file: "src/cart.ts", project: "p" })).toEqual([]);
    store.close();
  });

  test("the MCP search tool accepts file and file_suffix", () => {
    const store = new HubStore(":memory:");
    const { a } = seed(store);
    const ctx = { store, tool: "test", cwd: process.cwd() };

    const exact = callTool("search", { file: "src/auth.ts", project: "p" }, ctx);
    expect(exact.content[0].text).toContain(`#${a.id}`);

    const noSuffix = callTool("search", { file: "index.ts", project: "p" }, ctx);
    expect(noSuffix.content[0].text).toContain("No memories touch that file.");

    const suffix = callTool("search", { file: "index.ts", file_suffix: true, project: "p" }, ctx);
    expect(suffix.content[0].text).toContain(`#${a.id}`);
    store.close();
  });
});
