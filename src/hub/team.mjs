// Team mode: named projects, members that are device tokens with a role, shared memory, a board of
// pinned facts and decisions, a rule-based brief and shared search. Every access decision is made here, in the
// store, not only in an HTTP route. A member sees only the projects assigned to it; an owner sees the team's
// projects. Revoking a member or its sync token takes effect on the next call.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ftsQuery } from "./store.mjs";

export const TEAM_ROLES = ["owner", "editor", "viewer"];
const ENTRY_KINDS = ["memory", "fact", "note", "pin", "decision"];
const BOARD_KINDS = ["pin", "decision"];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS team (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(account_id, name)
);
CREATE TABLE IF NOT EXISTS team_project (
  team_id INTEGER NOT NULL,
  project TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(team_id, project)
);
CREATE TABLE IF NOT EXISTS team_member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  token_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(team_id, token_id)
);
CREATE TABLE IF NOT EXISTS team_share (
  team_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  project TEXT NOT NULL,
  PRIMARY KEY(team_id, member_id, project)
);
CREATE TABLE IF NOT EXISTS team_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  project TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_team_entry_project ON team_entry(team_id, project, created_at DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS team_entry_fts USING fts5(title, text, content='team_entry', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS team_entry_ai AFTER INSERT ON team_entry BEGIN
  INSERT INTO team_entry_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
END;
CREATE TRIGGER IF NOT EXISTS team_entry_ad AFTER DELETE ON team_entry BEGIN
  INSERT INTO team_entry_fts(team_entry_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
END;
CREATE TRIGGER IF NOT EXISTS team_entry_au AFTER UPDATE ON team_entry BEGIN
  INSERT INTO team_entry_fts(team_entry_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
  INSERT INTO team_entry_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
END;
CREATE TABLE IF NOT EXISTS team_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  token_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT,
  ts INTEGER NOT NULL
);
`;

export class TeamAccessError extends Error {
  constructor(message, code = "forbidden", status = 403) {
    super(message);
    this.name = "TeamAccessError";
    this.code = code;
    this.status = status;
  }
}

const text = (value, max) => String(value ?? "").slice(0, max);

export class TeamStore {
  /**
   * `tokenActive(tokenId)` is optional and closes the loop with Aletheia Sync: a token revoked in the sync
   * store must fail the next team call too. Without it, a member is still checked against its own revoked_at.
   */
  constructor(path, { tokenActive = null } = {}) {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec(SCHEMA);
    this.tokenActive = typeof tokenActive === "function" ? tokenActive : null;
  }

  close() {
    this.db.close();
  }

  audit(teamId, tokenId, action, detail = null) {
    this.db.prepare("INSERT INTO team_audit (team_id, token_id, action, detail, ts) VALUES (?,?,?,?,?)")
      .run(teamId == null ? null : Number(teamId), tokenId == null ? null : Number(tokenId), action, detail == null ? null : JSON.stringify(detail), Date.now());
  }

  // ---- teams and projects -----------------------------------------------------------------------

  createTeam(accountId, name, { tokenId = null, operator = false } = {}) {
    const label = text(name, 200).trim();
    if (!label) throw new RangeError("A team needs a name.");
    // A bearer-token caller owns the team it creates. The guarded local Hub UI has no token of its own, so it
    // records token id 0 as the owner seat; every real member still gets a device token.
    const ownerTokenId = operator ? 0 : Number(tokenId);
    if (!operator && !Number.isSafeInteger(ownerTokenId)) throw new RangeError("A team needs the token id of its first owner.");
    const existing = this.db.prepare("SELECT * FROM team WHERE account_id = ? AND name = ?").get(Number(accountId), label);
    if (existing) throw new RangeError(`Team "${label}" already exists.`);
    const now = Date.now();
    const info = this.db.prepare("INSERT INTO team (account_id, name, created_at) VALUES (?,?,?)").run(Number(accountId), label, now);
    const teamId = Number(info.lastInsertRowid);
    const member = this.db.prepare("INSERT INTO team_member (team_id, token_id, name, role, created_at) VALUES (?,?,?,?,?)").run(teamId, ownerTokenId, operator ? "hub-admin" : "owner", "owner", now);
    this.audit(teamId, ownerTokenId || null, "team.create", { name: label });
    return this.teamView(this.db.prepare("SELECT * FROM team WHERE id = ?").get(teamId), { operator, memberId: Number(member.lastInsertRowid) });
  }

  team(accountId, idOrName) {
    const value = String(idOrName ?? "");
    const byId = /^\d+$/.test(value) ? this.db.prepare("SELECT * FROM team WHERE account_id = ? AND id = ?").get(Number(accountId), Number(value)) : null;
    const row = byId ?? this.db.prepare("SELECT * FROM team WHERE account_id = ? AND name = ?").get(Number(accountId), value);
    if (!row) throw new TeamAccessError("That team does not exist.", "team_not_found", 404);
    return row;
  }

  projects(teamId) {
    return this.db.prepare("SELECT project FROM team_project WHERE team_id = ? ORDER BY project").all(Number(teamId)).map((row) => row.project);
  }

  addProject(accountId, teamId, tokenId, project, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    this.authorize(accountId, team.id, tokenId, null, "manage", { operator });
    const name = text(project, 200).trim();
    if (!name) throw new RangeError("A project needs a name.");
    this.db.prepare("INSERT OR IGNORE INTO team_project (team_id, project, created_at) VALUES (?,?,?)").run(team.id, name, Date.now());
    this.audit(team.id, tokenId, "project.add", { project: name });
    return { teamId: team.id, project: name, projects: this.projects(team.id) };
  }

  // ---- members and shares -----------------------------------------------------------------------

  memberRow(teamId, tokenId, { memberId = null } = {}) {
    if (memberId != null) return this.db.prepare("SELECT * FROM team_member WHERE team_id = ? AND id = ?").get(Number(teamId), Number(memberId)) ?? null;
    return this.db.prepare("SELECT * FROM team_member WHERE team_id = ? AND token_id = ?").get(Number(teamId), Number(tokenId)) ?? null;
  }

  shares(teamId, memberId) {
    return this.db.prepare("SELECT project FROM team_share WHERE team_id = ? AND member_id = ? ORDER BY project").all(Number(teamId), Number(memberId)).map((row) => row.project);
  }

  memberView(team) {
    return {
      id: team.id,
      name: team.name,
      role: team.role,
      projects: team.role === "owner" ? team.projects : team.projects,
      tokenId: team.tokenId,
      createdAt: new Date(team.created_at).toISOString(),
    };
  }

  /** The caller's memberships in this account. operators see every team as owner. */
  listTeams(accountId, tokenId, { operator = false } = {}) {
    if (operator) {
      return this.db.prepare("SELECT * FROM team WHERE account_id = ? ORDER BY name").all(Number(accountId)).map((row) => ({
        id: row.id, name: row.name, role: "owner", projects: this.projects(row.id), createdAt: new Date(row.created_at).toISOString(),
      }));
    }
    const rows = this.db.prepare("SELECT t.*, m.id AS member_id, m.token_id, m.role, m.revoked_at FROM team t JOIN team_member m ON m.team_id = t.id WHERE t.account_id = ? AND m.token_id = ? ORDER BY t.name").all(Number(accountId), Number(tokenId));
    return rows.filter((row) => !row.revoked_at && this.memberTokenActive(row.token_id, tokenId)).map((row) => ({
      id: row.id, name: row.name, role: row.role, projects: row.role === "owner" ? this.projects(row.id) : this.shares(row.id, row.member_id), createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  addMember(accountId, teamId, tokenId, { name, role = "viewer", projects = [], memberTokenId }, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    this.authorize(accountId, team.id, tokenId, null, "manage", { operator });
    if (!TEAM_ROLES.includes(role)) throw new RangeError(`role must be one of ${TEAM_ROLES.join(", ")}.`);
    if (!Number.isSafeInteger(Number(memberTokenId))) throw new RangeError("A member needs a device token id.");
    const known = new Set(this.projects(team.id));
    const assigned = [...new Set((Array.isArray(projects) ? projects : []).map((item) => String(item).trim()).filter(Boolean))];
    for (const project of assigned) if (!known.has(project)) throw new RangeError(`Project "${project}" is not part of this team.`);
    const now = Date.now();
    const info = this.db.prepare("INSERT INTO team_member (team_id, token_id, name, role, created_at) VALUES (?,?,?,?,?)")
      .run(team.id, Number(memberTokenId), text(name, 200) || `member-${memberTokenId}`, role, now);
    const memberId = Number(info.lastInsertRowid);
    for (const project of assigned) this.db.prepare("INSERT OR IGNORE INTO team_share (team_id, member_id, project) VALUES (?,?,?)").run(team.id, memberId, project);
    this.audit(team.id, tokenId, "member.add", { memberId, role, projects: assigned });
    return { id: memberId, tokenId: Number(memberTokenId), name: text(name, 200), role, projects: this.shares(team.id, memberId) };
  }

  listMembers(accountId, teamId, tokenId, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    this.authorize(accountId, team.id, tokenId, null, "manage", { operator });
    return this.db.prepare("SELECT * FROM team_member WHERE team_id = ? ORDER BY id").all(team.id).map((row) => ({
      id: row.id, name: row.name, role: row.role, tokenId: row.token_id, projects: row.role === "owner" ? this.projects(team.id) : this.shares(team.id, row.id),
      revoked: !!row.revoked_at, createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  revokeMember(accountId, teamId, tokenId, memberId, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    this.authorize(accountId, team.id, tokenId, null, "manage", { operator });
    const member = this.memberRow(team.id, null, { memberId });
    if (!member) throw new TeamAccessError("That member does not exist.", "member_not_found", 404);
    if (member.role === "owner") {
      const owners = this.db.prepare("SELECT COUNT(*) AS n FROM team_member WHERE team_id = ? AND role = 'owner' AND revoked_at IS NULL").get(team.id).n;
      if (owners <= 1) throw new TeamAccessError("The last owner cannot be revoked.", "last_owner", 400);
    }
    this.db.prepare("UPDATE team_member SET revoked_at = ? WHERE id = ?").run(Date.now(), member.id);
    this.db.prepare("DELETE FROM team_share WHERE team_id = ? AND member_id = ?").run(team.id, member.id);
    this.audit(team.id, tokenId, "member.revoke", { memberId: member.id, tokenId: member.token_id });
    return { id: member.id, tokenId: member.token_id, revoked: true };
  }

  setShares(accountId, teamId, tokenId, memberId, projects, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    this.authorize(accountId, team.id, tokenId, null, "manage", { operator });
    const member = this.memberRow(team.id, null, { memberId });
    if (!member) throw new TeamAccessError("That member does not exist.", "member_not_found", 404);
    if (member.role === "owner") throw new RangeError("An owner already sees every team project.");
    const known = new Set(this.projects(team.id));
    const assigned = [...new Set((Array.isArray(projects) ? projects : []).map((item) => String(item).trim()).filter(Boolean))];
    for (const project of assigned) if (!known.has(project)) throw new RangeError(`Project "${project}" is not part of this team.`);
    this.db.prepare("DELETE FROM team_share WHERE team_id = ? AND member_id = ?").run(team.id, member.id);
    for (const project of assigned) this.db.prepare("INSERT OR IGNORE INTO team_share (team_id, member_id, project) VALUES (?,?,?)").run(team.id, member.id, project);
    this.audit(team.id, tokenId, "member.share", { memberId: member.id, projects: assigned });
    return { id: member.id, projects: this.shares(team.id, member.id) };
  }

  leave(accountId, teamId, tokenId, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    const member = this.authorize(accountId, team.id, tokenId, null, "read", { operator });
    const now = Date.now();
    const pending = this.db.prepare("SELECT COUNT(*) AS n FROM team_entry WHERE team_id = ? AND member_id = ? AND deleted_at IS NULL").get(team.id, member.id).n;
    if (pending) this.db.prepare("UPDATE team_entry SET deleted_at = ? WHERE team_id = ? AND member_id = ? AND deleted_at IS NULL").run(now, team.id, member.id);
    this.db.prepare("DELETE FROM team_share WHERE team_id = ? AND member_id = ?").run(team.id, member.id);
    this.db.prepare("UPDATE team_member SET revoked_at = ? WHERE id = ?").run(now, member.id);
    this.audit(team.id, tokenId, "member.leave", { memberId: member.id, entries: pending });
    return { left: true, tombstones: pending, memberId: member.id };
  }

  // ---- access control ---------------------------------------------------------------------------

  memberTokenActive(memberTokenId, actorTokenId) {
    if (Number(memberTokenId) !== Number(actorTokenId)) return false;
    return this.tokenActive ? this.tokenActive(memberTokenId) : true;
  }

  /**
   * The one place that decides access. `action` is read, write or manage. Operators are the guarded local
   * Hub UI/admin session; a bearer-token call never sets it.
   */
  authorize(accountId, teamId, tokenId, project, action, { operator = false } = {}) {
    const team = this.team(accountId, teamId);
    if (operator) {
      if (project != null) {
        if (!this.projects(team.id).includes(String(project))) throw new TeamAccessError(`Project "${project}" is not part of this team.`, "project_not_found", 404);
      }
      return { team, id: null, token_id: null, role: "owner", operator: true };
    }
    if (!Number.isSafeInteger(Number(tokenId))) throw new TeamAccessError("A team call needs a member token.", "token_required", 401);
    const member = this.memberRow(team.id, tokenId);
    if (!member) throw new TeamAccessError("This token is not a member of the team.", "not_member");
    if (member.revoked_at) throw new TeamAccessError("This member was revoked.", "member_revoked", 401);
    if (this.tokenActive && !this.tokenActive(member.token_id)) throw new TeamAccessError("This token was revoked.", "token_revoked", 401);
    if (action === "manage" && member.role !== "owner") throw new TeamAccessError("Only an owner can manage this team.", "owner_required");
    const allowed = member.role === "owner" ? this.projects(team.id) : this.shares(team.id, member.id);
    if (project != null && !allowed.includes(String(project))) throw new TeamAccessError(`This member cannot access project "${project}".`, "project_forbidden");
    if (action === "write" && member.role === "viewer") throw new TeamAccessError("A viewer cannot write.", "viewer_read_only");
    return { team, ...member, allowed };
  }

  // ---- shared memory and the board --------------------------------------------------------------

  addEntry(accountId, teamId, tokenId, { project, kind = "memory", title = "", text: body, sourceType = null, sourceId = null }, { operator = false } = {}) {
    const access = this.authorize(accountId, teamId, tokenId, project, "write", { operator });
    if (!ENTRY_KINDS.includes(kind)) throw new RangeError(`kind must be one of ${ENTRY_KINDS.join(", ")}.`);
    const content = text(body, 20_000).trim();
    if (!content) throw new RangeError("A shared entry needs text.");
    const now = Date.now();
    const info = this.db.prepare("INSERT INTO team_entry (team_id, project, member_id, kind, title, text, source_type, source_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(access.team.id, String(project), access.id ?? 0, kind, text(title, 400), content, sourceType == null ? null : text(sourceType, 40), sourceId == null ? null : text(sourceId, 200), now);
    this.audit(access.team.id, access.token_id, `entry.${kind}`, { id: Number(info.lastInsertRowid), project });
    return this.entryView(this.db.prepare("SELECT * FROM team_entry WHERE id = ?").get(Number(info.lastInsertRowid)), access.team, access);
  }

  addBoardEntry(accountId, teamId, tokenId, { project, kind, text: body, sourceType = null, sourceId = null }, { operator = false } = {}) {
    if (!BOARD_KINDS.includes(kind)) throw new RangeError(`A board entry is a pin or a decision.`);
    return this.addEntry(accountId, teamId, tokenId, { project, kind, title: "", text: body, sourceType, sourceId }, { operator });
  }

  entryView(row, team, access = null) {
    const author = this.db.prepare("SELECT id, name, role FROM team_member WHERE id = ?").get(Number(row.member_id));
    return {
      id: row.id, team: team.name, project: row.project, kind: row.kind, title: row.title, text: row.text,
      sourceType: row.source_type, sourceId: row.source_id,
      author: author ? { id: author.id, name: author.name, role: author.role } : { id: row.member_id, name: "unknown", role: "unknown" },
      source: `team-entry#${row.id}${row.source_type ? ` (${row.source_type}#${row.source_id ?? "-"})` : ""}`,
      at: new Date(row.created_at).toISOString(),
      role: access?.role ?? null,
    };
  }

  board(accountId, teamId, tokenId, { project = null } = {}, { operator = false } = {}) {
    const access = this.authorize(accountId, teamId, tokenId, project, "read", { operator });
    const allowed = access.role === "owner" && !access.operator ? this.projects(access.team.id) : access.allowed ?? this.projects(access.team.id);
    const where = ["team_id = ?", "deleted_at IS NULL", "kind IN ('pin','decision')"];
    const params = [access.team.id];
    if (project != null) { where.push("project = ?"); params.push(String(project)); }
    else if (!access.operator) { where.push(`project IN (${allowed.map(() => "?").join(",") || "''"})`); params.push(...allowed); }
    return this.db.prepare(`SELECT * FROM team_entry WHERE ${where.join(" AND ")} ORDER BY kind = 'decision' DESC, created_at DESC, id DESC LIMIT 500`)
      .all(...params).map((row) => this.entryView(row, access.team, access));
  }

  /**
   * Rule-based brief: current shared facts in the window plus open decisions, each line naming the entry and
   * the source it came from. No model is called and the character budget is enforced after assembly.
   */
  brief(accountId, teamId, tokenId, { project, days = 14, maxChars = 2000, now = Date.now() } = {}, { operator = false } = {}) {
    if (!project) throw new RangeError("A brief needs a project.");
    const access = this.authorize(accountId, teamId, tokenId, project, "read", { operator });
    const since = Number(now) - Math.max(1, Number(days) || 14) * 24 * 60 * 60_000;
    const facts = this.db.prepare("SELECT * FROM team_entry WHERE team_id = ? AND project = ? AND kind = 'fact' AND deleted_at IS NULL AND created_at >= ? ORDER BY created_at DESC, id DESC")
      .all(access.team.id, String(project), since).map((row) => this.entryView(row, access.team, access));
    const decisions = this.db.prepare("SELECT * FROM team_entry WHERE team_id = ? AND project = ? AND kind = 'decision' AND deleted_at IS NULL AND created_at >= ? ORDER BY created_at DESC, id DESC")
      .all(access.team.id, String(project), since).map((row) => this.entryView(row, access.team, access));
    const lines = [
      `# ${access.team.name} brief: ${project}`,
      "",
      "Information only, built from shared facts and board decisions. No model generated this text.",
      "",
      `Shared facts: ${facts.length} in the last ${Number(days) || 14} day(s). Decisions: ${decisions.length}.`,
    ];
    if (decisions.length) {
      lines.push("", "## Decisions");
      for (const entry of decisions) lines.push(`- ${entry.text} [${entry.source}; author ${entry.author.name}; ${entry.at.slice(0, 10)}]`);
    }
    if (facts.length) {
      lines.push("", "## Facts");
      for (const entry of facts) lines.push(`- ${entry.text} [${entry.source}; author ${entry.author.name}; ${entry.at.slice(0, 10)}]`);
    }
    if (!facts.length && !decisions.length) lines.push("", "Nothing shared for this project in the window.");
    let body = lines.join("\n");
    if (body.length > maxChars) body = `${body.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
    return { team: access.team.name, project: String(project), text: body, facts: facts.map((entry) => entry.id), decisions: decisions.map((entry) => entry.id), sourceIds: [...decisions, ...facts].map((entry) => entry.source) };
  }

  search(accountId, teamId, tokenId, { query, project = null, limit = 20 } = {}, { operator = false } = {}) {
    const access = this.authorize(accountId, teamId, tokenId, project, "read", { operator });
    const expr = ftsQuery(query);
    if (!expr) return { results: [], reason: "no_terms" };
    const allowed = access.role === "owner" ? this.projects(access.team.id) : access.allowed;
    const where = ["e.team_id = ?", "e.deleted_at IS NULL", "team_entry_fts MATCH ?"];
    const params = [access.team.id, expr];
    if (project != null) { where.push("e.project = ?"); params.push(String(project)); }
    else if (!access.operator) { where.push(`e.project IN (${allowed.map(() => "?").join(",") || "''"})`); params.push(...allowed); }
    const rows = this.db.prepare(`SELECT e.* FROM team_entry_fts CROSS JOIN team_entry e ON e.id = team_entry_fts.rowid WHERE ${where.join(" AND ")} ORDER BY bm25(team_entry_fts) LIMIT ?`)
      .all(...params, Math.min(Math.max(Number(limit) || 20, 1), 200));
    return { results: rows.map((row) => this.entryView(row, access.team, access)), reason: rows.length ? null : "no_match" };
  }

  // ---- views ------------------------------------------------------------------------------------

  teamView(row, { tokenId = null, operator = false, memberId = null } = {}) {
    const member = memberId != null ? this.db.prepare("SELECT * FROM team_member WHERE id = ?").get(Number(memberId)) : null;
    const role = member?.role ?? (operator ? "owner" : null);
    return {
      id: row.id,
      name: row.name,
      role,
      projects: role === "owner" ? this.projects(row.id) : member ? this.shares(row.id, member.id) : [],
      members: this.db.prepare("SELECT COUNT(*) AS n FROM team_member WHERE team_id = ? AND revoked_at IS NULL").get(row.id).n,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  auditLog(teamId, limit = 100) {
    return this.db.prepare("SELECT * FROM team_audit WHERE team_id = ? ORDER BY id DESC LIMIT ?").all(Number(teamId), Math.min(Math.max(Number(limit) || 100, 1), 500))
      .map((row) => ({ ...row, detail: row.detail ? JSON.parse(row.detail) : null }));
  }
}
