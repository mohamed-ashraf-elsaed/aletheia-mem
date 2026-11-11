// T-262: a session in a git worktree files its memory under the main repository's project key by default, so a
// new worktree starts with the main project's memory. `project.worktrees` = separate (or ALETHEIA_WORKTREE_PROJECTS)
// keeps the old `<repo>/<worktree>` key. Submodules keep `<repo>/<path>` either way.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { normalizeHook } from "../src/hub/capture.mjs";
import { runHook } from "../src/hub/hooks/run.mjs";
import { projectKeyForHook } from "../src/hub/hooks/shared.mjs";
import { readSettings, writeSettings } from "../src/hub/settings.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { readWorktreeSetting, useWorktreeSetting, worktreeMode } from "../src/lib/project-key.mjs";
import { projectKeyForPath } from "../src/readmodel/project.mjs";
import { makeRepos } from "./git-repos.mjs";
import { tempDir } from "./temp-dirs.mjs";

const ENV = "ALETHEIA_WORKTREE_PROJECTS";
const savedEnv = process.env[ENV];

let repos;
beforeAll(() => {
  delete process.env[ENV];
  repos = makeRepos();
});
afterEach(() => {
  delete process.env[ENV];
  useWorktreeSetting(null);
});
afterAll(() => {
  if (savedEnv !== undefined) process.env[ENV] = savedEnv;
});

describe("worktree project key", () => {
  test("a worktree uses the main repository's key by default, in both functions", () => {
    expect(worktreeMode()).toBe("main");
    for (const dir of [repos.inner, join(repos.inner, "src", "deep"), repos.beside]) {
      expect(projectKeyForHook(dir)).toBe("shop");
      expect(projectKeyForPath(dir)).toBe("shop");
    }
    expect(projectKeyForHook(repos.shop)).toBe("shop");
    expect(projectKeyForPath(repos.shop)).toBe("shop");
  });

  test("separate keeps <repo>/<worktree>, and both functions agree", () => {
    const options = { worktrees: "separate" };
    expect(projectKeyForHook(repos.inner, options)).toBe("shop/feature-abc123");
    expect(projectKeyForPath(repos.inner, options)).toBe("shop/feature-abc123");
    expect(projectKeyForHook(repos.beside, options)).toBe("shop/shop-hotfix");
    expect(projectKeyForPath(repos.beside, options)).toBe("shop/shop-hotfix");
    process.env[ENV] = "separate";
    expect(worktreeMode()).toBe("separate");
    expect(projectKeyForHook(join(repos.inner, "src", "deep"))).toBe("shop/feature-abc123");
    expect(projectKeyForPath(join(repos.inner, "src", "deep"))).toBe("shop/feature-abc123");
  });

  test("a submodule keeps <repo>/<path> in both modes", () => {
    for (const worktrees of ["main", "separate"]) {
      expect(projectKeyForHook(repos.submodule, { worktrees })).toBe("shop/vendor/lib");
      expect(projectKeyForPath(repos.submodule, { worktrees })).toBe("shop/vendor/lib");
    }
  });

  test("the env var wins over the stored setting; an unknown value is ignored", () => {
    useWorktreeSetting(() => "separate");
    expect(worktreeMode()).toBe("separate");
    process.env[ENV] = "main";
    expect(worktreeMode()).toBe("main");
    process.env[ENV] = "sideways";
    expect(worktreeMode()).toBe("separate");
    useWorktreeSetting(() => { throw new Error("closed store"); });
    expect(worktreeMode()).toBe("main");
  });
});

describe("project.worktrees setting", () => {
  test("is an editable enum with main as the default, and the hook reader sees what the UI saved", () => {
    const dir = tempDir("aletheia-worktree-setting-");
    const path = join(dir, "hub.db");
    expect(readWorktreeSetting(path)).toBeNull();
    const store = new HubStore(path);
    const spec = readSettings(store).find((s) => s.key === "project.worktrees");
    expect(spec).toMatchObject({ kind: "enum", options: ["main", "separate"], value: "main" });
    expect(readWorktreeSetting(path)).toBeNull();
    expect(writeSettings(store, { "project.worktrees": "sometimes" }).errors.length).toBe(1);
    expect(writeSettings(store, { "project.worktrees": "separate" }).saved).toEqual(["project.worktrees"]);
    store.close();
    expect(readWorktreeSetting(path)).toBe("separate");
  });
});

describe("hooks in a worktree", () => {
  const hook = (event, payload, config) => runHook({ tool: "claude-code", event, stdin: JSON.stringify({ hook_event_name: event, session_id: "s1", ...payload }), config });
  const setup = () => {
    const dataDir = tempDir("aletheia-worktree-hub-");
    return { hubDb: join(dataDir, "hub.db"), dataDir };
  };

  test("a prompt from a worktree is stored under the main project", async () => {
    const config = setup();
    await hook("UserPromptSubmit", { prompt: "fix the checkout total rounding", cwd: repos.inner }, config);
    const store = new HubStore(config.hubDb);
    expect(store.projects().map((p) => p.name)).toEqual(["shop"]);
    store.close();
  });

  test("with project.worktrees = separate the prompt is stored under <repo>/<worktree>, and the mode does not leak", async () => {
    const config = setup();
    const store = new HubStore(config.hubDb);
    writeSettings(store, { "project.worktrees": "separate" });
    store.close();
    await hook("UserPromptSubmit", { prompt: "fix the checkout total rounding", cwd: repos.inner }, config);
    const after = new HubStore(config.hubDb);
    expect(after.projects().map((p) => p.name)).toEqual(["shop/feature-abc123"]);
    after.close();
    expect(worktreeMode()).toBe("main");
    expect(projectKeyForHook(repos.inner)).toBe("shop");
  });

  test("a submodule session is stored under <repo>/<path>", async () => {
    const config = setup();
    await hook("UserPromptSubmit", { prompt: "bump the vendored lib", cwd: repos.submodule }, config);
    const store = new HubStore(config.hubDb);
    expect(store.projects().map((p) => p.name)).toEqual(["shop/vendor/lib"]);
    store.close();
  });

  test("session-start context for a worktree session includes the main project's memories", async () => {
    const config = setup();
    const store = new HubStore(config.hubDb);
    store.add({ project: "shop", title: "Checkout totals round half-even", narrative: "decided in the main checkout", type: "decision", tool: "claude-code" });
    store.add({ project: "other", title: "Unrelated memory", narrative: "x", tool: "claude-code" });
    store.close();
    const result = await hook("SessionStart", { source: "startup", cwd: repos.inner }, config);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    expect(context).toContain("Memory for shop");
    expect(context).toContain("Checkout totals round half-even");
    expect(context).not.toContain("Unrelated memory");
  });

  test("REST capture follows the hub's stored setting", () => {
    const store = new HubStore(":memory:");
    useWorktreeSetting(() => store.setting("ui.settings.project.worktrees", null));
    expect(normalizeHook({ prompt: "from the api", cwd: repos.inner }, { tool: "api" }).project).toBe("shop");
    writeSettings(store, { "project.worktrees": "separate" });
    expect(normalizeHook({ prompt: "from the api", cwd: repos.inner }, { tool: "api" }).project).toBe("shop/feature-abc123");
    store.close();
  });
});
