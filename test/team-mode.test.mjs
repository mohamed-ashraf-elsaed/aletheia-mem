// T-112: team mode on top of sync. A team has named projects, members (device tokens with owner/editor/viewer
// roles), shared memory, a board of pins and decisions, a rule-based brief and a shared search. Every ACL check
// runs in the store, so a direct store call is refused as well as an HTTP one. A revoked member or token loses
// access on the next call.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { TeamAccessError, TeamStore } from "../src/hub/team.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-team-"));
let sync;
let team;
let account;
let owner;
let editorSite;
let viewerSite;
let editorApi;
let teamAlpha;
let server;

const tokenActive = (id) => {
  const row = sync.db.prepare("SELECT revoked_at, expires_at FROM sync_token WHERE id = ?").get(Number(id));
  return !!row && !row.revoked_at && !(row.expires_at && row.expires_at < Date.now());
};

beforeAll(() => {
  sync = new SyncStore(join(temp, "sync.db"));
  account = sync.ensureAccount("default");
  team = new TeamStore(join(temp, "team.db"), { tokenActive });
  owner = sync.mintToken(account.id, { scope: "sync", name: "owner" }).id;
  teamAlpha = team.createTeam(account.id, "alpha", { tokenId: owner });
  team.addProject(account.id, teamAlpha.id, owner, "site");
  team.addProject(account.id, teamAlpha.id, owner, "api");
  editorSite = team.addMember(account.id, teamAlpha.id, owner, {
    name: "editor-site", role: "editor", projects: ["site"], memberTokenId: sync.mintToken(account.id, { scope: "sync", name: "editor-site" }).id,
  });
  viewerSite = team.addMember(account.id, teamAlpha.id, owner, {
    name: "viewer-site", role: "viewer", projects: ["site"], memberTokenId: sync.mintToken(account.id, { scope: "sync", name: "viewer-site" }).id,
  });
  editorApi = team.addMember(account.id, teamAlpha.id, owner, {
    name: "editor-api", role: "editor", projects: ["api"], memberTokenId: sync.mintToken(account.id, { scope: "sync", name: "editor-api" }).id,
  });
});

afterAll(() => {
  server?.stop();
  team.close();
  sync.close();
  rmSync(temp, { recursive: true, force: true });
});

