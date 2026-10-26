// LLM providers. A provider is `async (prompt, { stage }) => answerText`, with `.modelFor(stage)` and `.kind`.
// The refresh gives the model its evidence inline, so any chat model works.
//   none        : no provider at all; extraction uses the rule extractor and makes zero network calls
//   local       : an OpenAI-compatible endpoint on this machine (Ollama, llama.cpp, LM Studio, ...)
//   openai      : any OpenAI-compatible endpoint with a key
//   openrouter  : OpenRouter's OpenAI-compatible endpoint
//   claude-cli  : the `claude` CLI in print mode, no tools, no user settings, not recorded by claude-mem
//   fake        : test-only canned answers, no network
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Model per stage. Extraction uses the small model; summaries use the larger one. */
export const STAGE_MODELS = {
  "claude-cli": {
    goals: "sonnet", grouping: "haiku", review: "sonnet", alignment: "haiku", story: "sonnet",
    compress: "haiku", extract: "haiku", summary: "sonnet",
  },
};

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_LOCAL_URL = "http://127.0.0.1:11434/v1/chat/completions";
export const PROVIDER_KINDS = ["none", "local", "openai", "openrouter", "claude-cli", "fake"];

export const providerKind = (config = {}) => String(config.provider ?? "none").toLowerCase();

/**
 * The model a stage should use. An explicit extract/summary model wins; otherwise the provider's default model.
 * A local provider with no model at all is a configuration error the caller reports.
 */
export function modelFor(config = {}, stage = "extract") {
  const kind = providerKind(config);
  if (kind === "claude-cli") {
    const explicit = stage === "extract" ? config.extractModel : stage === "summary" ? config.summaryModel : null;
    return explicit || STAGE_MODELS["claude-cli"][stage] || STAGE_MODELS["claude-cli"].review;
  }
  const explicit = stage === "extract" ? config.extractModel : stage === "summary" ? config.summaryModel : null;
  if (explicit) return explicit;
  if (config.openai?.model) return config.openai.model;
  if (kind === "fake") return "fake-model";
  return "";
}

