#!/usr/bin/env bun
// aletheia: the command line for the shared memory hub. Works without the server running.
//   aletheia capture --tool <name> [--project p]          read one hook payload (JSON) on stdin, store it (secrets redacted)
//   aletheia context [--project p] [--tool t]             print session-start context for any tool
//   aletheia search <query> [--project p] [--scope all] [--explain] [--semantic]
//   aletheia embed [--limit n]                          write fact and memory vectors when the runtime is installed
//   aletheia save <text> [--project p] [--type t] [--pin] save a memory
//   aletheia import claude-mem [--path db] [--no-prompts] bring memory in from claude-mem
//   aletheia import bundle <file.jsonl>                   restore an export
//   aletheia export [--format jsonl|markdown] [--project p] [--events] [--out file]
//   aletheia rules list | add <text> [--when w] | sync --tools a,b [--dir path | --global] [--write] | import --tool t --dir path
//   aletheia tools                                        detected tools and how to connect each
//   aletheia connect <tool> [--write]                     preview (default) or write the MCP config for a tool
//   aletheia install <tool> [--write] [--dry-run]         preview (default) or write MCP, hooks and rules in one go
//   aletheia uninstall <tool> [--write]                   remove only the entries the install manifest lists
//   aletheia hook <tool> <event>                          hook entry point: read one JSON payload on stdin
//   aletheia doctor                                       check the server, hooks, spool and last capture
//   aletheia compress [--project p] [--daemon]         drain the extraction queue (provider or rule-based)
//   aletheia summarize [--scope session|project|entity] [--project p] [--session s] [--entity id]
//   aletheia prune [--apply]                            report cold facts and old episodes; --apply changes them
//   aletheia promote <type> <id>                        make a memory, episode, observation or fact global
//   aletheia importance recompute [--project p]         recompute the transparent importance score
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { normalizeHook, redact } from "../src/hub/capture.mjs";
import { importClaudeMem } from "../src/hub/importers.mjs";
import { applyInstall, applyUninstall, doctor, formatPlan, formatUninstall, installerFor, installerIds, planUninstall } from "../src/hub/install.mjs";
import { parseRulesFromText, syncTool, targetPath } from "../src/hub/rules-sync.mjs";
import { HubStore, inspectMigration, targetSchemaVersion } from "../src/hub/store.mjs";
import { TOOLS, applyMcp, detectTools, mcpCommand, mcpPlan, toolById } from "../src/hub/tools.mjs";
import { projectKeyForPath } from "../src/readmodel/project.mjs";
import { makeProvider } from "../src/refresh/providers.mjs";

const config = loadConfig();
const [cmd, ...rest] = process.argv.slice(2);

function parseArgs(args) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}
const out = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
const die = (m) => { console.error(m); process.exit(1); };

function installEnv(hub) {
  return {
    home: config.home,
    bun: process.execPath,
    hookScript: join(import.meta.dir, "aletheia.mjs"),
    hookRunner: join(config.dataDir, "aletheia.bundle.mjs"),
    mcpScript: join(import.meta.dir, "mcp.mjs"),
    dataDir: config.dataDir,
    dbPath: config.hubDb,
    port: config.port,
    provider: config.provider,
    mode: config.mode,
    rules: hub ? hub.rules.list() : [],
  };
}

async function handleInstall(command, flags, pos) {
  const id = pos[0];
  if (!id) return die(`Usage: aletheia ${command} <tool>\nTools: ${installerIds().join(", ")}`);
  let installer;
  try {
    installer = installerFor(id);
  } catch (error) {
    return die(error.message);
  }
  const write = !!flags.write && !flags["dry-run"];
  // A dry run must not create the data directory or the database. Read existing rules only, and never for uninstall.
  let hub = null;
  if (command === "install" && (write || existsSync(config.hubDb))) {
    try {
      hub = new HubStore(config.hubDb);
    } catch {
      hub = null;
    }
  }
  const env = installEnv(hub);
  hub?.close();
  try {
    if (command === "install") {
      const plan = installer.plan(env);
      out(formatPlan(plan));
      if (!write) return out("Dry run: nothing was written. Add --write to apply.");
      const result = await applyInstall(plan, { dataDir: config.dataDir });
      return out(result.changed ? `Wrote ${result.wrote.length} file(s):\n${result.wrote.map((file) => `  ${file}`).join("\n")}` : "Already installed; nothing changed.");
    }
    const plan = planUninstall(id, env, { dataDir: config.dataDir });
    out(formatUninstall(plan));
    if (!plan.installed) return;
    if (!write) return out("Dry run: nothing was written. Add --write to remove.");
    const result = applyUninstall(plan, { dataDir: config.dataDir });
    return out(result.wrote.length ? `Removed our entries from ${result.wrote.length} file(s):\n${result.wrote.map((file) => `  ${file}`).join("\n")}` : "Nothing to remove; the manifest entry is gone.");
  } catch (error) {
    return die(error.message);
  }
}

