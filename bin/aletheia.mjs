#!/usr/bin/env bun
// aletheia: the command line for the shared memory hub. Works without the server running.
//   aletheia capture --tool <name> [--project p]          read one hook payload (JSON) on stdin, store it (secrets redacted)
//   aletheia context [--project p] [--tool t]             print session-start context for any tool
//   aletheia search <query> [--project p] [--scope all] [--explain] [--semantic]
//   aletheia embed [--limit n]                          write fact and memory vectors when the runtime is installed
//   aletheia save <text> [--project p] [--type t] [--pin] save a memory
//   aletheia import claude-mem [--path db] [--no-prompts] bring memory in from claude-mem
//   aletheia import bundle <file.jsonl>                   restore an export
//   aletheia import transcripts <tool> [--since DATE] [--dry-run] [--limit n]
//                                                          back-fill from local session files (read-only)
//   aletheia export [--format jsonl|markdown] [--project p] [--events] [--out file]
//   aletheia rules list | add <text> [--when w] | lint [--dir path] [--tools a,b] [--json] | sync --tools a,b [--dir path | --global] [--write] | import --tool t --dir path
//   aletheia tools                                        detected tools and how to connect each
//   aletheia connect <tool> [--write]                     preview (default) or write the MCP config for a tool
//   aletheia install <tool> [--write] [--dry-run]         preview (default) or write MCP, hooks and rules in one go
//   aletheia install --list                               capability level, verification and detection per tool
//   aletheia uninstall <tool> [--write] [--force]         remove only the entries the install manifest lists
//   aletheia hook <tool> <event>                          hook entry point: read one JSON payload on stdin
//   aletheia doctor                                       check the server, hooks, spool and last capture
//   aletheia compress [--project p] [--daemon]         drain the extraction queue (provider or rule-based)
//   aletheia summarize [--scope session|project|entity] [--project p] [--session s] [--entity id]
//   aletheia prune [--apply]                            report cold facts and old episodes; --apply changes them
//   aletheia promote <type> <id>                        make a memory, episode, observation or fact global
//   aletheia dismiss <id | type:id> [--reason r]        hide a memory, episode, observation or fact (reversible)
//   aletheia restore <id | type:id>                     undo a dismissal
//   aletheia dismissed [--limit n]                      list dismissed items
//   aletheia language [set <tag> | list] [--project p]  output language for facts and summaries (empty clears)
//   aletheia optimize                                   rebuild FTS segments after a large import
//   aletheia importance recompute [--project p]         recompute the transparent importance score
//   aletheia sync pair | join <url> <code> | status | devices | revoke <device> | push | pull | run | compact | purge <entity_id> | export <dir> | import <dir>
//   aletheia sync enable-e2ee | unlock-e2ee | rotate-key | change-passphrase | upgrade-kdf | export-recovery-key --out <file> | purge-plaintext [--apply]
//                                                          optional end-to-end encryption (passphrase via --passphrase or ALETHEIA_SYNC_PASSPHRASE)
//   aletheia mcp-link create [--projects a,b] [--url https://hub.example] | list | revoke <id>
//                                                          manage the private remote MCP endpoint
//   aletheia team list | create <name> | add-project <team> <project> | add-member <team> --name n --role r --projects a,b
//             | members <team> | revoke-member <team> <id> | share <team> <id> --projects a,b
//             | board <team> [--project p] | pin|decision|memory <team> <text> --project p
//             | brief <team> --project p | search <team> <query> | leave <team> | audit <team>
//                                                          team mode (T-112); --token-id acts as a member, otherwise the local operator
//   aletheia service install|uninstall|status [--write] [--cpu-quota X] [--memory-max Y]
//                                                          auto-start unit/plist (dry-run by default; Linux/macOS only)
//   aletheia audit [--limit n]                          read the sync audit log
//   aletheia erase [--project p | --id 12,fact:3 | --before DATE] [--apply] [--export file] [--receipt file]
//                                                          report first; --apply exports, erases and signs a receipt
//   aletheia erase verify <receipt.json>                  check a receipt's HMAC
//   aletheia alerts add --event E --target webhook|file [--url u|--path p] [--secret s] [--allow-private]
//                  | list | remove <id> | enable|disable <id> | test <id> | run | feed | check | emit <event> [--value n]
//                                                          alert rules and delivery (T-114)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { normalizeHook, redact } from "../src/hub/capture.mjs";
import { importClaudeMem } from "../src/hub/importers.mjs";
import { applyInstall, applyUninstall, doctor, formatInstallerList, formatPlan, formatUninstall, installerFor, installerIds, planUninstall } from "../src/hub/install.mjs";
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

