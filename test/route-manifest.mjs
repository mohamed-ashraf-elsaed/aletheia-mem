// The route manifest: one row per documented route in docs/03-http-api.md and the docs/06-frontend.md
// paging table. `path` is the concrete URL the contract test fetches; `template` is the OpenAPI path (path parameters
// written as {name}); `keys` are the response fields the contract test requires for a JSON 200/201. The OpenAPI checker
// walks this list and asserts every (template, method) is present in docs/openapi.json.
const R = (method, path, { template = path, status = 200, type = "json", keys = [], body = null } = {}) => ({ method, path, template, status, type, keys, body });

export const ROUTES = [
  // docs/03 §3.2 static, health and the work-view API
  R("GET", "/", { type: "html" }),
  R("GET", "/index.html", { type: "html" }),
  R("GET", "/work-view/work.html", { template: "/work-view/{file}", type: "html" }),
  R("GET", "/health", { keys: ["status", "timestamp"] }),
  R("GET", "/api/work-view", { keys: ["version", "generatedAt", "agents", "humanRequests", "revision", "source"] }),
  R("GET", "/api/work-view/events", { type: "sse" }),
  R("GET", "/api/work-view/evidence/prompt/1", { template: "/api/work-view/evidence/{kind}/{id}", keys: ["kind"] }),
  R("GET", "/api/work-view/file/observation/1/0", { template: "/api/work-view/file/{kind}/{id}/{index}", status: 404, keys: ["error"] }),
  R("POST", "/api/work-view/review", { status: 404, keys: ["error"], body: { requestId: "nope", expectedFingerprint: "0".repeat(64), checked: false } }),
  R("POST", "/api/work-view/rules", { keys: ["version", "rules"], body: { action: "add", rule: { scopeTier: "everywhere", scopeName: "", when: "", then: "contract test rule" } } }),
  R("POST", "/api/work-view/agents/mark-finished", { status: 404, keys: ["error"], body: { agentGroupId: "ghost" } }),
  R("POST", "/api/work-view/rules/load-in-claude-code", { keys: ["version", "rulesFile"], body: {} }),
  R("POST", "/api/work-state/entries", { type: "text", body: { cwd: "@FIXTURE_DIR", list: "scratch", fields: { task: "contract" } } }),
  R("GET", "/api/setup/state", { keys: ["status"] }),
  R("GET", "/api/setup/scan", { keys: ["phase", "done", "agents"] }),
  R("POST", "/api/setup/choice", { template: "/api/setup/{step}", status: 404, keys: ["error"], body: { branch: "home" } }),

  // docs/03 §3.4 team mode (guarded local operator routes)
  R("GET", "/api/hub/team", { keys: ["teams"] }),
  R("POST", "/api/hub/team", { status: 201, body: { name: "Contract Team" } }),
  R("GET", "/api/hub/team/projects?team_id=ghost", { template: "/api/hub/team/projects", status: 404, keys: ["error"] }),
  R("POST", "/api/hub/team/projects", { status: 404, keys: ["error"], body: { team_id: "ghost", project: "p" } }),
  R("GET", "/api/hub/team/members?team_id=ghost", { template: "/api/hub/team/members", status: 404, keys: ["error"] }),
  R("POST", "/api/hub/team/members", { status: 404, keys: ["error"], body: { team_id: "ghost", name: "n" } }),
  R("POST", "/api/hub/team/members/revoke", { status: 404, keys: ["error"], body: { team_id: "ghost", member_id: 1 } }),
  R("POST", "/api/hub/team/shares", { status: 404, keys: ["error"], body: { team_id: "ghost", member_id: 1, projects: [] } }),
  R("GET", "/api/hub/team/board?team_id=ghost", { template: "/api/hub/team/board", status: 404, keys: ["error"] }),
  R("POST", "/api/hub/team/board", { status: 404, keys: ["error"], body: { team_id: "ghost", kind: "pin", text: "x", project: "p" } }),
  R("POST", "/api/hub/team/memory", { status: 404, keys: ["error"], body: { team_id: "ghost", project: "p", text: "x" } }),
  R("GET", "/api/hub/team/brief?team_id=ghost&project=p", { template: "/api/hub/team/brief", status: 404, keys: ["error"] }),
  R("POST", "/api/hub/team/search", { status: 404, keys: ["error"], body: { team_id: "ghost", query: "x" } }),
  R("POST", "/api/hub/team/leave", { status: 404, keys: ["error"], body: { team_id: "ghost" } }),
  R("GET", "/api/hub/team/audit?team_id=ghost", { template: "/api/hub/team/audit", status: 404, keys: ["error"] }),

  // docs/03 §3.5 erasure
  R("POST", "/api/hub/erasure/report", { keys: ["plan"], body: { project: "p" } }),
  R("POST", "/api/hub/erasure/apply", { keys: ["plan", "erased"], body: { before: 0 } }),
  R("POST", "/api/hub/erasure/verify", { status: 400, keys: ["ok"], body: { receipt: {} } }),

  // docs/03 §3.6 alerts
  R("GET", "/api/hub/alerts/rules", { keys: ["rules"] }),
  R("POST", "/api/hub/alerts/rules", { status: 201, keys: ["rule"], body: { name: "contract", event: "queue.depth", target: "file", path: "@FIXTURE_DIR/alerts.log" } }),
  R("PATCH", "/api/hub/alerts/rules/999999", { template: "/api/hub/alerts/rules/{id}", status: 404, keys: ["error"], body: { enabled: false } }),
  R("DELETE", "/api/hub/alerts/rules/999999", { template: "/api/hub/alerts/rules/{id}", status: 404, keys: ["error"] }),
  R("GET", "/api/hub/alerts/feed", { keys: ["deliveries", "total"] }),
  R("POST", "/api/hub/alerts/test", { status: 404, keys: ["error"], body: { id: 999999 } }),
  R("POST", "/api/hub/alerts/run", { body: {} }),
  R("POST", "/api/hub/alerts/check", { keys: ["queueDepth", "failures", "queued"], body: {} }),

  // docs/03 §3.7 requests, goals, story and economics
  R("GET", "/v1/work/requests", { keys: ["requests", "counts"] }),
  R("GET", "/v1/work/requests/aaaaaaaaaaaaaaaa", { template: "/v1/work/requests/{id}", status: 404, keys: ["error"] }),
  R("GET", "/v1/work/story", { keys: ["counts", "velocity", "learned"] }),
  R("GET", "/v1/work/goals", { keys: ["goals"] }),
  R("GET", "/v1/context/economics", { keys: ["observations", "totals"] }),
  R("POST", "/api/hub/requests/aaaaaaaaaaaaaaaa", { template: "/api/hub/requests/{id}", keys: ["id", "action", "dismissed"], body: { action: "dismiss" } }),
  R("GET", "/api/hub/rule-suggestions", { keys: ["total", "items"] }),
  R("POST", "/api/hub/rule-suggestions/999999", { template: "/api/hub/rule-suggestions/{id}", status: 404, keys: ["error"], body: { action: "approve" } }),
  R("POST", "/api/hub/rules/ghost/toggle", { template: "/api/hub/rules/{id}/toggle", status: 404, keys: ["error"], body: { enabled: true } }),
  R("POST", "/api/hub/rules/ghost/replace", { template: "/api/hub/rules/{id}/replace", status: 404, keys: ["error"], body: { then: "x" } }),
  R("GET", "/api/hub/rules", { keys: ["rules", "reviewDays"] }),
  R("GET", "/api/hub/rules/diff", { keys: ["files", "outOfSync", "checked"] }),
  R("POST", "/api/hub/rules/ghost/confirm", { template: "/api/hub/rules/{id}/confirm", status: 404, keys: ["error"], body: {} }),
  R("GET", "/api/hub/rules/learning-run", { keys: ["learningRun"] }),
  R("POST", "/api/hub/rules/learning-run", { keys: ["learningRun", "result"], body: {} }),

  // docs/06 §6.3 paging table
  R("GET", "/api/hub/memories", { keys: ["total", "limit", "offset", "hasMore", "items"] }),
  R("GET", "/api/hub/facts", { keys: ["total", "limit", "offset", "hasMore", "items"] }),
  R("GET", "/api/hub/review", { keys: ["items", "total", "limit", "offset", "hasMore"] }),
  R("GET", "/api/hub/dismissed", { keys: ["total", "items"] }),
  R("GET", "/api/hub/audit", { keys: ["total", "audit"] }),
  R("GET", "/api/hub/sync/status", { keys: ["total", "devices"] }),
  R("GET", "/v1/work/sessions", { keys: ["total", "items"] }),
  R("POST", "/v1/search", { keys: ["results", "facts", "reason", "channels"], body: { query: "needle" } }),
];

/** Deduplicate by (template, method), keeping the first row. */
export const UNIQUE_ROUTES = [...new Map(ROUTES.map((route) => [`${route.method} ${route.template}`, route])).values()];
