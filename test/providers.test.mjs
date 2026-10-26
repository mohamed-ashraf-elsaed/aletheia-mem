// T-034: provider routing and extraction modes. `none` makes no call, a local OpenAI-compatible endpoint completes
// a fixture extraction, a mode changes the output language, and a misconfigured provider fails with a clear message.
import { describe, expect, test } from "bun:test";
import { extractFactsWithProvider, loadMode, modeInstruction, parseJsonObject, validateFacts } from "../src/hub/facts.mjs";
import { DEFAULT_LOCAL_URL, makeProvider, modelFor, openAiProvider, providerKind } from "../src/refresh/providers.mjs";

const okResponse = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }], finish_reason: "stop" }), { status: 200, headers: { "content-type": "application/json" } });

describe("provider routing", () => {
  test("none makes zero network calls", () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new Error("network must not be called");
    };
    try {
      expect(makeProvider({ provider: "none" })).toBeNull();
      expect(calls).toBe(0);
      expect(providerKind({ provider: "NONE" })).toBe("none");
    } finally {
      globalThis.fetch = original;
    }
  });

  test("a local endpoint completes a fixture extraction", async () => {
    const answer = JSON.stringify({ facts: [{ subject: "checkout", predicate: "uses", object: "Postgres", text: "The checkout uses Postgres", valid_from: null, valid_to: null, confidence: 0.9, episode_ids: [1] }] });
    let seen = null;
    const fetchImpl = async (url, init) => {
      seen = { url, body: JSON.parse(init.body), headers: init.headers };
      return okResponse(answer);
    };
    const ask = openAiProvider({ url: DEFAULT_LOCAL_URL, models: { extract: "small", summary: "large" }, fetchImpl, provider: "local", jsonMode: false });
    const text = await ask("extract facts", { stage: "extract" });
    expect(seen.url).toBe(DEFAULT_LOCAL_URL);
    expect(seen.body.model).toBe("small");
    expect(seen.body.response_format).toBeUndefined(); // a local endpoint may reject response_format
    expect(seen.headers.Authorization).toBeUndefined();
    const facts = validateFacts(parseJsonObject(text), { episodeIds: [1] });
    expect(facts[0]).toMatchObject({ subject: "checkout", episodeIds: [1] });
  });

  test("models are routed: small for extraction, larger for summaries", () => {
    const config = { provider: "openai", extractModel: "small", summaryModel: "large", openai: { model: "default", apiKey: "k" } };
    expect(modelFor(config, "extract")).toBe("small");
    expect(modelFor(config, "summary")).toBe("large");
    expect(modelFor(config, "story")).toBe("default");
    expect(modelFor({ provider: "claude-cli" }, "extract")).toBe("haiku");
    expect(modelFor({ provider: "claude-cli" }, "summary")).toBe("sonnet");
  });

  test("a fake provider answers without the network", async () => {
    const original = globalThis.fetch;
    const previous = process.env.ALETHEIA_FAKE_RESPONSE;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw new Error("network must not be called");
    };
    process.env.ALETHEIA_FAKE_RESPONSE = '{"facts":[]}';
    try {
      const ask = makeProvider({ provider: "fake" });
      expect(ask.kind).toBe("fake");
      expect(await ask("anything")).toBe('{"facts":[]}');
      expect(ask.modelFor("extract")).toBe("fake-model");
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
      if (previous === undefined) delete process.env.ALETHEIA_FAKE_RESPONSE;
      else process.env.ALETHEIA_FAKE_RESPONSE = previous;
    }
  });

  test("a misconfigured provider fails with a message that names the setting", () => {
    expect(() => makeProvider({ provider: "openai", openai: { apiKey: "", model: "" } })).toThrow(/ALETHEIA_OPENAI_MODEL or ALETHEIA_EXTRACT_MODEL/);
    expect(() => makeProvider({ provider: "openai", openai: { apiKey: "", model: "x" } })).toThrow(/ALETHEIA_OPENAI_API_KEY/);
    expect(() => makeProvider({ provider: "local", extractModel: "", openai: { model: "" } })).toThrow(/ALETHEIA_OPENAI_MODEL or ALETHEIA_EXTRACT_MODEL/);
    expect(() => makeProvider({ provider: "nope" })).toThrow(/Unknown provider/);
  });
});

describe("extraction modes", () => {
  test("the four modes load and describe their output language", () => {
    expect(loadMode("code")).toMatchObject({ id: "code", language: "en" });
    expect(loadMode("chill").style).toBe("chill");
    expect(modeInstruction("language-es")).toContain("Output language: es (Spanish)");
    expect(modeInstruction("language-es")).toContain("español");
    expect(() => loadMode("klingon")).toThrow(/Unknown extraction mode/);
    expect(() => modeInstruction("../etc/passwd")).toThrow(/Invalid extraction mode/);
  });

  test("a mode changes the output language in a fixture", async () => {
    const spanish = JSON.stringify({ facts: [{ subject: "checkout", predicate: "usa", object: "Postgres", text: "El checkout usa Postgres", valid_from: null, valid_to: null, confidence: 0.9, episode_ids: [1] }] });
    let promptSeen = "";
    const ask = async (prompt) => {
      promptSeen = prompt;
      return prompt.includes("Output language: es") ? spanish : JSON.stringify({ facts: [] });
    };
    const result = await extractFactsWithProvider({
      window: [{ episodeId: 1, text: "The checkout uses Postgres." }],
      project: "shop",
      ask,
      modeInstruction: modeInstruction("language-es"),
    });
    expect(promptSeen).toContain("MODE: language-es");
    expect(result.facts[0].text).toBe("El checkout usa Postgres");

    const english = await extractFactsWithProvider({
      window: [{ episodeId: 1, text: "The checkout uses Postgres." }],
      project: "shop",
      ask,
      modeInstruction: modeInstruction("code"),
    });
    expect(english.facts).toEqual([]);
  });

  test("an explicit answer with no output still refuses cleanly", async () => {
    const result = await extractFactsWithProvider({ window: [{ episodeId: 1, text: "x" }], project: "p", ask: async () => "no json" });
    expect(result.rejected).toBe(true);
    expect(result.error).toMatch(/JSON/);
  });
});
