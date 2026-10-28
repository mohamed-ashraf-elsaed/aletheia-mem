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
    const result = writeSettings(store, { provider: "openai", "factBudget.maxEpisodes": 50, excludedProjects: ["a", "b"] });
    expect(result.errors).toEqual([]);
    expect([...result.saved].sort()).toEqual(["provider", "factBudget.maxEpisodes", "excludedProjects"].sort());
    store.close();

    const reopened = new HubStore(join(dir, "hub.db"));
    const settings = readSettings(reopened);
    expect(settings.find((s) => s.key === "provider").value).toBe("openai");
    expect(settings.find((s) => s.key === "factBudget.maxEpisodes").value).toBe(50);
    expect(settings.find((s) => s.key === "excludedProjects").value).toEqual(["a", "b"]);
    reopened.close();
  });

  test("an invalid value is rejected with a message", () => {
    const store = new HubStore(":memory:");
    const result = writeSettings(store, { "factBudget.maxEpisodes": 0 });
    expect(result.saved).toEqual([]);
    expect(result.errors[0].error).toMatch(/between 1 and 1000/);
    expect(validateSetting("provider", 5).ok).toBe(false);
    expect(validateSetting("redaction", "yes").ok).toBe(false);
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

  test("a secret is masked and only replaced with a non-empty value", () => {
    const store = new HubStore(":memory:");
    writeSettings(store, { apiKey: "sk-secret-123" });
    const apiKey = readSettings(store).find((s) => s.key === "apiKey");
    expect(apiKey.value).toBe("••••••••");
    expect(apiKey.set).toBe(true);
    expect(JSON.stringify(readSettings(store))).not.toContain("sk-secret-123");

    writeSettings(store, { apiKey: "" });
    expect(store.setting("ui.settings.apiKey")).toBe("sk-secret-123");
    store.close();
  });
});

describe("settings view", () => {
  beforeEach(() => { dom = installFakeDom(); });
  afterAll(() => restoreGlobals());

  test("renders fields, masks the API key and saves over PUT", async () => {
    S ??= await import("../public/tabs/settings.js");
    const calls = [];
    globalThis.fetch = async (path, init = {}) => {
      const record = { path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(record);
      if (path === "/api/hub/settings" && record.method === "GET") return json({ settings: [{ key: "provider", label: "Provider", kind: "string", secret: false, value: "none" }, { key: "apiKey", label: "API key", kind: "string", secret: true, value: "••••••••", set: true }] });
      if (path === "/api/hub/settings" && record.method === "PUT") return json({ settings: [], saved: ["provider"] });
      return json({ error: `unrouted ${path}` }, 404);
    };
    const view = S.settingsView();
    await flush();
    expect(view.textContent).toContain("Provider");
    expect(view.textContent).toContain("API key");
    const password = view.querySelectorAll("input").find((input) => input.getAttribute("type") === "password");
    expect(password).toBeTruthy();
    expect(password.getAttribute("placeholder")).toBe("unchanged");

    const save = view.querySelectorAll("button").find((button) => button.textContent.trim() === "Save");
    save.click();
    await flush();
    const put = calls.find((call) => call.method === "PUT");
    expect(put).toBeTruthy();
    expect(put.body).toMatchObject({ provider: "none" });
    expect(JSON.stringify(put.body)).not.toContain("apiKey");
  });
});
