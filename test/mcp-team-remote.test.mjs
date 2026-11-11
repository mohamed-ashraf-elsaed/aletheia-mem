// The remote sync hub lists team_brief and team_search for a team member's token and keeps them inside that
// token's projects. A token that is not a team member still sees the 14 core tools.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-mcp-team-remote-"));
const ACCEPT = "application/json, text/event-stream";
let hub;
let account;
let owner;
let outsider;
let limited;

beforeAll(() => {
  hub = startSyncServer({ syncDb: join(temp, "sync.db"), host: "127.0.0.1", port: 0, name: "default", hubDb: join(temp, "hub.db") });
  account = hub.store.ensureAccount("default");
  const mint = (options) => hub.store.mintToken(account.id, options);
  owner = mint({ scope: "mcp", name: "owner" });
  const alpha = hub.team.createTeam(account.id, "alpha", { tokenId: owner.id });
  hub.team.addProject(account.id, alpha.id, owner.id, "site");
  hub.team.addProject(account.id, alpha.id, owner.id, "api");
  hub.team.addEntry(account.id, alpha.id, owner.id, { project: "site", kind: "fact", text: "The site ships with pnpm" });
  hub.team.addEntry(account.id, alpha.id, owner.id, { project: "api", kind: "fact", text: "The api ships with pnpm too" });
  limited = mint({ scope: "mcp", name: "limited", projects: ["site"] });
  hub.team.addMember(account.id, alpha.id, owner.id, { name: "limited", role: "owner", projects: [], memberTokenId: limited.id });
  outsider = mint({ scope: "mcp", name: "outsider" });
});

afterAll(() => {
  hub.stop();
  removeDir(temp, { recursive: true, force: true });
});

const rpc = async (token, message, session = null) => {
  const response = await fetch(`http://127.0.0.1:${hub.server.port}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: ACCEPT, Authorization: `Bearer ${token}`, ...(session ? { "Mcp-Session-Id": session } : {}) },
    body: JSON.stringify(message),
  });
  return { session: response.headers.get("mcp-session-id"), body: await response.json() };
};
const open = async (token) => (await rpc(token, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).session;
const tool = async (token, session, name, args) => (await rpc(token, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }, session)).body.result;

describe("remote hub team tools", () => {
  test("a team member's token lists both tools", async () => {
    const session = await open(owner.token);
    const tools = (await rpc(owner.token, { jsonrpc: "2.0", id: 2, method: "tools/list" }, session)).body.result.tools;
    expect(tools).toHaveLength(16);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["team_brief", "team_search"]));
  });

  test("a token that is not a team member sees 14 tools and cannot call them", async () => {
    const session = await open(outsider.token);
    const tools = (await rpc(outsider.token, { jsonrpc: "2.0", id: 2, method: "tools/list" }, session)).body.result.tools;
    expect(tools).toHaveLength(14);
    expect((await tool(outsider.token, session, "team_search", { query: "pnpm" })).isError).toBe(true);
  });

  test("a project-limited token gets no rows outside its projects", async () => {
    const session = await open(limited.token);
    const found = await tool(limited.token, session, "team_search", { query: "pnpm" });
    expect(found.content[0].text).toContain("The site ships with pnpm");
    expect(found.content[0].text).not.toContain("api ships");
    const brief = await tool(limited.token, session, "team_brief", { project: "api" });
    expect(brief.isError).toBe(true);
    expect(brief.content[0].text).toMatch(/not allowed for this token/);
    const named = await tool(limited.token, session, "team_search", { query: "pnpm", project: "api" });
    expect(named.isError).toBe(true);
  });

  test("the unlimited owner token reads both projects", async () => {
    const session = await open(owner.token);
    const text = (await tool(owner.token, session, "team_search", { query: "pnpm" })).content[0].text;
    expect(text).toContain("The site ships with pnpm");
    expect(text).toContain("The api ships with pnpm too");
  });
});