/** `12` means memory #12; `fact:12` names another dismissible type. */
function dismissTarget(value) {
  const text = String(value ?? "");
  const match = /^(memory|episode|observation|fact):(\d+)$/.exec(text);
  if (match) return { type: match[1], id: Number(match[2]) };
  if (/^\d+$/.test(text)) return { type: "memory", id: Number(text) };
  return null;
}

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
  if (command === "install" && flags.list) return out(formatInstallerList(installEnv(null)));
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
    const plan = planUninstall(id, env, { dataDir: config.dataDir, force: !!flags.force });
    out(formatUninstall(plan));
    if (!plan.installed) return;
    if (!write) return out("Dry run: nothing was written. Add --write to remove.");
    const result = applyUninstall(plan, { dataDir: config.dataDir });
    if (result.blocked) {
      process.exitCode = 1;
      return out("Refused: a file changed after install. Review it, then rerun with --force to remove our entries anyway.");
    }
    return out(result.wrote.length ? `Removed our entries from ${result.wrote.length} file(s):\n${result.wrote.map((file) => `  ${file}`).join("\n")}` : "Nothing to remove; the manifest entry is gone.");
  } catch (error) {
    return die(error.message);
  }
}

async function runTeamCommand(flags, pos) {
  const { SyncStore } = await import("../src/hub/sync/store.mjs");
  const { TeamStore } = await import("../src/hub/team.mjs");
  const sync = new SyncStore(config.syncDb);
  const account = sync.ensureAccount();
  const team = new TeamStore(config.teamDb, {
    tokenActive: (id) => {
      const row = sync.db.prepare("SELECT revoked_at, expires_at FROM sync_token WHERE id = ?").get(Number(id));
      return !!row && !row.revoked_at && !(row.expires_at && row.expires_at < Date.now());
    },
  });
  try {
    const tokenId = Number(flags["token-id"]);
    const asMember = Number.isSafeInteger(tokenId) && tokenId > 0;
    const actor = asMember ? tokenId : null;
    const operator = !asMember;
    const sub = pos[0] ?? "list";
    const teamId = pos[1];

    if (sub === "list") return out(team.listTeams(account.id, actor, { operator }));
    if (sub === "create") {
      if (!teamId) return die("Usage: aletheia team create <name> [--token-id id]");
      return out(team.createTeam(account.id, teamId, { tokenId: actor, operator }));
    }
    if (!teamId) return die(`Usage: aletheia team ${sub} <team> ...`);

    if (sub === "add-project") {
      if (!pos[2]) return die("Usage: aletheia team add-project <team> <project>");
      return out(team.addProject(account.id, teamId, actor, pos[2], { operator }));
    }
    if (sub === "members") return out(team.listMembers(account.id, teamId, actor, { operator }));
    if (sub === "add-member") {
      if (!flags.name) return die("Usage: aletheia team add-member <team> --name <n> [--role owner|editor|viewer] [--projects a,b]");
      const minted = sync.mintToken(account.id, { scope: "sync", name: String(flags.name) });
      const member = team.addMember(account.id, teamId, actor, {
        name: String(flags.name),
        role: typeof flags.role === "string" ? flags.role : "viewer",
        projects: typeof flags.projects === "string" ? flags.projects.split(",") : [],
        memberTokenId: minted.id,
      }, { operator });
      return out({ member, token: minted.token, note: "This token is shown once. Give it to the member as their device token." });
    }
    if (sub === "revoke-member") {
      if (!pos[2]) return die("Usage: aletheia team revoke-member <team> <member-id>");
      const revoked = team.revokeMember(account.id, teamId, actor, Number(pos[2]), { operator });
      if (revoked.tokenId > 0) sync.revokeToken(account.id, revoked.tokenId);
      return out(revoked);
    }
    if (sub === "share") {
      if (!pos[2]) return die("Usage: aletheia team share <team> <member-id> --projects a,b");
      return out(team.setShares(account.id, teamId, actor, Number(pos[2]), typeof flags.projects === "string" ? flags.projects.split(",") : [], { operator }));
    }
    if (sub === "board") return out(team.board(account.id, teamId, actor, { project: typeof flags.project === "string" ? flags.project : null }, { operator }));
    if (sub === "pin" || sub === "decision" || sub === "memory") {
      const body = pos.slice(2).join(" ");
      if (!body) return die(`Usage: aletheia team ${sub} <team> <text> --project p`);
      if (!flags.project) return die("--project is required for a shared entry.");
      if (sub === "memory") {
        return out(team.addEntry(account.id, teamId, actor, { project: flags.project, kind: "memory", title: typeof flags.title === "string" ? flags.title : "", text: body }, { operator }));
      }
      return out(team.addBoardEntry(account.id, teamId, actor, { project: flags.project, kind: sub, text: body }, { operator }));
    }
    if (sub === "brief") {
      if (!flags.project) return die("Usage: aletheia team brief <team> --project p");
      return out(team.brief(account.id, teamId, actor, { project: flags.project, days: Number(flags.days) || undefined, maxChars: Number(flags["max-chars"]) || undefined }, { operator }).text);
    }
    if (sub === "search") {
      const query = pos.slice(2).join(" ");
      if (!query) return die("Usage: aletheia team search <team> <query> [--project p]");
      return out(team.search(account.id, teamId, actor, { query, project: typeof flags.project === "string" ? flags.project : null, limit: Number(flags.limit) || 20 }, { operator }));
    }
    if (sub === "leave") {
      const left = team.leave(account.id, teamId, actor, { operator });
      if (actor) sync.revokeToken(account.id, actor);
      return out(left);
    }
    if (sub === "audit") {
      const id = team.team(account.id, teamId).id;
      team.authorize(account.id, id, actor, null, "manage", { operator });
      return out(team.auditLog(id, Number(flags.limit) || 100));
    }
    return die("Usage: aletheia team list | create | add-project | add-member | members | revoke-member | share | board | pin | decision | memory | brief | search | leave | audit");
  } finally {
    team.close();
    sync.close();
  }
}