function run(command, args, { input, cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done({ exitCode: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    child.stdout.setEncoding("utf8").on("data", (d) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d) => (stderr += d));
    child.on("error", (error) => done({ exitCode: null, stdout, stderr, spawnError: error }));
    child.on("close", (exitCode) => done({ exitCode, stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export function claudeCliProvider({ bin = "claude", cwd = process.cwd(), timeoutMs = 5 * 60_000, models = null } = {}) {
  const ask = async (prompt, { stage } = {}) => {
    const model = models?.[stage] || STAGE_MODELS["claude-cli"][stage];
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--tools", "", "--setting-sources", "", ...(model ? ["--model", model] : [])];
    // CLAUDE_MEM_INTERNAL=1 tells claude-mem's hooks not to record this run as user work.
    const result = await run(bin, args, { input: prompt, cwd, env: { ...process.env, CLAUDE_MEM_INTERNAL: "1" }, timeoutMs });
    if (result.spawnError) throw new Error(`\`${bin}\` could not start: ${result.spawnError.message}`);
    if (result.timedOut) throw new Error(`\`${bin}\` timed out after ${Math.round(timeoutMs / 1000)}s`);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new Error(`\`${bin}\` exited ${result.exitCode}: ${(result.stderr || result.stdout).trim().split("\n")[0]?.slice(0, 300)}`);
    }
    if (parsed.is_error || parsed.subtype !== "success") throw new Error(`Claude run failed (${parsed.subtype ?? "error"}): ${String(parsed.result ?? "").slice(0, 300)}`);
    return String(parsed.result ?? "");
  };
  ask.kind = "claude-cli";
  ask.modelFor = (stage) => models?.[stage] || STAGE_MODELS["claude-cli"][stage] || null;
  return ask;
}

export function openAiProvider({ url, apiKey = "", model = "", models = null, fetchImpl = fetch, timeoutMs = 5 * 60_000, provider = "openai", jsonMode = true } = {}) {
  const ask = async (prompt, { stage } = {}) => {
    const chosen = models?.[stage] || model;
    if (!chosen) throw new Error(`${provider}: no model configured for stage "${stage ?? "default"}".`);
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const payload = { model: chosen, stream: false, temperature: 0.1, messages: [{ role: "user", content: prompt }] };
    if (jsonMode) payload.response_format = { type: "json_object" };
    const res = await fetchImpl(url, { method: "POST", signal: AbortSignal.timeout(timeoutMs), headers, body: JSON.stringify(payload) });
    if (!res.ok) {
      const error = new Error(`${provider} request returned ${res.status}.`);
      error.status = res.status;
      error.provider = provider;
      throw error;
    }
    const body = await res.json();
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((part) => part.type === "text").map((part) => part.text || "").join("") : "";
    if (!text.trim()) throw new Error(`${provider}: no answer text (finish: ${body.choices?.[0]?.finish_reason || "unknown"}).`);
    return text;
  };
  ask.kind = provider;
  ask.modelFor = (stage) => models?.[stage] || model || null;
  return ask;
}

/**
 * A test provider. It never touches the network. Answers come from an option, a file of rules, or
 * ALETHEIA_FAKE_RESPONSE. The optional delay exists so a crash test can kill the worker mid-call.
 */
export function fakeProvider({ response = null, responses = null, file = null, delayMs = 0 } = {}) {
  let index = 0;
  const fromFile = (prompt) => {
    if (!file || !existsSync(file)) return null;
    const doc = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(doc.rules)) {
      const hit = doc.rules.find((rule) => typeof rule?.contains === "string" && prompt.includes(rule.contains));
      if (hit?.response !== undefined) return hit.response;
    }
    if (Array.isArray(doc.responses) && doc.responses.length) return doc.responses[Math.min(index++, doc.responses.length - 1)];
    if (doc.response !== undefined) return doc.response;
    if (doc.default !== undefined) return doc.default;
    return null;
  };
  const pick = (prompt, stage) => {
    if (typeof response === "function") return response(prompt, { stage });
    if (typeof response === "string") return response;
    if (Array.isArray(responses) && responses.length) return responses[Math.min(index++, responses.length - 1)];
    const fromDisk = fromFile(prompt);
    if (fromDisk != null) return typeof fromDisk === "string" ? fromDisk : JSON.stringify(fromDisk);
    if (process.env.ALETHEIA_FAKE_RESPONSE) return process.env.ALETHEIA_FAKE_RESPONSE;
    throw new Error("fake provider has no response configured (ALETHEIA_FAKE_RESPONSE or ALETHEIA_FAKE_FILE).");
  };
  const ask = async (prompt, { stage } = {}) => {
    const wait = Number(delayMs) || Number(process.env.ALETHEIA_FAKE_DELAY_MS) || 0;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return pick(prompt, stage);
  };
  ask.kind = "fake";
  ask.modelFor = () => "fake-model";
  return ask;
}

/**
 * A configured chain provider. Each entry is tried in order. A quota, 429, 5xx or timeout marks that entry
 * unusable for `cooldownMs` and moves to the next; a request error the service can answer (a 400, a refused
 * payload) is surfaced instead of hidden. Requests are capped by `maxConcurrent` (1 by default).
 *
 * The chain is a normal provider: ask(prompt, {stage}) plus modelFor(stage) and kind "chain".
 */
export function createFallbackProvider({ specs = [], timeoutMs = 5 * 60_000, maxConcurrent = 1, cooldownMs = 60_000, now = () => Date.now(), fetchImpl = fetch } = {}) {
  if (!Array.isArray(specs) || !specs.length) throw new Error("A provider chain needs at least one provider.");
  const failedUntil = new Map();
  const failures = new Map();
  const totals = { calls: 0, fallbacks: 0, skipped: 0 };
  const limit = Math.max(1, Number(maxConcurrent) || 1);
  let active = 0;
  const waiting = [];
  const slot = async (fn) => {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
  const asks = specs.map((spec) =>
    spec.kind === "claude-cli"
      ? claudeCliProvider({ bin: spec.bin ?? "claude", cwd: spec.cwd, models: spec.models, timeoutMs: spec.timeoutMs ?? timeoutMs })
      : openAiProvider({ url: spec.url, apiKey: spec.apiKey ?? "", models: spec.models, provider: spec.name, jsonMode: spec.kind !== "local", fetchImpl, timeoutMs: spec.timeoutMs ?? timeoutMs }),
  );
  const available = () => specs.map((_, i) => i).filter((i) => (failedUntil.get(i) ?? 0) <= now());
  const ask = async (prompt, { stage } = {}) => {
    const order = available();
    if (!order.length) throw new Error(`Every provider is cooling down after a quota or service error (${[...failures.keys()].map((i) => specs[i].name).join(", ")}).`);
    const errors = [];
    for (const index of order) {
      if (index !== order[0]) totals.fallbacks++;
      try {
        const answer = await slot(() => asks[index](prompt, { stage: stage ?? "extract" }));
        failedUntil.delete(index);
        failures.delete(index);
        totals.calls++;
        ask.lastUsed = specs[index].name;
        return answer;
      } catch (error) {
        errors.push(`${specs[index].name}: ${error instanceof Error ? error.message : String(error)}`);
        if (!isRetryableProviderError(error)) {
          ask.lastError = error;
          throw error;
        }
        failures.set(index, error);
        failedUntil.set(index, now() + Math.max(0, Number(cooldownMs) || 0));
        ask.lastFailed = specs[index].name;
      }
    }
    ask.lastError = errors;
    throw new Error(`All providers failed: ${errors.join("; ")}`);
  };
  ask.kind = "chain";
  ask.modelFor = (stage) => asks[0]?.modelFor?.(stage) ?? specs[0]?.models?.[stage] ?? null;
  ask.providers = () => specs.map((spec) => ({ name: spec.name, kind: spec.kind, url: spec.url ?? null, model: spec.models?.["extract"] ?? null, coolingDown: (failedUntil.get(specs.indexOf(spec)) ?? 0) > now() }));
  ask.stats = () => ({ ...totals, providers: specs.length });
  ask.cooldowns = () => Object.fromEntries([...failedUntil].filter(([, until]) => until > now()).map(([index, until]) => [specs[index].name, until]));
  return ask;
}

/** True for the failures where the next provider may work: quota, rate limit, server error, timeout. */
export function isRetryableProviderError(error) {
  const status = Number(error?.status);
  if (status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599)) return true;
  const name = String(error?.name ?? "");
  const text = String(error?.message ?? "").toLowerCase();
  if (name === "TimeoutError" || name === "AbortError") return true;
  return /quota|rate.?limit|too many requests|timed? ?out|insufficient|credits|billing|overloaded/.test(text);
}

/**
 * Presets. `url` is the endpoint a local install listens on by default; openrouter and openai use their
 * documented public endpoints. `anthropic-compatible` has no public default on purpose: set the URL.
 */
export const PROVIDER_PRESETS = {
  ollama: { kind: "local", url: "http://127.0.0.1:11434/v1/chat/completions" },
  lmstudio: { kind: "local", url: "http://127.0.0.1:1234/v1/chat/completions" },
  llamacpp: { kind: "local", url: "http://127.0.0.1:8080/v1/chat/completions" },
  local: { kind: "local", url: null },
  openai: { kind: "openai", url: OPENAI_URL, needsKey: true },
  openrouter: { kind: "openrouter", url: OPENROUTER_URL, needsKey: true },
  "claude-cli": { kind: "claude-cli" },
  "anthropic-compatible": {
    kind: "openai",
    url: null,
    needsKey: true,
    needsUrl: true,
    note: "Anthropic publishes no OpenAI-shaped chat endpoint; point ALETHEIA_ANTHROPIC_BASE_URL at a gateway that does.",
  },
};

export const PRESET_NAMES = Object.keys(PROVIDER_PRESETS);

/** "ollama, openrouter, openai" -> ["ollama", "openrouter", "openai"]. Empty is an empty chain. */
export function parseProviderList(value) {
  return String(value ?? "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
}

/** Turn preset names into concrete descriptors. Missing key, URL or model is an error that names the setting. */
export function providerSpecs(names, config = {}) {
  const models = { extract: modelFor(config, "extract"), summary: modelFor(config, "summary") };
  return names.map((name) => {
    const preset = PROVIDER_PRESETS[name];
    if (!preset) throw new Error(`Unknown provider preset "${name}". Use one of: ${PRESET_NAMES.join(", ")}.`);
    if (preset.kind === "claude-cli") {
      return { name, kind: "claude-cli", bin: config.claudeBin, cwd: config.ledgerDir, models: { extract: models.extract || "haiku", summary: models.summary || "sonnet" } };
    }
    if (!models.extract) throw new Error(`Provider "${name}" needs a model: set ALETHEIA_OPENAI_MODEL or ALETHEIA_EXTRACT_MODEL.`);
    if (preset.needsKey && !config.openai?.apiKey) throw new Error(`Provider "${name}" needs ALETHEIA_OPENAI_API_KEY.`);
    const url = preset.url ?? (preset.needsUrl ? config.anthropicBaseUrl : config.localBaseUrl);
    if (!url) throw new Error(`Provider "${name}" needs a URL: set ALETHEIA_ANTHROPIC_BASE_URL.`);
    return { name, kind: preset.kind, url, apiKey: preset.needsKey ? config.openai?.apiKey ?? "" : "", models };
  });
}

/**
 * Build the provider named by config.provider. `none` returns null and makes no network call. A selected but
 * incomplete provider throws a message that names the setting to fix. When config.providers lists more than
 * one entry, a fallback chain is returned instead.
 */
export function makeProvider(config = {}) {
  const chain = Array.isArray(config.providers) ? config.providers : parseProviderList(config.providers);
  if (chain.length > 0) {
    return createFallbackProvider({
      specs: providerSpecs(chain, config),
      timeoutMs: config.providerTimeoutMs ?? 60_000,
      maxConcurrent: config.maxConcurrent ?? 1,
      cooldownMs: config.cooldownMs ?? 60_000,
    });
  }
  const kind = providerKind(config);
  if (kind === "none") return null;
  if (kind === "fake") return fakeProvider({ file: process.env.ALETHEIA_FAKE_FILE || null, delayMs: Number(process.env.ALETHEIA_FAKE_DELAY_MS) || 0 });
  if (kind === "claude-cli") {
    return claudeCliProvider({ bin: config.claudeBin, cwd: config.ledgerDir, models: { extract: modelFor(config, "extract"), summary: modelFor(config, "summary") } });
  }
  if (!PROVIDER_KINDS.includes(kind)) throw new Error(`Unknown provider "${kind}". Use one of: ${PROVIDER_KINDS.join(", ")}.`);
  const models = { extract: modelFor(config, "extract"), summary: modelFor(config, "summary") };
  if (!models.extract) throw new Error(`Provider "${kind}" needs a model: set ALETHEIA_OPENAI_MODEL or ALETHEIA_EXTRACT_MODEL.`);
  if ((kind === "openai" || kind === "openrouter") && !config.openai?.apiKey) throw new Error(`Provider "${kind}" needs ALETHEIA_OPENAI_API_KEY.`);
  if (kind === "local" && !config.localBaseUrl) throw new Error('Provider "local" needs ALETHEIA_LOCAL_BASE_URL.');
  const url = kind === "local" ? config.localBaseUrl : kind === "openrouter" ? OPENROUTER_URL : config.openai.baseUrl || OPENAI_URL;
  return openAiProvider({ url, apiKey: config.openai?.apiKey ?? "", models, provider: kind, jsonMode: kind !== "local" });
}
