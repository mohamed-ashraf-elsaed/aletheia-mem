// Excluded projects store nothing, and context scope separates the current project from all projects.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { isProjectExcluded, normalizeHook, parseExcluded } from "../src/hub/capture.mjs";
import { runHook } from "../src/hub/hooks/run.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { removeDir } from "./temp-dirs.mjs";

const dirs = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "aletheia-excluded-"));
  dirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of dirs) {
    try { removeDir(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("excluded projects", () => {
  test("the list parses and matches case-insensitively", () => {
    expect(parseExcluded("Shop, docs ,, *")).toEqual(["shop", "docs", "*"]);
    expect(isProjectExcluded("Shop", ["shop"])).toBe(true);
    expect(isProjectExcluded("docs", "shop,docs")).toBe(true);
    expect(isProjectExcluded("other", ["shop"])).toBe(false);
    expect(isProjectExcluded(undefined, ["shop"])).toBe(false);
  });

  test("normalizeHook refuses an excluded project before building a memory", () => {
    const payload = { hook_event_name: "UserPromptSubmit", prompt: "Remember the auth secret", cwd: "/tmp/shop" };
    expect(normalizeHook(payload, { tool: "claude-code", project: "shop", excluded: ["shop"] })).toBe(null);
    expect(normalizeHook(payload, { tool: "claude-code", project: "other", excluded: ["shop"] })).not.toBe(null);
  });

  test("the hook writes no memory and no episode for an excluded project and says why", async () => {
    const root = tmp();
    const home = join(root, "home");
    const dataDir = join(root, "data");
    const projectDir = join(root, "secret-project");
    mkdirSync(home, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    const config = loadConfig({ dataDir, home, hubDb: join(dataDir, "hub.db"), excludedProjects: ["secret-project"], provider: "none", extra: { home } });
    const stdin = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Do not remember this", cwd: projectDir, session_id: "s1" });
    const result = await runHook({ tool: "claude-code", event: "UserPromptSubmit", stdin, config, dataDir });
    expect(result.exitCode).toBe(0);
    expect(result.reason).toBe("excluded_project");
    expect(result.project).toBe("secret-project");
    expect(result.stored).toBe(false);
    const store = new HubStore(config.hubDb);
    try {
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n).toBe(0);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes").get().n).toBe(0);
      expect(store.setting("compress.queue", [])).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  test("config reads ALETHEIA_EXCLUDED_PROJECTS", () => {
    const before = process.env.ALETHEIA_EXCLUDED_PROJECTS;
    process.env.ALETHEIA_EXCLUDED_PROJECTS = "shop, docs";
    try {
      expect(loadConfig({ extra: { home: "/tmp" } }).excludedProjects).toEqual(["shop", "docs"]);
    } finally {
      if (before === undefined) delete process.env.ALETHEIA_EXCLUDED_PROJECTS;
      else process.env.ALETHEIA_EXCLUDED_PROJECTS = before;
    }
  });

  test("context scope=current is the default and scope=all includes other projects", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "alpha", kind: "note", type: "note", title: "Alpha note", narrative: "Alpha detail" });
      store.add({ project: "beta", kind: "note", type: "note", title: "Beta note", narrative: "Beta detail" });
      const current = store.context({ project: "alpha" });
      expect(current).toContain("Alpha note");
      expect(current).not.toContain("Beta note");
      const all = store.context({ project: "alpha", scope: "all" });
      expect(all).toContain("Alpha note");
      expect(all).toContain("Beta note");
      expect(all).toContain("all projects");
    } finally {
      store.close();
    }
  });
});
