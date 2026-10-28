// Shared team HTTP actions. Both `/v1/team/*` (bearer token, remote or CLI) and `/api/hub/team/*`
// (the guarded local Hub UI, operator) call this one handler, so the same store-layer ACL runs for both.
import { TeamAccessError } from "./team.mjs";

const ok = (body, status = 200) => ({ status, body });
const bad = (message, status = 400) => ({ status, body: { error: message } });

const teamIdOf = (body, query) => body?.team_id ?? body?.team ?? query?.get("team_id") ?? query?.get("team") ?? null;
const projectList = (value) => (Array.isArray(value) ? value : typeof value === "string" && value ? value.split(",") : []).map((item) => String(item).trim()).filter(Boolean);

/**
 * `path` is the part after the team prefix ("" or "/status", "/board", ...). `operator` is only true for the
 * guarded local Hub UI/admin session. Returns {status, body}, or null when the path is not a team path.
 */
export function teamRequest({ path = "/", method = "GET", url = null, body = null, team, sync = null, accountId, tokenId = null, operator = false }) {
  const query = url?.searchParams ?? new URLSearchParams();
  try {
    if (path === "" || path === "/") {
      if (method === "GET") return ok({ teams: team.listTeams(accountId, tokenId, { operator }) });
      if (method === "POST") {
        if (!body || typeof body.name !== "string" || !body.name.trim()) return bad("name is required.");
        return ok(team.createTeam(accountId, body.name, { tokenId, operator }), 201);
      }
      return bad("Use GET or POST.", 405);
    }

    if (path === "/projects") {
      if (method === "GET") {
        const id = teamIdOf(body, query);
        return ok({ projects: team.projects(team.team(accountId, id).id) });
      }
      if (method === "POST") {
        if (!body || typeof body.project !== "string" || !body.project.trim()) return bad("project is required.");
        return ok(team.addProject(accountId, teamIdOf(body, query), tokenId, body.project, { operator }), 201);
      }
      return bad("Use GET or POST.", 405);
    }

    if (path === "/members") {
      const id = teamIdOf(body, query);
      if (method === "GET") return ok({ members: team.listMembers(accountId, id, tokenId, { operator }) });
      if (method === "POST") {
        if (!body || typeof body.name !== "string" || !body.name.trim()) return bad("name is required.");
        let memberTokenId = Number(body.token_id);
        let rawToken = null;
        if (!Number.isSafeInteger(memberTokenId) || memberTokenId <= 0) {
          if (!sync) return bad("token_id is required when no sync store is available.");
          const minted = sync.mintToken(accountId, { scope: "sync", name: body.name.trim() });
          memberTokenId = minted.id;
          rawToken = minted.token;
        }
        const member = team.addMember(accountId, id, tokenId, {
          name: body.name,
          role: body.role ?? "viewer",
          projects: projectList(body.projects ?? body.project),
          memberTokenId,
        }, { operator });
        if (sync) sync.audit(accountId, { tokenId, action: "team.member.add", detail: { team: id, memberId: member.id, role: member.role } });
        return ok({ member, token: rawToken }, 201);
      }
      return bad("Use GET or POST.", 405);
    }

    if (path === "/members/revoke" && method === "POST") {
      if (!body || body.member_id == null) return bad("member_id is required.");
      const revoked = team.revokeMember(accountId, teamIdOf(body, query), tokenId, body.member_id, { operator });
      // A revoked member is a revoked device token: the next call anywhere answers 401.
      if (sync && Number(revoked.tokenId) > 0) sync.revokeToken(accountId, revoked.tokenId);
      if (sync) sync.audit(accountId, { tokenId, action: "team.member.revoke", detail: { memberId: revoked.id, tokenId: revoked.tokenId } });
      return ok(revoked);
    }

    if (path === "/shares" && method === "POST") {
      if (!body || body.member_id == null) return bad("member_id is required.");
      return ok(team.setShares(accountId, teamIdOf(body, query), tokenId, body.member_id, projectList(body.projects ?? body.project), { operator }));
    }

    if (path === "/board") {
      const id = teamIdOf(body, query);
      if (method === "GET") return ok({ entries: team.board(accountId, id, tokenId, { project: query.get("project") ?? null }, { operator }) });
      if (method === "POST") {
        if (!body || !["pin", "decision"].includes(body.kind)) return bad("kind must be pin or decision.");
        if (typeof body.text !== "string" || !body.text.trim()) return bad("text is required.");
        if (typeof body.project !== "string" || !body.project.trim()) return bad("project is required.");
        return ok(team.addBoardEntry(accountId, id, tokenId, {
          project: body.project, kind: body.kind, text: body.text, sourceType: body.source_type ?? null, sourceId: body.source_id ?? null,
        }, { operator }), 201);
      }
      return bad("Use GET or POST.", 405);
    }

    if (path === "/memory" && method === "POST") {
      if (!body || typeof body.project !== "string" || !body.project.trim()) return bad("project is required.");
      if (typeof body.text !== "string" || !body.text.trim()) return bad("text is required.");
      return ok(team.addEntry(accountId, teamIdOf(body, query), tokenId, {
        project: body.project, kind: body.kind ?? "memory", title: body.title ?? "", text: body.text,
        sourceType: body.source_type ?? null, sourceId: body.source_id ?? null,
      }, { operator }), 201);
    }

    if (path === "/brief" && method === "GET") {
      const project = query.get("project");
      if (!project) return bad("project is required.");
      return ok(team.brief(accountId, teamIdOf(null, query), tokenId, {
        project, days: query.get("days") ?? undefined, maxChars: query.get("maxChars") ?? undefined,
      }, { operator }));
    }

    if (path === "/search") {
      if (method !== "POST") return bad("Use POST.", 405);
      if (!body || typeof body.query !== "string" || !body.query.trim()) return bad("query is required.");
      return ok(team.search(accountId, teamIdOf(body, query), tokenId, {
        query: body.query, project: body.project ?? null, limit: body.limit ?? 20,
      }, { operator }));
    }

    if (path === "/leave" && method === "POST") {
      const left = team.leave(accountId, teamIdOf(body, query), tokenId, { operator });
      if (sync && Number(tokenId) > 0) sync.revokeToken(accountId, tokenId);
      return ok(left);
    }

    if (path === "/audit" && method === "GET") {
      const id = team.team(accountId, teamIdOf(body, query)).id;
      team.authorize(accountId, id, tokenId, null, "manage", { operator });
      return ok({ audit: team.auditLog(id, Number(query.get("limit")) || 100) });
    }

    return null;
  } catch (error) {
    if (error instanceof TeamAccessError) return { status: error.status, body: { error: error.message, code: error.code } };
    if (error instanceof RangeError) return bad(error.message);
    throw error;
  }
}
