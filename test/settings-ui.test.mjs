// settings are persisted in the hub settings table (so they survive a reopen), invalid values are rejected,
// and secrets are masked on read and only replaced with a non-empty value. The view renders fields and saves over
// PUT /api/hub/settings. Retargeted to the public/ SPA.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { readSettings, validateSetting, writeSettings } from "../src/hub/settings.mjs";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

let dom;
let S;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 5; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });

afterAll(() => cleanupTempDirs());

describe("settings store", () => {
  test("write then read round-trips and survives a reopen", () => {
    const dir = tempDir("settings-");
    const store = new HubStore(join(dir, "hub.db"));
    const result = writeSettings(store, { "facts.minConfidence": 0.6, "context.facts": "on", "rules.reviewDays": 30 });
    expect(result.errors).toEqual([]);
    expect([...result.saved].sort()).toEqual(["context.facts", "facts.minConfidence", "rules.reviewDays"]);
    store.close();

    const reopened = new HubStore(join(dir, "hub.db"));
    const settings = readSettings(reopened);
    expect(settings.find((s) => s.key === "facts.minConfidence").value).toBe(0.6);
    expect(settings.find((s) => s.key === "context.facts").value).toBe("on");
    expect(settings.find((s) => s.key === "rules.reviewDays").value).toBe(30);
    reopened.close();
  });

  test("an invalid value is rejected with a message", () => {
    const store = new HubStore(":memory:");
    const result = writeSettings(store, { "rules.reviewDays": 0 });
    expect(result.saved).toEqual([]);
    expect(result.errors[0].error).toMatch(/between 7 and 730/);
    expect(validateSetting("context.facts", 5).ok).toBe(false);
    store.close();
  });

  test("the fact confidence floor is a ranged number setting", () => {
    const store = new HubStore(":memory:");
    expect(validateSetting("facts.minConfidence", 0.4).ok).toBe(true);
    expect(validateSetting("facts.minConfidence", 0.2).ok).toBe(false);
    expect(validateSetting("facts.minConfidence", 1).ok).toBe(false);
    const result = writeSettings(store, { "facts.minConfidence": 0.6 });
    expect(result.errors).toEqual([]);
    expect(readSettings(store).find((s) => s.key === "facts.minConfidence").value).toBe(0.6);
    store.close();
  });

  test("context.facts is an enum with a default of auto", () => {
    const store = new HubStore(":memory:");
    expect(validateSetting("context.facts", "auto").ok).toBe(true);
    expect(validateSetting("context.facts", "on").ok).toBe(true);
    expect(validateSetting("context.facts", "off").ok).toBe(true);
    expect(validateSetting("context.facts", "sometimes").ok).toBe(false);
    expect(readSettings(store).find((s) => s.key === "context.facts").value).toBe("auto");
    const result = writeSettings(store, { "context.facts": "off" });
    expect(result.errors).toEqual([]);
    expect(readSettings(store).find((s) => s.key === "context.facts").value).toBe("off");
    store.close();
  });

  test("only settings that backend code reads are listed", () => {
    const keys = readSettings(new HubStore(":memory:")).map((spec) => spec.key).sort();
    expect(keys).toEqual(["context.facts", "facts.minConfidence", "rules.reviewDays"]);
    for (const gone of ["provider", "providers", "factBudget.maxEpisodes", "factBudget.maxChars", "redaction", "excludedProjects", "apiKey"]) {
      expect(validateSetting(gone, "x").ok).toBe(false);
    }
  });
});

describe("settings view", () => {
  beforeEach(() => { dom = installFakeDom(); });
  afterAll(() => restoreGlobals());

  test("renders the editable fields and saves them over PUT", async () => {
    S ??= await import("../public/tabs/settings.js");
    const calls = [];
    globalThis.fetch = async (path, init = {}) => {
      const record = { path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(record);
      if (path === "/api/hub/settings" && record.method === "GET") return json({ settings: [{ key: "context.facts", label: "Facts in context", kind: "enum", options: ["auto", "on", "off"], secret: false, value: "auto" }, { key: "rules.reviewDays", label: "Rule review window (days)", kind: "int", secret: false, value: 90 }] });
      if (path === "/api/hub/settings" && record.method === "PUT") return json({ settings: [], saved: ["context.facts", "rules.reviewDays"] });
      return json({ error: `unrouted ${path}` }, 404);
    };
    const view = S.settingsView();
    await flush();
    expect(view.textContent).toContain("Facts in context");
    expect(view.textContent).toContain("environment variables");
    expect(view.querySelectorAll("input").some((input) => input.getAttribute("type") === "password")).toBe(false);

    const save = view.querySelectorAll("button").find((button) => button.textContent.trim() === "Save");
    save.click();
    await flush();
    const put = calls.find((call) => call.method === "PUT");
    expect(put).toBeTruthy();
    expect(put.body).toMatchObject({ "context.facts": "auto", "rules.reviewDays": 90 });
  });
});