describe("T-112: team mode", () => {
  test("the owner sees every project; a member sees only its shares", () => {
    const asOwner = team.listTeams(account.id, owner);
    expect(asOwner[0].role).toBe("owner");
    expect(asOwner[0].projects.sort()).toEqual(["api", "site"]);
    const asEditor = team.listTeams(account.id, editorSite.tokenId);
    expect(asEditor[0].projects).toEqual(["site"]);
  });

  test("(a) a viewer cannot write, and the store refuses it, not only a route", () => {
    expect(() => team.addEntry(account.id, teamAlpha.id, viewerSite.tokenId, { project: "site", kind: "fact", text: "viewer wrote this" }))
      .toThrow(TeamAccessError);
    try {
      team.addEntry(account.id, teamAlpha.id, viewerSite.tokenId, { project: "site", kind: "fact", text: "viewer wrote this" });
    } catch (error) {
      expect(error.code).toBe("viewer_read_only");
    }
  });

  test("(b) a member of project A cannot read project B", () => {
    team.addEntry(account.id, teamAlpha.id, owner, { project: "api", kind: "fact", text: "the api secret lives here" });
    expect(() => team.search(account.id, teamAlpha.id, editorSite.tokenId, { query: "secret", project: "api" })).toThrow(TeamAccessError);
    expect(team.search(account.id, teamAlpha.id, owner, { query: "secret", project: "api" }).results.length).toBe(1);
    // Cross-team reads fail in the store even when the project name matches.
    const betaOwner = sync.mintToken(account.id, { scope: "sync", name: "beta-owner" }).id;
    const other = team.createTeam(account.id, "beta", { tokenId: betaOwner });
    team.addProject(account.id, other.id, betaOwner, "api");
    expect(() => team.search(account.id, other.id, editorSite.tokenId, { query: "secret", project: "api" })).toThrow(TeamAccessError);
  });

  test("(c) a revoked member loses access on the next call", () => {
    const member = team.addMember(account.id, teamAlpha.id, owner, {
      name: "temp", role: "viewer", projects: ["site"], memberTokenId: sync.mintToken(account.id, { scope: "sync", name: "temp" }).id,
    });
    expect(team.board(account.id, teamAlpha.id, member.tokenId, {}).length).toBeGreaterThanOrEqual(0);
    team.revokeMember(account.id, teamAlpha.id, owner, member.id);
    expect(() => team.board(account.id, teamAlpha.id, member.tokenId, {})).toThrow(TeamAccessError);
  });

  test("a sync token revoked elsewhere fails the next team call", () => {
    const member = team.addMember(account.id, teamAlpha.id, owner, {
      name: "token-later", role: "editor", projects: ["site"], memberTokenId: sync.mintToken(account.id, { scope: "sync", name: "token-later" }).id,
    });
    sync.revokeToken(account.id, member.tokenId);
    try {
      team.board(account.id, teamAlpha.id, member.tokenId, {});
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error.code).toBe("token_revoked");
    }
  });

  test("the board records pins and decisions with author and time", () => {
    const entry = team.addBoardEntry(account.id, teamAlpha.id, editorSite.tokenId, {
      project: "site", kind: "decision", text: "Ship the login change on Friday", sourceType: "fact", sourceId: "42",
    });
    expect(entry.kind).toBe("decision");
    expect(entry.author.name).toBe("editor-site");
    expect(entry.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.source).toContain("fact#42");
    const board = team.board(account.id, teamAlpha.id, viewerSite.tokenId, { project: "site" });
    expect(board.some((row) => row.id === entry.id)).toBe(true);
  });

  test("the brief is rule-based, cites source ids and names no model", () => {
    team.addEntry(account.id, teamAlpha.id, editorSite.tokenId, {
      project: "site", kind: "fact", title: "Login", text: "Login uses a device token", sourceType: "fact", sourceId: "77",
    });
    const brief = team.brief(account.id, teamAlpha.id, viewerSite.tokenId, { project: "site" });
    expect(brief.text).toContain("No model");
    expect(brief.text).toContain("Login uses a device token");
    expect(brief.text).toContain("fact#77");
    expect(brief.text).toMatch(/team-entry#\d+/);
    expect(brief.sourceIds.length).toBeGreaterThan(0);
    expect(team.brief(account.id, teamAlpha.id, owner, { project: "site" }).text).toContain("Login uses a device token");
    expect(() => team.brief(account.id, teamAlpha.id, editorSite.tokenId, { project: "api" })).toThrow(TeamAccessError);
  });

  test("shared search respects project ACLs", () => {
    team.addEntry(account.id, teamAlpha.id, owner, { project: "site", kind: "fact", text: "deploy uses the blue pipeline" });
    team.addEntry(account.id, teamAlpha.id, owner, { project: "api", kind: "fact", text: "deploy uses the red pipeline" });
    const site = team.search(account.id, teamAlpha.id, editorSite.tokenId, { query: "deploy" });
    expect(site.results.length).toBe(1);
    expect(site.results[0].project).toBe("site");
    const seenByOwner = team.search(account.id, teamAlpha.id, owner, { query: "deploy" });
    expect(seenByOwner.results.map((row) => row.project).sort()).toEqual(["api", "site"]);
  });

  test("only an owner can manage the team", () => {
    expect(() => team.addProject(account.id, teamAlpha.id, editorSite.tokenId, "extra")).toThrow(TeamAccessError);
    expect(() => team.listMembers(account.id, teamAlpha.id, viewerSite.tokenId)).toThrow(TeamAccessError);
    expect(team.listMembers(account.id, teamAlpha.id, owner).length).toBeGreaterThanOrEqual(3);
  });

  test("leave tombstones the member's shared rows and removes its shares", () => {
    const leaving = team.addMember(account.id, teamAlpha.id, owner, {
      name: "leaver", role: "editor", projects: ["site"], memberTokenId: sync.mintToken(account.id, { scope: "sync", name: "leaver" }).id,
    });
    team.addEntry(account.id, teamAlpha.id, leaving.tokenId, { project: "site", kind: "fact", text: "the leaver wrote this line" });
    expect(team.search(account.id, teamAlpha.id, owner, { query: "leaver wrote" }).results.length).toBe(1);
    const result = team.leave(account.id, teamAlpha.id, leaving.tokenId);
    expect(result.tombstones).toBe(1);
    expect(team.search(account.id, teamAlpha.id, owner, { query: "leaver wrote" }).results.length).toBe(0);
    expect(() => team.board(account.id, teamAlpha.id, leaving.tokenId, {})).toThrow(TeamAccessError);
  });

  test("the HTTP routes run the same store checks (viewer 403, cross-project 403, revoke 401)", async () => {
    server = startSyncServer({ syncDb: join(temp, "route", "sync.db"), teamDb: join(temp, "route", "team.db"), port: 0, name: "default" });
    const admin = server.store.mintToken(server.store.ensureAccount("default").id, { scope: "admin", name: "admin" }).token;
    const call = (path, { method = "GET", body, token = admin } = {}) => fetch(`${server.url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const created = await call("/v1/team", { method: "POST", body: { name: "http-team" } });
    expect(created.status).toBe(201);
    const { id } = await created.json();
    expect((await call(`/v1/team/projects`, { method: "POST", body: { team_id: id, project: "site" } })).status).toBe(201);
    expect((await call(`/v1/team/projects`, { method: "POST", body: { team_id: id, project: "api" } })).status).toBe(201);
    const memberResponse = await call("/v1/team/members", { method: "POST", body: { team_id: id, name: "http-viewer", role: "viewer", projects: ["site"] } });
    expect(memberResponse.status).toBe(201);
    const { token: viewerToken } = await memberResponse.json();
    expect((await call("/v1/team/memory", { method: "POST", token: viewerToken, body: { team_id: id, project: "site", kind: "fact", text: "nope" } })).status).toBe(403);
    expect((await call("/v1/team/brief?team_id=" + id + "&project=api", { token: viewerToken })).status).toBe(403);
    const { members } = await (await call(`/v1/team/members?team_id=${id}`)).json();
    const viewer = members.find((row) => row.name === "http-viewer");
    expect((await call("/v1/team/members/revoke", { method: "POST", body: { team_id: id, member_id: viewer.id } })).status).toBe(200);
    expect((await call(`/v1/team/board?team_id=${id}`, { token: viewerToken })).status).toBe(401);
  });
});
