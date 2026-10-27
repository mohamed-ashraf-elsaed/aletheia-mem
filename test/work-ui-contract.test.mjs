// T-147: the Work tab contract. The served page and every Work/tab module must be free of the old viewer's
// name, star count and repository URL. The one allowed mention is the optional Tools link required by the task.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { workEmptyView, workHeaderView, goalView, sessionCardView, sessionDetailView, workNeedsView } from "../public/work-view.js";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const publicDir = join(root, "public");
const forbidden = ["claude-mem", "103.3K", "github.com/thedotmack"];
const classicLink = "Classic claude-mem viewer (reads ~/.claude-mem, read-only)";
const fx = makeFixture();
let app;
let base;

beforeAll(() => {
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("contract-data"),
    overlayDb: join(fx.dir, "contract-overlay.db"),
    reviewDb: join(fx.dir, "contract-review.db"),
    ledgerDir: fx.makeDir("contract-ledger"),
    humanCopyCache: join(fx.dir, "contract-human.json"),
    rulesFile: join(fx.dir, "CONTRACT-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CONTRACT-CLAUDE.md"),
    hubDb: join(fx.dir, "contract.db"),
    provider: "none",
    extra: { home: fx.makeDir("contract-home") },
  });
  app = startServer(cfg);
  base = `http://127.0.0.1:${app.server.port}`;
});
afterAll(() => app.stop());

const read = (path) => readFileSync(path, "utf8");
const clean = (source) => forbidden.every((token) => !source.includes(token));

describe("T-147: the Work UI contract", () => {
  test("the served / page has no old-viewer name, star count, repository URL or iframe", async () => {
    const response = await fetch(`${base}/`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(clean(html)).toBe(true);
    expect(html).toContain('id="ui-work"');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("work.html");
  });

  test("every Work module is clean; Tools and Memory keep only their named legacy features", () => {
    // Two tabs are allowed to name the old product, and neither is the default Work tab:
    // - tools.js has the required "Classic ... viewer" link;
    // - memory.js has the existing import-from-the-old-database form and its API route.
    const exceptions = new Set(["tools.js", "memory.js"]);
    for (const name of readdirSync(join(publicDir, "tabs"))) {
      if (!name.endsWith(".js") || exceptions.has(name)) continue;
      expect({ name, clean: clean(read(join(publicDir, "tabs", name))) }).toEqual({ name, clean: true });
    }
    const memory = read(join(publicDir, "tabs", "memory.js"));
    for (const line of memory.split("\n").filter((text) => text.includes("claude-mem"))) {
      expect({ line, importFeature: /import|claudePath|claudeMem/i.test(line) }).toEqual({ line, importFeature: true });
    }
    for (const name of readdirSync(publicDir).filter((file) => file.startsWith("work-") && file.endsWith(".js"))) {
      expect({ name, clean: clean(read(join(publicDir, name))) }).toEqual({ name, clean: true });
    }
    expect(clean(read(join(publicDir, "one-ui.js")))).toBe(true);
    expect(clean(read(join(publicDir, "ui-core.js")))).toBe(true);
    expect(clean(read(join(publicDir, "index.html")))).toBe(true);

    const tools = read(join(publicDir, "tabs", "tools.js"));
    expect(tools).toContain(classicLink);
    expect(tools.replace(classicLink, "")).not.toContain("claude-mem");
    expect(tools).not.toContain("103.3K");
    expect(tools).not.toContain("github.com/thedotmack");
  });

  test("the classic viewer page still exists for the optional Tools link", async () => {
    const response = await fetch(`${base}/work-view/work.html`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("/work-view/assets/");
  });

  test("every Work view has an empty-state shape, not a fabricated row", () => {
    const header = workHeaderView({});
    expect(header).toMatchObject({ sessions: 0, facts: 0, review: 0, pinned: 0, empty: false });
    expect(header.lastCapture).toBe("never");
    expect(workEmptyView({ project: "shop" }).command).toBe("aletheia install claude-code --write");
    expect(workNeedsView({})).toEqual([]);
    expect(sessionCardView({ id: "s1", project: "shop" })).toMatchObject({ id: "s1", stateLabel: "Finished", promptLabel: "0 prompts" });
    const session = sessionDetailView({ id: "s1", project: "shop" });
    expect(session.timeline).toEqual([]);
    expect(session.facts).toEqual([]);
    expect(session.summary).toBe("No summary yet.");
    expect(goalView({ id: "0123456789abcdef", label: "A goal", count: 0, sessionCount: 0 })).toMatchObject({ countLabel: "0 quotes", sessionLabel: "0 sessions" });
  });

  test("the docs describe the new Work view, not the old default", () => {
    const readme = read(join(root, "README.md"));
    expect(readme).toContain("Aletheia's own view");
    expect(readme).not.toContain("The UI is the original's built app");
    expect(readme).not.toContain("the original's built My Work app");
    // These two documents are kept only on the maintainers' machines.
    if (existsSync(join(root, "docs", "26-memory-pipeline.md"))) {
      const pipeline = read(join(root, "docs", "26-memory-pipeline.md"));
      expect(pipeline).toContain("`/v1/work`");
      expect(pipeline).toContain("The old viewer remains at `/work-view/work.html`");
    }
    if (existsSync(join(root, "docs", "manual-test.md"))) {
      const manual = read(join(root, "docs", "manual-test.md"));
      expect(manual).toContain("Work view steps");
      expect(manual).toContain("RUN BY AUTHOR");
    }
  });

  test("an empty hub through /v1/work is empty", async () => {
    const data = await (await fetch(`${base}/v1/work`)).json();
    expect(data.empty).toBe(true);
    expect(data.sessions).toEqual([]);
    expect(data.recentFacts).toEqual([]);
    expect(data.review.pending).toBe(0);
    expect(data.queue.depth).toBe(0);
    expect(data.lastCapture).toEqual([]);
  });
});