async function runAlertsCommand(flags, pos, hub) {
  const { AlertStore, deliverDue, extractionFailures, queueDepth } = await import("../src/hub/alerts.mjs");
  const store = new AlertStore(config.alertsDb);
  try {
    const sub = pos[0] ?? "list";
    if (sub === "list") return out(store.listRules());
    if (sub === "add") {
      try {
        const rule = store.addRule({
          name: typeof flags.name === "string" ? flags.name : undefined,
          event: typeof flags.event === "string" ? flags.event : "",
          target: typeof flags.target === "string" ? flags.target : (flags.url ? "webhook" : "file"),
          url: typeof flags.url === "string" ? flags.url : null,
          path: typeof flags.path === "string" ? flags.path : null,
          secret: typeof flags.secret === "string" ? flags.secret : null,
          allowPrivate: flags["allow-private"] === true,
          countThreshold: Number(flags.count) || 1,
          minValue: flags["min-value"] == null ? null : Number(flags["min-value"]),
          windowS: Number(flags.window) || 3600,
          rateLimitS: flags["rate-limit"] == null ? 300 : Number(flags["rate-limit"]),
          enabled: !flags.disabled,
        });
        return out(rule);
      } catch (error) {
        return die(error.message);
      }
    }
    if (sub === "remove" || sub === "enable" || sub === "disable") {
      if (!pos[1]) return die(`Usage: aletheia alerts ${sub} <id>`);
      const id = Number(pos[1]);
      const result = sub === "remove" ? store.removeRule(id) : store.updateRule(id, { enabled: sub === "enable" });
      return out(result ?? { removed: false });
    }
    if (sub === "test") {
      if (!pos[1]) return die("Usage: aletheia alerts test <id>");
      const queued = store.testRule(Number(pos[1]));
      if (!queued) return die(`No alert rule #${pos[1]}.`);
      return out({ queued, ...(await deliverDue(store)) });
    }
    if (sub === "run") return out(await deliverDue(store));
    if (sub === "feed") return out(store.feed({ limit: Number(flags.limit) || 100 }));
    if (sub === "check") {
      const depth = queueDepth(hub);
      const failures = extractionFailures(hub);
      const queued = store.emit("queue.depth", { value: depth, detail: { depth } });
      if (failures) queued.push(...store.emit("extraction.failed", { value: failures, detail: { failures, window: "1h" } }));
      return out({ queueDepth: depth, failures, queued });
    }
    if (sub === "emit") {
      const event = pos[1];
      if (!event) return die("Usage: aletheia alerts emit <event> [--value n]");
      return out({ queued: store.emit(event, { value: flags.value == null ? null : Number(flags.value) }) });
    }
    return die("Usage: aletheia alerts add | list | remove <id> | enable|disable <id> | test <id> | run | feed | check | emit <event>");
  } finally {
    store.close();
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
      case "sync": {
        const { runSyncCommand } = await import("../src/hub/sync/cli.mjs");
        try {
          return out(await runSyncCommand({ config, flags, pos, out }));
        } catch (error) {
          return die(error.message);
        }
      }
      case "mcp-link": {
        const { runMcpLinkCommand } = await import("../src/hub/sync/cli.mjs");
        try {
          return out(await runMcpLinkCommand({ config, flags, pos }));
        } catch (error) {
          return die(error.message);
        }
      }
      case "team": return await runTeamCommand(flags, pos);
      case "service": {
        const { runServiceCommand } = await import("../src/service.mjs");
        try {
          return out(runServiceCommand({ config, flags, pos }));
        } catch (error) {
          return die(error.message);
        }
      }
      case "alerts": return await runAlertsCommand(flags, pos, hub);
      case "erase": {
        const { applyErase, erasePlan, formatEraseReport, loadEraseKey, readReceipt, receiptId, signReceipt, verifyReceipt, writePreEraseExport, writeReceipt } = await import("../src/hub/erasure.mjs");
        if (pos[0] === "verify") {
          const file = pos[1] ?? (typeof flags.receipt === "string" ? flags.receipt : null);
          if (!file) return die("Usage: aletheia erase verify <receipt.json>");
          const key = loadEraseKey(config.erasureKey, { create: false });
          const result = verifyReceipt(readReceipt(file), key);
          out(result.ok ? `ok ${file}` : `FAIL ${result.reason}`);
          if (!result.ok) process.exitCode = 1;
          return;
        }
        let before = null;
        if (flags.before) {
          before = Date.parse(String(flags.before));
          if (!Number.isFinite(before)) return die("--before needs a date, for example 2026-01-31.");
        }
        const idValues = flags.id == null ? [] : String(flags.id).split(",").map((value) => value.trim()).filter(Boolean);
        const plan = erasePlan(hub, { project: typeof flags.project === "string" ? flags.project : null, ids: idValues, before });
        out(formatEraseReport(plan));
        if (!flags.apply) return out("Report only. Add --apply to erase.");
        if (!plan.counts.memories && !plan.counts.observations && !plan.counts.episodes && !plan.counts.facts) {
          return out("Nothing matched; no export, no receipt, nothing deleted.");
        }
        const { SyncClient } = await import("../src/hub/sync/client.mjs");
        const { SyncStore } = await import("../src/hub/sync/store.mjs");
        const { TeamStore } = await import("../src/hub/team.mjs");
        let syncStore = null;
        let syncClient = null;
        let teamStore = null;
        if (existsSync(config.syncDb)) syncStore = new SyncStore(config.syncDb);
        if (existsSync(config.syncClientDb)) syncClient = new SyncClient(config.syncClientDb);
        if (existsSync(config.teamDb)) teamStore = new TeamStore(config.teamDb);
        try {
          const exportPath = typeof flags.export === "string" ? flags.export : join(config.erasureExportDir, `erase-${receiptId()}.jsonl`);
          writePreEraseExport(hub, { path: exportPath, project: plan.scope.project });
          out(`Pre-erase export: ${exportPath}`);
          const result = applyErase(hub, plan, {
            syncStore,
            syncClient,
            accountId: syncStore?.ensureAccount().id ?? null,
            teamStore,
            project: plan.scope.project,
          });
          const receipt = signReceipt(plan, { key: loadEraseKey(config.erasureKey), exports: [exportPath] });
          const receiptPath = typeof flags.receipt === "string" ? flags.receipt : join(config.erasureReceiptDir, `${receipt.id}.json`);
          writeReceipt(receipt, receiptPath);
          out(`Erased ${JSON.stringify(result.counts)}; sync entities purged ${result.sync.entities}, local sync rows ${result.sync.localRows}.`);
          out(`Receipt: ${receiptPath}\nVerify: aletheia erase verify ${receiptPath}`);
          return;
        } finally {
          syncClient?.close();
          syncStore?.close();
          teamStore?.close();
        }
      }
      case "audit": {
        const { readAudit } = await import("../src/hub/sync/cli.mjs");
        const rows = readAudit(config, Number(flags.limit) || 100);
        return out(rows.length ? rows.map((row) => `${new Date(row.ts).toISOString()}  ${row.action}  ${row.result}${row.device_id ? `  ${row.device_id}` : ""}${row.detail ? `  ${JSON.stringify(row.detail).slice(0, 120)}` : ""}`).join("\n") : "No sync audit entries.");
      }
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
        if (!flags.explain) return out(body);
        const reason = rows.length ? null : hub.searchDetailed({ query: pos.join(" "), project: flags.project, limit: Number(flags.limit) || 20, scope: flags.scope === "all" ? "all" : "current" }).reason;
        return out(`${body}${reason ? ` (${reason})` : ""}\n${formatChannels(channels)}`);
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
      case "dismiss": {
        const target = dismissTarget(pos[0]) ?? die("Usage: aletheia dismiss <id | memory:id | fact:id | observation:id | episode:id> [--reason r]");
        const result = hub.dismiss(target.type, target.id, { actor: "cli", reason: typeof flags.reason === "string" ? flags.reason : null });
        return out(result.changed ? `Dismissed ${result.type} #${result.id}. Restore with: aletheia restore ${result.type}:${result.id}` : `${result.type} #${result.id} was already dismissed.`);
      }
      case "restore": {
        const target = dismissTarget(pos[0]) ?? die("Usage: aletheia restore <id | memory:id | fact:id | observation:id | episode:id>");
        const result = hub.restore(target.type, target.id, { actor: "cli" });
        return out(result.restored ? `Restored ${result.type} #${result.id}.` : `${result.type} #${result.id} was not dismissed.`);
      }
      case "dismissed": {
        const rows = hub.dismissedList({ limit: Number(flags.limit) || 100 });
        return out(rows.length ? rows.map((row) => `${row.item_type}:${row.item_id}  ${new Date(row.at_epoch).toISOString()}${row.reason ? `  ${row.reason}` : ""}`).join("\n") : "No dismissed items.");
      }
      case "language": {
        if (pos[0] === "set") {
          const result = hub.setOutputLanguage(flags.project ?? "default", pos[1] ?? "", { actor: "cli" });
          return out(result.language ? `Output language for ${result.project}: ${result.language}` : `Cleared the output language for ${result.project}; it follows the extraction mode.`);
        }
        const map = hub.outputLanguageMap();
        return out(Object.keys(map).length ? Object.entries(map).map(([project, language]) => `${project.padEnd(24)} ${language}`).join("\n") : "No per-project output language; the extraction mode decides.");
      }
      case "promote": {
        if (!pos[0] || !pos[1]) return die("Usage: aletheia promote <memory|episode|observation|fact> <id>");
        return out(hub.promote(pos[0], Number(pos[1]), { actor: "cli" }));
      }
      case "optimize": return out(hub.optimizeFts());
      case "save": {
        const text = pos.join(" ");
        if (!text) die("Usage: aletheia save <text>");
        const r = hub.add({ project: flags.project ?? projectKeyForPath(process.cwd()), kind: "note", type: flags.type ?? "note", title: redact(text).slice(0, 100), narrative: redact(text), tool: flags.tool ?? "cli", pinned: !!flags.pin }, { actor: "cli" });
        return out(r.created ? `Saved as #${r.id}.` : `Already saved as #${r.id}.`);
      }
      case "import": {
        if (pos[0] === "transcripts") {
          const tool = pos[1];
          const since = typeof flags.since === "string" ? Date.parse(flags.since) : null;
          if (flags.since && !Number.isFinite(since)) return die("--since needs a date, for example 2026-01-31.");
          const { importTranscripts } = await import("../src/hub/transcripts.mjs");
          const result = importTranscripts(hub, { tool, home: config.home, since, dryRun: !!flags["dry-run"], limit: Number(flags.limit) || 20_000 });
          const verb = result.dryRun ? "Would import" : "Imported";
          return out(`${verb} ${result.added} episode(s) from ${result.files} file(s) for ${result.tool} (${result.skipped} already there, ${result.malformed} malformed line(s)); ${result.queued} extraction job(s) ${result.dryRun ? "would be queued" : "queued"}.`);
        }
        if (pos[0] === "claude-mem") return out(importClaudeMem(hub, flags.path ?? config.sourceDb, { includePrompts: !flags["no-prompts"], project: flags.project || null }));
        if (pos[0] === "bundle") return out(hub.importBundle(readFileSync(pos[1] ?? die("Usage: aletheia import bundle <file>"), "utf8")));
        return die("Usage: aletheia import claude-mem | bundle <file> | transcripts <claude-code|command-code> [--since DATE] [--dry-run]");
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
        if (sub === "lint") {
          const { lintRules, formatFindings } = await import("../src/hub/rule-lint.mjs");
          const dir = resolve(typeof flags.dir === "string" ? flags.dir : process.cwd());
          const ids = typeof flags.tools === "string" ? flags.tools.split(",").map((id) => id.trim()).filter(Boolean) : TOOLS.map((tool) => tool.id);
          const files = [];
          for (const id of ids) {
            if (!toolById(id)) return die(`Unknown tool: ${id}`);
            for (const scope of ["project", "global"]) {
              let path = null;
              try {
                path = targetPath(id, { scope, projectDir: scope === "project" ? dir : undefined, home: config.home });
              } catch {
                path = null;
              }
              if (path && existsSync(path)) files.push({ path, tool: id });
            }
          }
          const result = lintRules({ rules: hub.rules.list(), files });
          if (flags.json) return out(result);
          out(formatFindings(result.findings));
          if (result.findings.length) process.exitCode = 1;
          return;
        }
        return die("Usage: aletheia rules list | add <text> | lint | sync | import");
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
        const { AlertStore } = await import("../src/hub/alerts.mjs");
        const alerts = new AlertStore(config.alertsDb);
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
            store: hub, ask, config, embedder, alerts, intervalMs: Number(flags.interval) || 2000,
            onTick: (result) => { if (result?.processed) out(`processed ${result.processed} job(s), ${result.last?.facts ?? 0} new fact(s), ${result.last?.embedded ?? 0} embedded`); },
            onError: (error) => out(`worker error: ${error.message}`),
          });
          out(`Extraction worker running (${mode}${embedder ? `, embeddings ${embedder.model}` : ", keyword only"}); Ctrl-C to stop.`);
          await new Promise((resolve) => {
            for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { worker.stop(); alerts.close(); resolve(); });
          });
          return;
        }
        const result = await runWorker({ store: hub, ask, config, embedder, alerts });
        alerts.close();
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
