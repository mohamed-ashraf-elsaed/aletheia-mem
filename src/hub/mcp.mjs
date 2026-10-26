// MCP server (JSON-RPC 2.0 over stdio, newline-delimited) so ANY MCP-capable tool can search, read and write
// the shared memory. Tools follow the token-efficient 3-layer pattern: search (index) -> timeline (context)
// -> get_observations (full text for chosen ids only).
import { projectKeyForPath } from "../readmodel/project.mjs";
import { redact } from "./capture.mjs";

// Newest first. Per the spec: answer with the client's version if supported, else with our latest.
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const str = { type: "string" };
export const TOOL_DEFS = [
  { name: "search", description: "Step 1. Search shared memory. Returns a compact index of ids and titles (cheap). Then call timeline or get_observations for the ones that matter.", inputSchema: { type: "object", properties: { query: str, project: str, type: str, kind: str, limit: { type: "number" } }, required: ["query"] } },
  { name: "timeline", description: "Step 2. What happened around a memory (anchor id) or the best match for a query, in time order.", inputSchema: { type: "object", properties: { anchor: { type: "number" }, query: str, project: str, before: { type: "number" }, after: { type: "number" } } } },
  { name: "get_observations", description: "Step 3. Full text of memories by id. Always batch ids; fetch only what step 1 and 2 selected.", inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "number" } } }, required: ["ids"] } },
  { name: "save_memory", description: "Save something worth remembering across sessions and tools (a decision, a gotcha, a convention, a fix).", inputSchema: { type: "object", properties: { title: str, text: str, project: str, type: { type: "string", enum: ["decision", "gotcha", "bugfix", "feature", "refactor", "change", "discovery", "note"] }, pinned: { type: "boolean" } }, required: ["text"] } },
  { name: "session_start_context", description: "Pinned and recent memories plus standing rules for a project. Call at the start of a session.", inputSchema: { type: "object", properties: { project: str, limit: { type: "number" } } } },
  { name: "list_rules", description: "The owner's standing rules.", inputSchema: { type: "object", properties: {} } },
  { name: "add_rule", description: "Add a standing rule the owner wants every tool to follow. Only when the owner asked for it.", inputSchema: { type: "object", properties: { then: str, when: str, scopeTier: { type: "string", enum: ["everywhere", "project", "situation"] }, scopeName: str }, required: ["then"] } },
  { name: "dismiss_memory", description: "Hide a memory, observation or fact from search and context without deleting it. Reversible with restore_memory.", inputSchema: { type: "object", properties: { type: { type: "string", enum: ["memory", "observation", "fact", "episode"] }, id: { type: "number" }, reason: str }, required: ["id"] } },
  { name: "restore_memory", description: "Undo a dismissal. The item appears in search and context again.", inputSchema: { type: "object", properties: { type: { type: "string", enum: ["memory", "observation", "fact", "episode"] }, id: { type: "number" } }, required: ["id"] } },
];

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
  return [`#${m.id} [${m.type}] ${m.title}`, `${m.project} · ${m.tool} · ${new Date(m.created_at_epoch).toISOString()}`, m.subtitle ?? "", m.narrative ?? "", m.facts.length ? `Facts: ${m.facts.join("; ")}` : "", m.files.length ? `Files: ${m.files.join(", ")}` : ""].filter(Boolean).join("\n");
}

/** Run one tool. `ctx`: { store, tool (the calling client), cwd }. Never throws: errors come back as isError results. */
export function callTool(name, args = {}, ctx) {
  const { store } = ctx;
  try {
    switch (name) {
      case "search": {
        if (typeof args.query !== "string" || !args.query.trim()) return fail("query is required.");
        const limit = args.limit ?? 20;
        const facts = store.searchFacts({ query: args.query, project: args.project, limit: Math.min(limit, 10) });
        const factLines = facts.map((fact) => `fact #${fact.id} ${fact.text}${fact.source?.episodeId ? ` (episode #${fact.source.episodeId})` : ""}`);
        const detailed = store.searchDetailed({ query: args.query, project: args.project, type: args.type, kind: args.kind, limit });
        const index = store.search({ query: args.query, project: args.project, type: args.type, kind: args.kind, limit });
        const memoryIndex = fmtIndex(index);
        if (!factLines.length && !index.length) return text(`No matches. ${REASON[detailed.reason] ?? ""}`.trim());
        return text([...factLines, memoryIndex].filter(Boolean).join("\n"));
      }
      case "timeline": {
        const t = store.timeline({ anchor: args.anchor, query: args.query, project: args.project, before: args.before ?? 5, after: args.after ?? 5 });
        if (!t.anchor) return text("Nothing to anchor on.");
        return text(t.items.map((m) => `${m.id === t.anchor ? "→" : " "} #${m.id} ${new Date(m.created_at_epoch).toISOString().slice(0, 16)} [${m.type}] ${m.title}`).join("\n"));
      }
      case "get_observations": {
        if (!Array.isArray(args.ids) || !args.ids.length) return fail("ids is required (an array of numbers).");
        const rows = store.getMany(args.ids);
        return text(rows.length ? rows.map(fmtFull).join("\n\n---\n\n") : "No memory has those ids.");
      }
      case "save_memory": {
        if (typeof args.text !== "string" || !args.text.trim()) return fail("text is required.");
        const body = redact(args.text);
        const project = args.project ?? (ctx.cwd ? projectKeyForPath(ctx.cwd) : "default");
        const r = store.add({ project, kind: "note", type: args.type ?? "note", title: redact(args.title) || body.replace(/\s+/g, " ").slice(0, 100), narrative: body, tool: ctx.tool ?? "mcp", pinned: !!args.pinned }, { actor: ctx.tool ?? "mcp" });
        return text(r.created ? `Saved as #${r.id} in ${project}.` : `Already saved as #${r.id}.`);
      }
      case "session_start_context":
        return text(store.context({ project: args.project ?? (ctx.cwd ? projectKeyForPath(ctx.cwd) : undefined), limit: args.limit ?? 20, tool: ctx.tool }));
      case "list_rules": {
        const rules = store.rules.list().filter((r) => r.enabled);
        return text(rules.length ? rules.map((r) => `- ${r.when ? `When ${r.when}: ` : ""}${r.then}  [${r.scopeTier === "everywhere" ? "everywhere" : r.scopeName}]`).join("\n") : "No rules yet.");
      }
      case "add_rule": {
        const r = store.rules.add({ then: args.then, when: args.when ?? "", scopeTier: args.scopeTier ?? "everywhere", scopeName: args.scopeName ?? "Everywhere", source: ctx.tool ?? "mcp" });
        return text(r.created ? `Rule saved (${r.id}). The owner syncs rules to tools from the Rules page.` : `That rule already exists (${r.id}).`);
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
      return reply({ protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "aletheia", version: "0.1.0" }, instructions: "Shared, tool-neutral memory. Start with session_start_context, then search -> timeline -> get_observations. Use save_memory for decisions and gotchas worth keeping." });
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
