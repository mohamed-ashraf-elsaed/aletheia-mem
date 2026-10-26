// T-120: output language. The tag is validated when it is set, stored per project, and added to the extraction
// prompt as OUTPUT_LANGUAGE. Summaries are built from the facts, so they follow the same language.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFactsWithProvider, factsPrompt, validateFacts } from "../src/hub/facts.mjs";
import { languageInstruction, normalizeLanguage } from "../src/hub/language.mjs";
import { executeJob, enqueueJob, JOB_TYPE } from "../src/hub/queue.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { buildProjectSummary } from "../src/hub/summaries.mjs";

const root = join(import.meta.dir, "..");
const temp = mkdtempSync(join(tmpdir(), "aletheia-language-"));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe("T-120: output language", () => {
  test("language tags are validated and normalised", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("ES")).toBe("es");
    expect(normalizeLanguage("pt_BR")).toBe("pt-br");
    expect(normalizeLanguage("zh-Hans")).toBe("zh-hans");
    expect(normalizeLanguage("")).toBe("");
    for (const bad of ["klingon!", "e", "a".repeat(40), "en us", "<script>"]) expect(() => normalizeLanguage(bad)).toThrow(/language tag/);
    expect(languageInstruction("es")).toContain("OUTPUT_LANGUAGE: es");
    expect(languageInstruction("")).toBe("");
  });

  test("the setting is stored per project, with the global value as fallback", () => {
    const store = new HubStore(":memory:");
    expect(store.outputLanguage("shop", "en")).toBe("en");
    store.setOutputLanguage("shop", "es", { actor: "test" });
    store.setOutputLanguage("docs", "pt-BR", { actor: "test" });
    expect(store.outputLanguage("shop", "en")).toBe("es");
    expect(store.outputLanguage("docs", "en")).toBe("pt-br");
    expect(store.outputLanguage("other", "en")).toBe("en");
    expect(store.outputLanguageMap()).toEqual({ shop: "es", docs: "pt-br" });
    expect(store.setOutputLanguage("shop", "", { actor: "test" })).toEqual({ project: "shop", language: "" });
    expect(store.outputLanguage("shop", "en")).toBe("en");
    expect(() => store.setOutputLanguage("shop", "not a tag")).toThrow(/language tag/);
    store.close();
  });

  test("the prompt carries the language only when one is set", async () => {
    const window = [{ episodeId: 7, text: "The checkout uses Postgres." }];
    const without = factsPrompt({ window, project: "shop" });
    expect(without).not.toContain("OUTPUT_LANGUAGE");
    const withLanguage = factsPrompt({ window, project: "shop", outputLanguage: "es" });
    expect(withLanguage).toContain("OUTPUT_LANGUAGE: es");
    expect(withLanguage).toContain("Write every fact and summary in this language");

    let seen = "";
    const ask = async (prompt) => {
      seen = prompt;
      return JSON.stringify({ facts: [{ subject: "checkout", predicate: "usa", object: "Postgres", text: "El checkout usa Postgres", confidence: 0.9, episode_ids: [7] }] });
    };
    const result = await extractFactsWithProvider({ window, project: "shop", ask, outputLanguage: "es" });
    expect(seen).toContain("OUTPUT_LANGUAGE: es");
    expect(result.facts[0].text).toBe("El checkout usa Postgres");
    expect(() => validateFacts({ facts: [{ subject: "x", predicate: "y", object: "z", text: "El checkout usa Postgres", confidence: 0.9, episode_ids: [7] }] }, { episodeIds: [7] })).not.toThrow();
  });

  test("the worker resolves the project language and the summary follows the facts", async () => {
    const store = new HubStore(":memory:");
    store.add({ project: "shop", kind: "prompt", title: "checkout", narrative: "The checkout uses Postgres.", tool: "claude-code", sessionId: "s1" });
    store.setOutputLanguage("shop", "es", { actor: "test" });
    const { id } = enqueueJob(store, JOB_TYPE, { project: "shop", sessionId: "s1" });
    const job = store.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    let seen = "";
    const ask = async (prompt) => {
      seen = prompt;
      const episodeId = Number(/EPISODE_IDS: \[(\d+)\]/.exec(prompt)?.[1]);
      return JSON.stringify({ facts: [{ subject: "checkout", predicate: "usa", object: "Postgres", text: "El checkout usa Postgres", confidence: 0.9, episode_ids: [episodeId] }] });
    };
    const result = await executeJob(store, job, { ask, config: { mode: "code", factBudget: { maxEpisodes: 5, maxChars: 2000 } } });
    expect(seen).toContain("OUTPUT_LANGUAGE: es");
    expect(result.language).toBe("es");
    expect(result.facts).toBe(1);
    const summary = buildProjectSummary(store, { project: "shop" });
    expect(summary).toBeTruthy();
    expect(summary.summary.text).toContain("El checkout usa Postgres");
    store.close();
  });

  test("the CLI sets and lists the setting for a project", async () => {
    const db = join(temp, "language.db");
    const env = { ...process.env, HOME: temp, ALETHEIA_DATA_DIR: temp, ALETHEIA_HUB_DB: db };
    const run = async (args) => {
      const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env });
      const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      return { stdout, stderr, exitCode };
    };
    expect((await run(["language", "set", "pt-BR", "--project", "shop"])).stdout).toContain("Output language for shop: pt-br");
    expect((await run(["language"])).stdout).toContain("shop");
    expect((await run(["language", "set", "", "--project", "shop"])).stdout).toContain("Cleared");
  });
});
