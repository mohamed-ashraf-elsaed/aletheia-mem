// provider presets and the ordered fallback chain. A local test server plays each failure type; no
// model and no external network is touched. The chain is capped at one in-flight request by default.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.mjs";
import { createFallbackProvider, isRetryableProviderError, makeProvider, parseProviderList, PRESET_NAMES, providerSpecs } from "../src/refresh/providers.mjs";

const answer = JSON.stringify({ choices: [{ message: { content: "ok-answer" } }] });
let server;
let base;
const hits = [];
const flaky = new Map();
let waitInFlight = 0;
let waitMax = 0;
let waitReset = () => {};

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      hits.push(path);
      if (path.startsWith("/wait")) {
        waitInFlight++;
        waitMax = Math.max(waitMax, waitInFlight);
        waitReset = () => { waitInFlight = 0; waitMax = 0; };
        try {
          await Bun.sleep(120);
          return new Response(answer, { headers: { "content-type": "application/json" } });
        } finally {
          waitInFlight--;
        }
      }
      if (path.startsWith("/flaky")) {
        const seen = (flaky.get(path) ?? 0) + 1;
        flaky.set(path, seen);
        if (seen === 1) return new Response("quota exhausted", { status: 429 });
      }
      if (path.startsWith("/quota")) return new Response("quota exhausted", { status: 429 });
      if (path.startsWith("/down")) return new Response("bad gateway", { status: 503 });
      if (path.startsWith("/bad")) return new Response("bad request", { status: 400 });
      if (path.startsWith("/slow")) {
        await Bun.sleep(300);
        return new Response(answer, { headers: { "content-type": "application/json" } });
      }
      return new Response(answer, { headers: { "content-type": "application/json" } });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => server.stop(true));

const spec = (name, path, extra = {}) => ({ name, kind: "local", url: `${base}${path}`, models: { extract: "small", summary: "large" }, ...extra });

describe("presets and chain parsing", () => {
  test("the named presets exist for every local server and the remote endpoints", () => {
    for (const name of ["ollama", "lmstudio", "llamacpp", "openrouter", "openai", "claude-cli", "anthropic-compatible"]) expect(PRESET_NAMES).toContain(name);
    expect(parseProviderList(" ollama, OpenRouter ,, openai ")).toEqual(["ollama", "openrouter", "openai"]);
    expect(parseProviderList("")).toEqual([]);
    expect(() => providerSpecs(["nope"], {})).toThrow(/Unknown provider preset/);
    expect(() => providerSpecs(["ollama"], { openai: {} })).toThrow(/needs a model/);
    expect(() => providerSpecs(["openrouter"], { openai: { model: "m", apiKey: "" } })).toThrow(/ALETHEIA_OPENAI_API_KEY/);
    expect(() => providerSpecs(["anthropic-compatible"], { openai: { model: "m", apiKey: "k" }, anthropicBaseUrl: "" })).toThrow(/ALETHEIA_ANTHROPIC_BASE_URL/);
    const specs = providerSpecs(["ollama", "openrouter"], { openai: { model: "m", apiKey: "k" } });
    expect(specs.map((s) => [s.name, s.kind, s.url])).toEqual([
      ["ollama", "local", "http://127.0.0.1:11434/v1/chat/completions"],
      ["openrouter", "openrouter", "https://openrouter.ai/api/v1/chat/completions"],
    ]);
    const config = loadConfig({ providers: ["lmstudio", "llamacpp"], extractModel: "m" });
    expect(config.providers).toEqual(["lmstudio", "llamacpp"]);
    expect(makeProvider({ ...config, provider: "none" }).kind).toBe("chain");
  });

  test("the classification keeps a client error out of the fallback path", () => {
    expect(isRetryableProviderError(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error("x"), { status: 503 }))).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error("x"), { status: 400 }))).toBe(false);
    expect(isRetryableProviderError(Object.assign(new Error("quota exhausted"), { status: 429 }))).toBe(true);
    expect(isRetryableProviderError(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe(true);
    expect(isRetryableProviderError(new Error("socket hang up"))).toBe(false);
  });
});

describe("fallback on each failure type", () => {
  test("a quota (429) moves to the next provider", async () => {
    hits.length = 0;
    const ask = createFallbackProvider({ specs: [spec("first", "/quota-1"), spec("second", "/ok-1")] });
    expect(await ask("prompt")).toBe("ok-answer");
    expect(hits).toEqual(["/quota-1", "/ok-1"]);
    expect(ask.lastUsed).toBe("second");
    expect(ask.stats()).toMatchObject({ calls: 1, fallbacks: 1, providers: 2 });
  });

  test("a 5xx moves to the next provider", async () => {
    hits.length = 0;
    const ask = createFallbackProvider({ specs: [spec("first", "/down-1"), spec("second", "/ok-2")] });
    expect(await ask("prompt")).toBe("ok-answer");
    expect(hits).toEqual(["/down-1", "/ok-2"]);
  });

  test("a timeout moves to the next provider", async () => {
    hits.length = 0;
    const ask = createFallbackProvider({ specs: [spec("slow", "/slow-1", { timeoutMs: 50 }), spec("second", "/ok-3")] });
    expect(await ask("prompt")).toBe("ok-answer");
    expect(hits).toEqual(["/slow-1", "/ok-3"]);
  });

  test("a 400 is surfaced and the next provider is not tried", async () => {
    hits.length = 0;
    const ask = createFallbackProvider({ specs: [spec("first", "/bad-1"), spec("second", "/ok-4")] });
    await expect(ask("prompt")).rejects.toThrow(/returned 400/);
    expect(hits).toEqual(["/bad-1"]);
  });
});

describe("cool-down", () => {
  test("a failed provider is skipped until its cool-down ends", async () => {
    hits.length = 0;
    let clock = 1_000_000;
    const ask = createFallbackProvider({ specs: [spec("first", "/flaky-1"), spec("second", "/ok-5")], cooldownMs: 60_000, now: () => clock });
    expect(await ask("one")).toBe("ok-answer");
    expect(hits.filter((path) => path === "/flaky-1").length).toBe(1);
    clock += 5_000;
    expect(await ask("two")).toBe("ok-answer");
    expect(hits.filter((path) => path === "/flaky-1").length).toBe(1); // still cooling down
    expect(ask.cooldowns()).toHaveProperty("first");
    clock += 60_000;
    expect(await ask("three")).toBe("ok-answer");
    expect(hits.filter((path) => path === "/flaky-1").length).toBe(2); // the cool-down ended and the provider recovered
    expect(ask.cooldowns()).toEqual({});
  });

  test("when every provider is cooling down the error says so instead of guessing", async () => {
    let clock = 2_000_000;
    const ask = createFallbackProvider({ specs: [spec("first", "/quota-3")], cooldownMs: 60_000, now: () => clock });
    await expect(ask("one")).rejects.toThrow(/All providers failed/);
    clock += 1_000;
    await expect(ask("two")).rejects.toThrow(/cooling down/);
  });
});

describe("concurrency cap", () => {
  test("one in-flight request by default and two when asked for", async () => {
    await Bun.sleep(350); // let the aborted /slow handler finish before measuring
    waitReset();
    const one = createFallbackProvider({ specs: [spec("only", "/wait-1")], maxConcurrent: 1 });
    await Promise.all([one("a"), one("b"), one("c")]);
    expect(waitMax).toBe(1);

    waitReset();
    const two = createFallbackProvider({ specs: [spec("only", "/wait-2")], maxConcurrent: 2 });
    await Promise.all([two("a"), two("b")]);
    expect(waitMax).toBe(2);
  });
});
