// MCP server (JSON-RPC 2.0 over stdio, newline-delimited) so ANY MCP-capable tool can search, read and write
// the shared memory. Tools follow the token-efficient 3-layer pattern: search (index) -> timeline (context)
// -> get_observations (full text for chosen ids only).
import { VERSION } from "../lib/version.mjs";
import { projectKeyForPath } from "../readmodel/project.mjs";
import { wrapUntrusted } from "./untrusted.mjs";
import { redact } from "./capture.mjs";
import { searchPage } from "./lists.mjs";
import { earlierOf, epochOrIso, olderThanCutoff, pagingOf, whenOf } from "./paging.mjs";
import { checkEvidenceInput, describeRules, provenanceLine, recheckMarker } from "./rule-evidence.mjs";
import { readWorkStateList, writeWorkStateList } from "./work-state.mjs";
import { TOOL_DEFS } from "./mcp-tools.mjs";
export { TOOL_DEFS };

// Newest first. Per the spec: answer with the client's version if supported, else with our latest.
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];


const recalled = (t) => text(wrapUntrusted(t));
const text = (t) => ({ content: [{ type: "text", text: t }] });
const fail = (t) => ({ content: [{ type: "text", text: t }], isError: true });

const REASON = {
  no_terms: "The query had no searchable words.",
  no_rows: "The store has no memories yet.",
  filtered: "Memories exist, but the project/kind/type/tool filter or the query terms excluded all of them.",
};

function fmtIndex(rows) {
  if (!rows.length) return "No matches.";
  return rows.map((r) => `#${r.id} ${r.at.slice(0, 10)} [${r.type}] ${r.title}  (${r.project}, ${r.tool}${r.pinned ? ", pinned" : ""})`).join("\n");
}
function fmtFull(m) {
  const source = [m.tool, m.session_id ? `session ${m.session_id}` : null, m.origin ? `origin ${m.origin}` : null].filter(Boolean).join(", ");
  return [`#${m.id} [${m.type}] ${m.title}`, `${m.project} · ${new Date(m.created_at_epoch).toISOString()} · source: ${source}`, m.subtitle ?? "", m.narrative ?? "", m.facts.length ? `Facts: ${m.facts.join("; ")}` : "", m.files.length ? `Files: ${m.files.join(", ")}` : ""].filter(Boolean).join("\n");
}

/** Run one tool. `ctx`: { store, tool (the calling client), cwd, projects (allowed projects, null = all) }.
 *  Never throws: errors come back as isError results. */
