// folder context files. The generated text sits in a managed block; user text outside it is preserved;
// a folder with no memories is never written; and the feature is opt-in per project.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { applyFolderBlock, generateFolderContexts, renderFolderContextBlock, setFolderContextEnabled, writeFolderContexts } from "../src/hub/folder-context.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(() => cleanupTempDirs());

describe("folder context", () => {
  test("applyFolderBlock updates the block in place and keeps user text outside it", () => {
    const before = "# My notes\n\npersonal text\n\n<!-- aletheia:folder-context:begin -->\nstale\n<!-- aletheia:folder-context:end -->\n\ntrailing\n";
    const after = applyFolderBlock(before, "new block");
    expect(after).toContain("# My notes");
    expect(after).toContain("personal text");
    expect(after).toContain("new block");
    expect(after).not.toContain("stale");
    expect(after).toContain("trailing");
  });

  test("renderFolderContextBlock folds purpose, recent decisions and gotchas", () => {
    const markdown = renderFolderContextBlock([
      { path: "src/x.ts", type: "summary", title: "ignored", narrative: "the auth module", atEpoch: 3 },
      { path: "src/x.ts", type: "decision", title: "use bcrypt", atEpoch: 2 },
      { path: "src/x.ts", type: "gotcha", title: "never log tokens", atEpoch: 1 },
    ]);
    expect(markdown).toContain("the auth module");
    expect(markdown).toContain("use bcrypt");
    expect(markdown).toContain("never log tokens");
  });

  test("only folders with memories are written, and only after the project opts in", () => {
    const dir = tempDir("folder-context-");
    const store = new HubStore(":memory:");
    store.add({ project: "p", type: "decision", title: "use bcrypt", files: ["src/auth.ts"] });
    store.add({ project: "p", type: "gotcha", title: "never log tokens", files: ["src/auth.ts"] });

    const skipped = writeFolderContexts(store, { project: "p", baseDir: dir });
    expect(skipped.skipped).toBe(true);
    expect(existsSync(join(dir, "src", "CLAUDE.md"))).toBe(false);

    setFolderContextEnabled(store, "p", true);
    const result = writeFolderContexts(store, { project: "p", baseDir: dir });
    expect(result.skipped).toBe(false);
    expect(result.files.map((file) => file.folder)).toEqual(["src"]);
    expect(existsSync(join(dir, "src", "CLAUDE.md"))).toBe(true);
    const text = readFileSync(join(dir, "src", "CLAUDE.md"), "utf8");
    expect(text).toContain("use bcrypt");
    expect(text).toContain("never log tokens");
    store.close();
  });

  test("generateFolderContexts groups by directory and skips folders without memories", () => {
    const store = new HubStore(":memory:");
    store.add({ project: "p", type: "note", title: "auth note", files: ["src/auth.ts"] });
    store.add({ project: "p", type: "note", title: "api note", files: ["api/server.ts"] });
    const contexts = generateFolderContexts(store, { project: "p" });
    expect(contexts.map((context) => context.folder).sort()).toEqual(["api", "src"]);
    expect(contexts.find((context) => context.folder === "src").count).toBe(1);
    store.close();
  });
});
