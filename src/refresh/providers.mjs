// LLM providers for the refresh. A provider is `async (prompt, { stage, schema }) => answerText`.
// The refresh gives the model its evidence INLINE (no file or memory tools), so any chat model works.
//   claude-cli : the `claude` CLI in print mode, no tools, no user settings, not recorded by claude-mem
//   openai     : any OpenAI-compatible chat-completions endpoint (ALETHEIA_OPENAI_*)
import { spawn } from "node:child_process";

/** Model per stage. Cheap model for grouping and alignment, stronger for goals, reviews and the story. */
export const STAGE_MODELS = {
  "claude-cli": { goals: "sonnet", grouping: "haiku", review: "sonnet", alignment: "haiku", story: "sonnet", compress: "haiku" },
};

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

export function claudeCliProvider({ bin = "claude", cwd = process.cwd(), timeoutMs = 5 * 60_000 } = {}) {
  return async (prompt, { stage } = {}) => {
    const model = STAGE_MODELS["claude-cli"][stage];
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
}

export function openAiProvider({ url, apiKey, model, fetchImpl = fetch, timeoutMs = 5 * 60_000 }) {
  return async (prompt) => {
    const res = await fetchImpl(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Model request returned ${res.status}.`);
    const body = await res.json();
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : Array.isArray(content) ? content.filter((p) => p.type === "text").map((p) => p.text || "").join("") : "";
    if (!text.trim()) throw new Error(`No answer text (finish: ${body.choices?.[0]?.finish_reason || "unknown"}).`);
    return text;
  };
}

export function makeProvider(config) {
  if (config.provider === "claude-cli") return claudeCliProvider({ bin: config.claudeBin, cwd: config.ledgerDir });
  if (config.provider === "openai") {
    if (!config.openai.apiKey || !config.openai.model) throw new Error("ALETHEIA_PROVIDER=openai needs ALETHEIA_OPENAI_API_KEY and ALETHEIA_OPENAI_MODEL.");
    return openAiProvider({ url: config.openai.baseUrl, apiKey: config.openai.apiKey, model: config.openai.model });
  }
  return null;
}