async function main() {
  const { flags, pos } = parseArgs(rest);

  // Hooks run in the host tool's hot path: no store is opened here, and a watchdog guarantees a return.
  if (cmd === "hook") {
    const watchdog = setTimeout(() => process.exit(0), 150);
    try {
      const { runHook } = await import("../src/hub/hooks/run.mjs");
      const result = await runHook({ tool: pos[0], event: pos[1], stdin: readFileSync(0, "utf8") });
      if (result.stdout) process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
    } catch {
      // A hook never breaks the session.
    }
    clearTimeout(watchdog);
    return;
  }

  if (cmd === "install" || cmd === "uninstall") return handleInstall(cmd, flags, pos);

  if (cmd === "migrate") {
    const dbPath = typeof flags.db === "string" ? flags.db : config.hubDb;
    const before = inspectMigration(dbPath);
    if (!before.exists) return out(`No database at ${dbPath}; nothing to migrate.`);
    if (flags["dry-run"]) return out(JSON.stringify({ ...before, dryRun: true }, null, 2));
    if (!before.needsMigration) return out(`Schema v${before.version} is current; nothing to do.`);
    const backup = typeof flags.backup === "string" ? flags.backup : `${dbPath}.aletheia-bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    mkdirSync(dirname(backup), { recursive: true });
    copyFileSync(dbPath, backup);
    const hub = new HubStore(dbPath);
    const after = hub.migrationCounts();
    hub.close();
    return out(`Backed up to ${backup}\nMigrated schema v${before.version} -> v${targetSchemaVersion}: ${JSON.stringify(after)}`);
  }

  if (cmd === "doctor") {
    const checks = await doctor(installEnv(null));
    for (const check of checks) out(`${check.ok ? "ok  " : "FAIL"} ${check.name.padEnd(20)} ${check.detail}`);
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
    return;
  }

  const hub = new HubStore(config.hubDb);
  const argv = mcpCommand({ bun: process.execPath, script: join(import.meta.dir, "mcp.mjs") });
  try {
    switch (cmd) {
      case "capture": {
        let payload;
        try { payload = JSON.parse(readFileSync(0, "utf8")); } catch { return void process.exit(0); } // a hook must never break the tool
        const memory = normalizeHook(payload, { tool: flags.tool ?? "unknown", project: flags.project, excluded: config.excludedProjects });
        if (memory) hub.add(memory, { actor: memory.tool });
        return;
      }
      case "context": return out(hub.context({ project: flags.project ?? projectKeyForPath(process.cwd()), tool: flags.tool, limit: Number(flags.limit) || 20, scope: flags.scope === "all" ? "all" : "current" }));
      case "search": {
        const asOf = typeof flags["as-of"] === "string" ? Date.parse(flags["as-of"]) : null;
        if (flags["as-of"] && !Number.isFinite(asOf)) return die("--as-of needs a date, for example 2026-01-31.");
        const { formatChannels, searchMemory } = await import("../src/hub/search.mjs");
        let embedder = null;
        if (flags.semantic) {
          const { createEmbedderIfAvailable } = await import("../src/hub/embed.mjs");
          embedder = await createEmbedderIfAvailable();
          if (!embedder) return die("--semantic needs the optional runtime: bun add @huggingface/transformers");
        }
        const { results: rows, channels } = await searchMemory({
          store: hub, query: pos.join(" "), project: flags.project, limit: Number(flags.limit) || 20,
          includeHistory: !!flags.history, asOf, scope: flags.scope === "all" ? "all" : "current", embedder,
        });
        const body = rows.length ? rows.map((r) => (r.kind === "fact"
          ? `fact #${r.id} ${r.at.slice(0, 10)} [${r.status}] ${r.text} (source episode #${r.source?.episodeId ?? "-"})`
          : `#${r.id} ${r.at.slice(0, 10)} [${r.type}] ${r.title} (${r.project}, ${r.tool})`)).join("\n") : "No matches.";
        return out(flags.explain ? `${body}\n${formatChannels(channels)}` : body);
      }
      case "embed": {
        const { createEmbedderIfAvailable } = await import("../src/hub/embed.mjs");
        const { embedMissingFacts } = await import("../src/hub/search.mjs");
        const embedder = await createEmbedderIfAvailable();
        if (!embedder) return die("Embeddings need the optional runtime: bun add @huggingface/transformers (or set ALETHEIA_TRANSFORMERS_FROM).");
        const limit = Number(flags.limit) || 5000;
        const facts = await embedMissingFacts(hub, embedder, { limit });
        const memories = await hub.embedMissing(embedder, { limit });
        return out(`Embedded ${facts} fact(s) and ${memories} memory/memories with ${embedder.model} (${embedder.dim} dims).`);
      }
      case "promote": {
        if (!pos[0] || !pos[1]) return die("Usage: aletheia promote <memory|episode|observation|fact> <id>");
        return out(hub.promote(pos[0], Number(pos[1]), { actor: "cli" }));
      }
      case "save": {
        const text = pos.join(" ");
        if (!text) die("Usage: aletheia save <text>");
        const r = hub.add({ project: flags.project ?? projectKeyForPath(process.cwd()), kind: "note", type: flags.type ?? "note", title: redact(text).slice(0, 100), narrative: redact(text), tool: flags.tool ?? "cli", pinned: !!flags.pin }, { actor: "cli" });
        return out(r.created ? `Saved as #${r.id}.` : `Already saved as #${r.id}.`);
      }
      case "import": {
        if (pos[0] === "claude-mem") return out(importClaudeMem(hub, flags.path ?? config.sourceDb, { includePrompts: !flags["no-prompts"], project: flags.project || null }));
        if (pos[0] === "bundle") return out(hub.importBundle(readFileSync(pos[1] ?? die("Usage: aletheia import bundle <file>"), "utf8")));
        return die("Usage: aletheia import claude-mem | bundle <file>");
      }
      case "export": {
        const body = flags.format === "markdown" ? hub.exportMarkdown({ project: flags.project }) : hub.exportBundle({ project: flags.project, includeEvents: !!flags.events });
        if (flags.out) { writeFileSync(flags.out, body); return out(`Wrote ${flags.out}`); }
        return process.stdout.write(body);
      }
      case "rules": {
        const sub = pos[0];
        if (sub === "list") return out(hub.rules.list().map((r) => `${r.enabled ? "on " : "off"} ${r.id}  ${r.when ? `When ${r.when}: ` : ""}${r.then}  [${r.scopeTier === "everywhere" ? "everywhere" : r.scopeName}${r.tools ? `; ${r.tools.join(",")}` : ""}]`).join("\n") || "No rules yet.");
        if (sub === "add") { const r = hub.rules.add({ then: pos.slice(1).join(" "), when: typeof flags.when === "string" ? flags.when : "" }); return out(r.created ? `Added ${r.id}.` : `Already there (${r.id}).`); }
        if (sub === "suggest") {
          const { suggestRules } = await import("../src/hub/rule-suggest.mjs");
          return out(suggestRules(hub, { project: flags.project ?? null }));
        }
        if (sub === "suggestions") {
          const { listSuggestions } = await import("../src/hub/rule-suggest.mjs");
          const rows = listSuggestions(hub, { project: flags.project, status: typeof flags.status === "string" ? flags.status : "pending" });
          return out(rows.length ? rows.map((row) => `#${row.id} [${row.status}] ${row.text}  (${row.project}, confidence ${row.confidence})`).join("\n") : "No rule suggestions.");
        }
        if (sub === "sync" || sub === "import") {
          const scope = flags.global ? "global" : "project";
          const dir = scope === "project" ? resolve(flags.dir ?? process.cwd()) : undefined;
          if (sub === "import") {
            const tool = flags.tool ?? die("Usage: aletheia rules import --tool <id> [--dir path | --global]");
            const found = parseRulesFromText(readFileSync(targetPath(tool, { scope, projectDir: dir, home: config.home }), "utf8"));
            const res = { found: found.length, added: 0, skipped: 0 };
            for (const r of found) res[hub.rules.add({ ...r, source: `import:${tool}` }).created ? "added" : "skipped"]++;
            return out(res);
          }
          const ids = typeof flags.tools === "string" ? flags.tools.split(",") : TOOLS.map((t) => t.id);
          for (const id of ids) if (!toolById(id)) die(`Unknown tool: ${id}`);
          for (const id of ids) {
            const r = syncTool(hub.rules.list(), id, { scope, projectDir: dir, home: config.home, dryRun: !flags.write });
            if (r.skipped) { out(`- ${id}: ${r.skipped}`); continue; }
            out(`- ${id}: ${r.path} — ${r.rules} rules, ${r.written ? `written${r.backup ? ` (backup ${r.backup})` : ""}` : r.changed ? "would change (add --write)" : "already up to date"}`);
          }
          return;
        }
        return die("Usage: aletheia rules list | add <text> | sync | import");
      }
      case "tools": return out(detectTools(config.home).map((t) => `${t.installed ? "✔" : "·"} ${t.id.padEnd(12)} ${t.name}  rules: ${t.rulesProject}${t.rulesGlobal ? ` | ~/${t.rulesGlobal}` : ""}${t.canConnect ? "  mcp: yes" : ""}`).join("\n"));
      case "connect": {
        const tool = toolById(pos[0] ?? "") ?? die(`Unknown tool. Try: ${TOOLS.filter((t) => t.mcp).map((t) => t.id).join(", ")}`);
        const plan = mcpPlan(tool, config.home, argv);
        if (!plan.supported) return die(`${tool.name} has no MCP configuration in the registry.`);
        if (plan.kind === "command") return out(`Run this:\n  ${plan.command}`);
        if (!flags.write) return out(`${plan.connected ? "Already connected.\n" : ""}Would write to ${plan.path}:\n${plan.snippet}\nAdd --write to apply (a backup is kept).`);
        return out(applyMcp(tool, config.home, argv));
      }
      case "importance": {
        if (pos[0] !== "recompute") return die("Usage: aletheia importance recompute [--project p]");
        const { recomputeImportance } = await import("../src/hub/importance.mjs");
        return out(recomputeImportance(hub, { project: flags.project }));
      }
      case "summarize": {
        const { buildEntitySummary, buildProjectSummary, buildSessionSummary, listSummaries } = await import("../src/hub/summaries.mjs");
        const scope = typeof flags.scope === "string" ? flags.scope : "session";
        if (scope === "session") {
          if (!flags.session) return die("Usage: aletheia summarize --scope session --project p --session s");
          const result = buildSessionSummary(hub, { project: flags.project ?? "default", sessionId: flags.session });
          return out(result ? `summary #${result.id}: ${result.factIds.length} source fact(s), ${result.tokenCount} tokens` : "No active fact for that session; nothing summarised.");
        }
        if (scope === "project") {
          if (!flags.project) return die("Usage: aletheia summarize --scope project --project p");
          const result = buildProjectSummary(hub, { project: flags.project, days: Number(flags.days) || 7 });
          return out(result ? `summary #${result.id}: ${result.factIds.length} source fact(s), ${result.tokenCount} tokens` : "No active fact in that window; nothing summarised.");
        }
        if (scope === "entity") {
          if (!flags.entity) return die("Usage: aletheia summarize --scope entity --entity <id>");
          const result = buildEntitySummary(hub, { entityId: Number(flags.entity) });
          return out(result ? `summary #${result.id}: ${result.factIds.length} source fact(s), ${result.tokenCount} tokens` : "That entity has no active fact; nothing summarised.");
        }
        if (scope === "list") return out(listSummaries(hub, { project: flags.project, limit: Number(flags.limit) || 50 }));
        return die(`Unknown scope "${scope}". Use session, project, entity or list.`);
      }
      case "prune": {
        const { formatPruneReport, prune } = await import("../src/hub/retention.mjs");
        return out(formatPruneReport(prune(hub, { apply: !!flags.apply })));
      }
      case "compress": {
        const { runWorker, startBackgroundWorker } = await import("../src/hub/queue.mjs");
        let ask = null;
        try {
          ask = makeProvider(config);
        } catch (error) {
          return die(error.message);
        }
        const mode = ask ? config.provider : "rules";
        let embedder = null;
        if (process.env.ALETHEIA_EMBED_FACTS !== "0") {
          const { createEmbedderIfAvailable } = await import("../src/hub/embed.mjs");
          embedder = await createEmbedderIfAvailable();
        }
        if (flags.daemon) {
          const worker = startBackgroundWorker({
            store: hub, ask, config, embedder, intervalMs: Number(flags.interval) || 2000,
            onTick: (result) => { if (result?.processed) out(`processed ${result.processed} job(s), ${result.last?.facts ?? 0} new fact(s), ${result.last?.embedded ?? 0} embedded`); },
            onError: (error) => out(`worker error: ${error.message}`),
          });
          out(`Extraction worker running (${mode}${embedder ? `, embeddings ${embedder.model}` : ", keyword only"}); Ctrl-C to stop.`);
          await new Promise((resolve) => {
            for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { worker.stop(); resolve(); });
          });
          return;
        }
        const result = await runWorker({ store: hub, ask, config, embedder });
        const last = result.last ? `\nlast: ${result.last.memories} memories, ${result.last.windows} window(s), ${result.last.facts} new fact(s), ${result.last.rejected} rejected, ${result.last.embedded ?? 0} embedded` : "";
        return out(`Extraction mode: ${mode}${embedder ? `; embeddings ${embedder.model}` : "; keyword only"}\nqueue: ${JSON.stringify(result.counts)}${last}`);
      }
      default:
        return die(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
    }
  } finally {
    hub.close();
  }
}
await main();
