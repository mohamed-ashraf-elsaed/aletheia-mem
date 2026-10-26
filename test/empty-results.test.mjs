// An empty search says why it is empty, in the store, the MCP text response and (as a field) the HTTP response.
import { describe, expect, test } from "bun:test";
import { callTool } from "../src/hub/mcp.mjs";
import { HubStore } from "../src/hub/store.mjs";

describe("empty search results", () => {
  test("no searchable terms says no_terms", () => {
    const store = new HubStore(":memory:");
    try {
      const result = store.searchDetailed({ query: "***" });
      expect(result.items).toEqual([]);
      expect(result.reason).toBe("no_terms");
    } finally {
      store.close();
    }
  });

  test("an empty store with a real query says no_rows", () => {
    const store = new HubStore(":memory:");
    try {
      const result = store.searchDetailed({ query: "checkout retry" });
      expect(result.items).toEqual([]);
      expect(result.reason).toBe("no_rows");
    } finally {
      store.close();
    }
  });

  test("a project filter that excludes all says filtered", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "note", type: "note", title: "Checkout retry", narrative: "Retry uses backoff" });
      const wrongProject = store.searchDetailed({ query: "checkout", project: "docs" });
      expect(wrongProject.items).toEqual([]);
      expect(wrongProject.reason).toBe("filtered");
      const noMatch = store.searchDetailed({ query: "zzzz" });
      expect(noMatch.reason).toBe("filtered");
      const hit = store.searchDetailed({ query: "checkout" });
      expect(hit.items.length).toBe(1);
      expect(hit.reason).toBe(null);
    } finally {
      store.close();
    }
  });

  test("the MCP text response carries the reason", () => {
    const store = new HubStore(":memory:");
    try {
      const empty = callTool("search", { query: "anything" }, { store });
      expect(empty.isError).toBeUndefined();
      expect(empty.content[0].text).toContain("No matches.");
      expect(empty.content[0].text).toContain("no memories");
      store.add({ project: "shop", kind: "note", type: "note", title: "Checkout retry", narrative: "Retry uses backoff" });
      const filtered = callTool("search", { query: "checkout", project: "docs" }, { store });
      expect(filtered.content[0].text).toContain("excluded all of them");
      const noTerms = callTool("search", { query: "***" }, { store });
      expect(noTerms.content[0].text).toContain("no searchable words");
    } finally {
      store.close();
    }
  });
});