export function callTool(name, args = {}, ctx) {
  const { store } = ctx;
  const allowed = ctx.projects?.length ? (project) => ctx.projects.includes(project) : null;
  const scopedProject = (project) => {
    if (allowed && project && !allowed(project)) return fail(`Project "${project}" is not allowed for this token.`);
    return null;
  };
  try {
    switch (name) {
      case "search": {
        if (typeof args.file === "string" && args.file.trim()) {
          const denied = scopedProject(args.project);
          if (denied) return denied;
          const pickProject = allowed ? (args.project ?? (ctx.projects.length === 1 ? ctx.projects[0] : undefined)) : args.project;
          const { items } = store.byFile({ file: args.file.trim(), project: pickProject, suffix: args.file_suffix === true, limit: args.limit ?? 20 });
          if (!items.length) return text(`No memories touch ${args.file_suffix === true ? "that suffix" : "that file"}.`);
          return recalled(items.map((m) => `#${m.id} ${new Date(m.created_at_epoch).toISOString().slice(0, 10)} [${m.type}] ${m.title}  (${m.project}, ${m.tool})`).join("\n"));
        }
        if (typeof args.query !== "string" || !args.query.trim()) return fail("query is required.");
        const paging = pagingOf({ limit: args.limit, offset: args.offset }, { limit: 20 });
        const order = ["relevance", "date_desc", "date_asc"].includes(args.order) ? args.order : "relevance";
        const since = whenOf(args.since);
        const until = earlierOf(whenOf(args.until, { end: true }), olderThanCutoff(args.older_than_days));
        const pickProject = allowed ? (args.project ?? (ctx.projects.length === 1 ? ctx.projects[0] : undefined)) : args.project;
        const page = searchPage(store, { query: args.query, project: pickProject, type: args.type, kind: args.kind, order, since, until, ...paging, scope: "current" });
        const facts = page.facts.filter((fact) => !allowed || allowed(fact.project));
        const index = page.results.filter((row) => !allowed || allowed(row.project));
        const factLines = facts.map((fact) => `fact #${fact.id} ${fact.text}${fact.source?.episodeId ? ` (episode #${fact.source.episodeId})` : ""}`);
        const memoryIndex = fmtIndex(index);
        if (!factLines.length && !index.length) {
          const detailed = store.searchDetailed({ query: args.query, project: pickProject, type: args.type, kind: args.kind, limit: paging.limit });
          const reason = detailed.reason ? (REASON[detailed.reason] ?? "filtered") : (allowed ? "filtered" : "");
          return text(`No matches. ${reason}`.trim());
        }
        return recalled([...factLines, memoryIndex].filter(Boolean).join("\n"));
      }
      case "timeline": {
        const denied = scopedProject(args.project);
        if (denied) return denied;
        const t = store.timeline({ anchor: args.anchor, query: args.query, project: args.project, before: args.before ?? 5, after: args.after ?? 5 });
        if (!t.anchor) return text("Nothing to anchor on.");
        const items = t.items.filter((m) => !allowed || allowed(m.project));
        if (!items.length || !items.some((m) => m.id === t.anchor)) return text("Nothing to anchor on.");
        return recalled(items.map((m) => `${m.id === t.anchor ? "→" : " "} #${m.id} ${new Date(m.created_at_epoch).toISOString().slice(0, 16)} [${m.type}] ${m.title}`).join("\n"));
      }
      case "get_observations": {
        if (!Array.isArray(args.ids) || !args.ids.length) return fail("ids is required (an array of numbers).");
        const rows = store.getMany(args.ids).filter((row) => !allowed || allowed(row.project));
        return rows.length ? recalled(rows.map(fmtFull).join("\n\n---\n\n")) : text("No memory has those ids.");
      }
      case "fact_history": {
        if (typeof args.subject !== "string" || !args.subject.trim()) return fail("subject is required.");
        const denied = scopedProject(args.project);
        if (denied) return denied;
        const subject = args.subject.trim();
        const project = args.project ?? null;
        const predicate = args.predicate ?? null;
        let rows;
        if (args.as_of != null) {
          const at = epochOrIso(args.as_of);
          if (at == null) return fail("as_of must be an ISO date or epoch ms.");
          rows = store.factsAsOf(at, { project, subject, predicate }).map((fact) => store.factHit(fact));
        } else if (args.include_superseded === true) {
          rows = store.factsHistory({ project, subject, predicate }).map((fact) => store.factHit(fact));
        } else {
          rows = store.factsCurrent({ project, subject, predicate }).map((fact) => store.factHit(fact));
        }
        if (!rows.length) return text(`No facts found for subject "${subject}".`);
        return recalled(rows.map((fact) => `#${fact.id} [${fact.status}] ${fact.text}${fact.validFrom || fact.validTo ? ` (${(fact.validFrom ?? "?").slice(0, 10)} → ${(fact.validTo ?? "now").slice(0, 10)})` : ""}`).join("\n"));
      }
      case "save_memory": {
        if (typeof args.text !== "string" || !args.text.trim()) return fail("text is required.");
        const body = redact(args.text);
        const project = args.project ?? (ctx.cwd ? projectKeyForPath(ctx.cwd) : "default");
        const denied = scopedProject(project);
        if (denied) return denied;
        const r = store.add({ project, kind: "note", type: args.type ?? "note", title: redact(args.title) || body.replace(/\s+/g, " ").slice(0, 100), narrative: body, tool: ctx.tool ?? "mcp", pinned: !!args.pinned }, { actor: ctx.tool ?? "mcp" });
        return text(r.created ? `Saved as #${r.id} in ${project}.` : `Already saved as #${r.id}.`);
      }
      case "session_start_context": {
        const denied = scopedProject(args.project);
        if (denied) return denied;
        const project = allowed ? (args.project ?? ctx.projects[0]) : args.project ?? (ctx.cwd ? projectKeyForPath(ctx.cwd) : undefined);
        return recalled(store.context({ project, limit: args.limit ?? 20, tool: ctx.tool }));
      }
      case "list_rules": {
        const rules = describeRules(store).filter((r) => r.enabled);
        return text(rules.length ? rules.map((r) => `- ${r.when ? `When ${r.when}: ` : ""}${r.then}  [${r.scopeTier === "everywhere" ? "everywhere" : r.scopeName}]  (id ${r.id}, ${provenanceLine(r)})${recheckMarker(r)}`).join("\n") : "No rules yet.");
      }
      case "add_rule": {
        const evidence = checkEvidenceInput(store, [
          ...(Array.isArray(args.evidence_memory_ids) ? args.evidence_memory_ids.map((id) => ({ kind: "memory", id })) : []),
          ...(Array.isArray(args.evidence_fact_ids) ? args.evidence_fact_ids.map((id) => ({ kind: "fact", id })) : []),
        ], { allowed });
        const r = store.rules.add({ then: args.then, when: args.when ?? "", scopeTier: args.scopeTier ?? "everywhere", scopeName: args.scopeName ?? "Everywhere", source: ctx.tool ?? "mcp", evidence });
        return text(r.created ? `Rule saved (${r.id}). The owner syncs rules to tools from the Rules page.` : `That rule already exists (${r.id}).`);
      }
      case "confirm_rule": {
        if (typeof args.id !== "string" || !args.id.trim()) return fail("id is required (a rule id from list_rules).");
        const done = store.rules.confirm(args.id.trim(), { actor: ctx.tool ?? "mcp" });
        if (!done) return fail(`No rule has the id ${args.id.trim()}.`);
        return text(`Confirmed rule ${done.id} on ${new Date(done.lastConfirmedEpoch).toISOString().slice(0, 10)}. It stays as it is; only the date it was last checked changed.`);
      }
      case "dismiss_memory": {
        if (!Number.isSafeInteger(Number(args.id))) return fail("id is required (a number).");
        const type = args.type ?? "memory";
        const r = store.dismiss(type, Number(args.id), { actor: ctx.tool ?? "mcp", reason: args.reason ?? null });
        return text(r.changed ? `Dismissed ${r.type} #${r.id}. It is hidden from search and context; restore_memory undoes this.` : `${r.type} #${r.id} was already dismissed.`);
      }
      case "restore_memory": {
        if (!Number.isSafeInteger(Number(args.id))) return fail("id is required (a number).");
        const type = args.type ?? "memory";
        const r = store.restore(type, Number(args.id), { actor: ctx.tool ?? "mcp" });
        return text(r.restored ? `Restored ${r.type} #${r.id}.` : `${r.type} #${r.id} was not dismissed.`);
      }
      case "work_state_write": {
        const denied = scopedProject(args.project);
        if (denied) return denied;
        const project = args.project ?? (ctx.cwd ? projectKeyForPath(ctx.cwd) : "default");
        const result = writeWorkStateList(store, { project, list: args.list, items: args.items, tool: ctx.tool ?? "mcp" });
        return text(result.created ? `Saved list "${result.list}" with ${result.items.length} item(s) as #${result.id}.` : `Updated list "${result.list}" (#${result.id}).`);
      }
      case "work_state_read": {
        const denied = scopedProject(args.project);
        if (denied) return denied;
        const project = args.project ?? (ctx.cwd ? projectKeyForPath(ctx.cwd) : "default");
        const row = readWorkStateList(store, { project, list: args.list });
        if (!row) return text(`No list named "${String(args.list ?? "").trim()}".`);
        return text(JSON.stringify(row.items));
      }
      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

/** Handle one JSON-RPC message. Returns a response object, or null for notifications. */
export function handleMessage(msg, ctx) {
  if (!msg || msg.jsonrpc !== "2.0") return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  const { id, method, params } = msg;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const error = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined) {
    if (method === "notifications/initialized") ctx.initialized = true;
    return null; // notifications get no response
  }
  switch (method) {
    case "initialize": {
      const wanted = params?.protocolVersion;
      ctx.tool = ctx.tool ?? params?.clientInfo?.name ?? "mcp";
      return reply({ protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "aletheia", version: VERSION }, instructions: "Shared, tool-neutral memory. Start with session_start_context, then search -> timeline -> get_observations. Use save_memory for decisions and gotchas worth keeping." });
    }
    case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOL_DEFS });
    case "tools/call": {
      if (!params?.name) return error(-32602, "Missing tool name");
      return reply(callTool(params.name, params.arguments ?? {}, ctx));
    }
    default: return error(-32601, `Method not found: ${method}`);
  }
}

/** Newline-delimited JSON-RPC over a readable/writable pair. */
export async function serveStdio({ store, input = process.stdin, output = process.stdout, tool = process.env.ALETHEIA_TOOL, cwd = process.env.ALETHEIA_CWD ?? process.cwd() }) {
  const ctx = { store, tool, cwd };
  let buffer = "";
  input.setEncoding("utf8");
  for await (const chunk of input) {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { output.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`); continue; }
      const responses = Array.isArray(msg) ? msg.map((m) => handleMessage(m, ctx)).filter(Boolean) : [handleMessage(msg, ctx)].filter(Boolean);
      for (const r of responses) output.write(`${JSON.stringify(r)}\n`);
    }
  }
}
