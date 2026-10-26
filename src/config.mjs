// Runtime configuration. Every path and port is an environment variable with a default.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const env = process.env;
const home = homedir();

// The original worker listens on 37700 + (uid % 100). The clone defaults to a fixed port next to it.
export const DEFAULT_PORT = 37790;

// Existing data written under the project's earlier name (work-view-local) keeps being used until it is moved.
export function defaultDataDir(homeDir = home) {
  const current = join(homeDir, ".aletheia");
  const earlier = join(homeDir, ".work-view-local");
  return !existsSync(current) && existsSync(earlier) ? earlier : current;
}

export function loadConfig(overrides = {}) {
  const dataDir = overrides.dataDir ?? env.ALETHEIA_DATA_DIR ?? defaultDataDir();
  const cfg = {
    host: "127.0.0.1",
    port: Number(overrides.port ?? env.ALETHEIA_PORT ?? DEFAULT_PORT),
    // Read-only source: the claude-mem database.
    sourceDb: overrides.sourceDb ?? env.CLAUDE_MEM_DB ?? join(home, ".claude-mem", "claude-mem.db"),
    // Everything the clone writes lives under dataDir.
    dataDir,
    overlayDb: overrides.overlayDb ?? join(dataDir, "overlay.db"),
    reviewDb: overrides.reviewDb ?? join(dataDir, "work-view-reviews.db"),
    ledgerDir: overrides.ledgerDir ?? env.ALETHEIA_LEDGER_DIR ?? join(dataDir, "ledger"),
    humanCopyCache: overrides.humanCopyCache ?? join(dataDir, "human-copy.json"),
    rulesFile: overrides.rulesFile ?? env.ALETHEIA_RULES_FILE ?? join(dataDir, "MY-RULES.md"),
    claudeInstructionsFile: overrides.claudeInstructionsFile ?? env.ALETHEIA_CLAUDE_MD ?? join(home, ".claude", "CLAUDE.md"),
    setupStateFile: overrides.setupStateFile ?? join(dataDir, "setup-state.json"),
    publicDir: overrides.publicDir ?? join(import.meta.dir, "..", "public"),
    hubDb: overrides.hubDb ?? env.ALETHEIA_HUB_DB ?? join(dataDir, "hub.db"),
    hubUiDir: overrides.hubUiDir ?? join(import.meta.dir, "..", "public-hub"),
    // Optional bearer key for /v1 (tools). Leave empty on a single-user machine; the API is loopback-only anyway.
    apiKey: overrides.apiKey ?? env.ALETHEIA_API_KEY ?? "",
    promptsDir: overrides.promptsDir ?? join(import.meta.dir, "..", "prompts"),
    vendorDir: overrides.vendorDir ?? join(import.meta.dir, "..", "vendor"),
    pollIntervalMs: Number(overrides.pollIntervalMs ?? env.ALETHEIA_POLL_MS ?? 1000),
    // Projects whose activity is never captured. Comma-separated, matched case-insensitively by project key.
    excludedProjects: overrides.excludedProjects ?? String(env.ALETHEIA_EXCLUDED_PROJECTS ?? "").split(",").map((name) => name.trim()).filter(Boolean),
    // The LLM refresh (grouping, reviews, goals, story) is off unless a provider is chosen.
    // ALETHEIA_PROVIDER = claude-cli | openai | none
    provider: overrides.provider ?? env.ALETHEIA_PROVIDER ?? "none",
    // Extraction mode: code, chill, language-en or language-es. See src/hub/modes/*.json.
    mode: overrides.mode ?? env.ALETHEIA_MODE ?? "code",
    // Model routing. Extraction should use the small model; summaries the larger one.
    extractModel: overrides.extractModel ?? env.ALETHEIA_EXTRACT_MODEL ?? "",
    summaryModel: overrides.summaryModel ?? env.ALETHEIA_SUMMARY_MODEL ?? "",
    localBaseUrl: overrides.localBaseUrl ?? env.ALETHEIA_LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1/chat/completions",
    autoRefresh: (overrides.autoRefresh ?? env.ALETHEIA_AUTO_REFRESH ?? "true") !== "false" && (overrides.autoRefresh ?? true) !== false,
    // The extraction worker is started by the server binary or `aletheia compress --daemon`, never by a hook.
    extractionWorker: overrides.extractionWorker ?? env.ALETHEIA_EXTRACTION_WORKER === "1",
    refreshCheckMs: Number(overrides.refreshCheckMs ?? env.ALETHEIA_REFRESH_CHECK_MS ?? 10 * 60_000),
    // Fact extraction batching and cost. Prices default to 0: this project does not guess a vendor price.
    factBudget: {
      maxEpisodes: Number(overrides.factBudget?.maxEpisodes ?? env.ALETHEIA_FACT_MAX_EPISODES ?? 20),
      maxChars: Number(overrides.factBudget?.maxChars ?? env.ALETHEIA_FACT_CHAR_BUDGET ?? 12_000),
    },
    prices: {
      inputPer1k: Number(overrides.prices?.inputPer1k ?? env.ALETHEIA_PRICE_IN_PER_1K ?? 0),
      outputPer1k: Number(overrides.prices?.outputPer1k ?? env.ALETHEIA_PRICE_OUT_PER_1K ?? 0),
    },
    // Human copy (plain-language card text) needs an OpenAI-compatible endpoint.
    openai: {
      baseUrl: env.ALETHEIA_OPENAI_BASE_URL ?? "https://api.openai.com/v1/chat/completions",
      apiKey: env.ALETHEIA_OPENAI_API_KEY ?? "",
      model: env.ALETHEIA_OPENAI_MODEL ?? "",
    },
    claudeBin: env.ALETHEIA_CLAUDE_BIN ?? "claude",
    teamMode: env.WORK_STATE_TEAM_MODE === "1",
    // 1 = reproduce the original's silent failure to read observations (see docs/08-findings.md, F1).
    bugCompatible: (overrides.bugCompatible ?? env.ALETHEIA_BUG_COMPAT) === true || (overrides.bugCompatible ?? env.ALETHEIA_BUG_COMPAT) === "1",
    home,
    ...overrides.extra,
  };
  return cfg;
}

export function abbreviateHome(path, homeDir = home) {
  return path === homeDir || path.startsWith(`${homeDir}/`) ? `~${path.slice(homeDir.length)}` : path;
}
