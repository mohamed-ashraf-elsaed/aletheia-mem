// The Alerts and Team pages inside the Tools tab (T-217). They put the team-mode and alert-rule APIs on the shared
// components: server-paged delivery feed, rule cards with Test and a confirmed Remove, shared projects with a board, a
// brief and search. Writing is refused by the server for a viewer; the page says so instead of hiding the buttons.
import { badge, button, confirmDialog, emptyState, field, markdownView, modal, mono, skeleton, statTile, timeEl, toast } from "../ui-components.js";
import { api, h, swap } from "../ui-dom.js";
import { pagedList, region } from "../ui-region.js";
import { buildHash, parseHash } from "../ui-pure.js";
import { queryString } from "./memory-views.js";

export const ALERT_EVENTS = ["device.paired", "token.revoked", "quota.hit", "sync.error", "extraction.failed", "queue.depth"];

// ---- alerts ---------------------------------------------------------------------------------------------------

function ruleCard(rule, reload) {
  return h("article", { class: "ui-card ui-item", "data-kind": "alert-rule", "data-id": rule.id },
    h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, `#${rule.id} ${rule.name}`), h("div", { class: "ui-row" }, badge(rule.event), rule.hasSecret ? badge("signed", "success") : null, rule.allowPrivate ? badge("private allowed", "warning") : null)),
    h("div", { class: "ui-meta" }, h("span", {}, rule.target === "file" ? "writes to" : "posts to"), mono(String(rule.target === "file" ? rule.path : rule.url), { copy: false })),
    h("div", { class: "ui-acts" },
      button({ label: "Send a test", size: "sm", icon: "bolt", onClick: async () => {
        const out = await api("/api/hub/alerts/test", { method: "POST", body: { id: rule.id } });
        toast(`Test: ${out.delivered} delivered, ${out.failed} failed, ${out.blocked} blocked.`, { tone: out.failed || out.blocked ? "warning" : "success" });
      } }),
      button({ label: "Remove", variant: "danger", size: "sm", icon: "trash", onClick: async () => {
        const ok = await confirmDialog({ title: `Remove alert rule #${rule.id}?`, message: "It stops sending at once. Deliveries already in the feed stay. This cannot be undone; add the rule again if you need it.", confirmLabel: "Remove rule", danger: true });
        if (!ok) return;
        await api(`/api/hub/alerts/rules/${rule.id}`, { method: "DELETE" });
        toast("Rule removed.", { tone: "success" });
        reload();
      } })));
}

function addRuleDialog(onAdded) {
  const name = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": "Name (optional)" });
  const event = h("select", { class: "ui-select", "aria-label": "Event" }, ...ALERT_EVENTS.map((value) => h("option", { value }, value)));
  const target = h("select", { class: "ui-select", "aria-label": "Send to" }, h("option", { value: "file" }, "A local file"), h("option", { value: "webhook" }, "A webhook (https://)"));
  const place = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": "File path or webhook address", placeholder: "/path/to/alerts.log or https://example.com/hook" });
  const secret = h("input", { type: "password", class: "ui-input", dir: "ltr", "aria-label": "Signing secret (optional)", autocomplete: "off" });
  const count = h("input", { type: "number", class: "ui-input", min: "1", value: "1", "aria-label": "Count threshold" });
  const min = h("input", { type: "number", class: "ui-input", "aria-label": "Minimum value (optional)" });
  const priv = h("input", { type: "checkbox", "aria-label": "Allow private addresses" });
  const layer = modal({
    title: "Add an alert rule", size: "md",
    body: h("div", {},
      field({ label: "Name (optional)", control: name }),
      h("div", { class: "ui-inline" }, field({ label: "When this happens", control: event }), field({ label: "Send to", control: target })),
      field({ label: "File path or webhook address", control: place, hint: "Webhook bodies are signed with HMAC-SHA256 when you set a secret. Private addresses need the box below." }),
      field({ label: "Signing secret (optional)", control: secret }),
      h("div", { class: "ui-inline" }, field({ label: "Count threshold", control: count }), field({ label: "Minimum value (optional)", control: min })),
      h("label", { class: "ui-check" }, priv, h("span", {}, "Allow a private or local address"))),
    actions: [button({ label: "Cancel", onClick: () => layer.close(false) }), button({ label: "Add rule", variant: "primary", onClick: async () => {
      if (!place.value.trim()) throw new Error("Say where the alert goes: a file path or a webhook address.");
      await api("/api/hub/alerts/rules", { method: "POST", body: { name: name.value.trim() || undefined, event: event.value, target: target.value, url: target.value === "webhook" ? place.value.trim() : undefined, path: target.value === "file" ? place.value.trim() : undefined, secret: secret.value.trim() || undefined, countThreshold: Number(count.value) || 1, minValue: min.value === "" ? undefined : Number(min.value), allowPrivate: priv.checked } });
      toast("Alert rule added.", { tone: "success" });
      layer.close(true);
      onAdded();
    } })],
  });
}

export function alertsView() {
  const rules = region({
    load: async () => (await api("/api/hub/alerts/rules")).rules,
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: "No alert rules yet", text: "A rule watches one event, such as a revoked token or a failed extraction, and writes a line to a file or posts to a webhook. Nothing is sent until you add one.", art: "offline", actions: [button({ label: "Add an alert rule", variant: "primary", icon: "plus", onClick: () => addRuleDialog(() => rules.reload({ soft: true })) })] }),
    errorTitle: "Could not read the alert rules",
    render: (list) => h("div", { class: "ui-list-rows" }, ...list.map((rule) => ruleCard(rule, () => rules.reload({ soft: true })))),
  });
  const feed = pagedList({
    defaults: { limit: 10 }, prefix: "f", label: "Delivery feed",
    fetchPage: (p) => api(`/api/hub/alerts/feed?${queryString({ limit: p.limit, offset: p.offset })}`).then((data) => ({ items: data.deliveries, total: data.total })),
    renderItem: (row) => h("article", { class: "ui-card ui-item", "data-kind": "delivery" },
      h("div", { class: "ui-item-head" }, h("code", { class: "ui-mono ui-item-title" }, row.event), h("div", { class: "ui-row" }, badge(row.status, row.status === "delivered" ? "success" : row.status === "failed" ? "danger" : "warning"), badge(`${row.attempts} attempt${row.attempts === 1 ? "" : "s"}`))),
      h("div", { class: "ui-meta" }, h("span", {}, `#${row.id}`), row.lastError ? h("span", { dir: "auto" }, row.lastError) : null)),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: "No deliveries yet", text: "When a rule fires, each attempt is listed here, newest first.", art: "review", compact: true }),
  });
  return h("div", {},
    h("p", { class: "ui-meta" }, "Rules match device, token, quota, sync, extraction and queue events. Webhook bodies are signed with HMAC-SHA256; private targets need explicit permission."),
    h("div", { class: "ui-section-head" }, h("h2", {}, "Rules"), h("div", { class: "ui-row" }, button({ label: "Add a rule", variant: "primary", icon: "plus", onClick: () => addRuleDialog(() => rules.reload({ soft: true })) }))),
    rules,
    h("div", { class: "ui-section-head" }, h("h2", {}, "Delivery feed"), button({ label: "Deliver due now", icon: "refresh", onClick: async () => {
      const out = await api("/api/hub/alerts/run", { method: "POST", body: {} });
      toast(`Delivered ${out.delivered}, retried ${out.retried}, failed ${out.failed}.`, { tone: out.failed ? "warning" : "success" });
      feed.reload({ soft: true });
    } })),
    feed);
}

// ---- team ------------------------------------------------------------------------------------------------------

/** team and project live in the hash, so a link or a reload returns to the same team. */
const teamState = () => { const { params } = parseHash(globalThis.location.hash); return { team: params.team ?? "", project: params.project ?? "" }; };
function setTeamState(patch) {
  const { path, params } = parseHash(globalThis.location.hash);
  globalThis.history.replaceState(null, "", buildHash(path, { ...params, ...patch }));
}

function nameDialog({ title, label, confirmLabel, onSave }) {
  const input = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": label });
  const layer = modal({ title, size: "sm", body: field({ label, control: input }), initialFocus: () => input, actions: [button({ label: "Cancel", onClick: () => layer.close(false) }), button({ label: confirmLabel, variant: "primary", onClick: async () => {
    if (!input.value.trim()) throw new Error("Type a name first.");
    await onSave(input.value.trim());
    layer.close(true);
  } })] });
}

export function teamView() {
  let detail = null;
  const holder = h("div", { class: "ui-team-detail" });
  const reg = region({
    load: async () => (await api("/api/hub/team")).teams,
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: "No team yet", text: "A team shares chosen projects with other people: a board of pins and decisions, a brief and search limited to what each member may see. Create one to start.", art: "offline", actions: [button({ label: "Create a team", variant: "primary", icon: "plus", onClick: () => createTeam() })] }),
    errorTitle: "Could not read your teams",
    render: (teams) => {
      const wanted = teamState();
      const chosen = teams.find((team) => String(team.id) === wanted.team) ?? teams[0];
      queueMicrotask(() => openTeam(chosen, wanted.project || chosen.projects[0] || ""));
      return h("div", {},
        h("div", { class: "ui-list-rows" }, ...teams.map((team) => h("article", { class: `ui-card ui-item${team.id === chosen.id ? " is-selected" : ""}`, "data-kind": "team", "data-id": team.id },
          h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, team.name), h("div", { class: "ui-row" }, badge(team.role ?? "member", team.role === "viewer" ? "warning" : "success"))),
          h("div", { class: "ui-meta" }, `projects: ${team.projects.join(", ") || "none"}`),
          h("div", { class: "ui-acts" }, button({ label: team.id === chosen.id ? "Open" : "Open this team", size: "sm", pressed: team.id === chosen.id, onClick: () => { setTeamState({ team: team.id, project: team.projects[0] ?? "" }); openTeam(team, team.projects[0] ?? ""); reg.reload({ soft: true }); } }))))),
        holder);
    },
  });

  async function createTeam() {
    nameDialog({ title: "Create a team", label: "Team name", confirmLabel: "Create team", onSave: async (name) => { await api("/api/hub/team", { method: "POST", body: { name } }); toast("Team created.", { tone: "success" }); reg.reload({ soft: true }); } });
  }

  function openTeam(team, project) {
    if (detail === `${team.id}:${project}`) return;
    detail = `${team.id}:${project}`;
    const viewer = team.role === "viewer";
    const p = project ? `&project=${encodeURIComponent(project)}` : "";
    const panel = region({
      load: async () => { const [members, board, brief] = await Promise.all([api(`/api/hub/team/members?team_id=${team.id}`), api(`/api/hub/team/board?team_id=${team.id}${p}`), project ? api(`/api/hub/team/brief?team_id=${team.id}&project=${encodeURIComponent(project)}`) : Promise.resolve(null)]); return { members: members.members, board: board.entries, brief }; },
      skeleton: () => skeleton({ kind: "card", count: 3 }),
      isEmpty: () => false,
      errorTitle: "Could not read this team",
      render: ({ members, board, brief }) => {
        const query = h("input", { type: "search", class: "ui-input", dir: "auto", "aria-label": "Search shared memory", placeholder: "Search what this team shares…" });
        const results = h("div", { class: "ui-list-rows", role: "status" });
        const run = async () => {
          const text = query.value.trim();
          if (!text) throw new Error("Type something to search for.");
          const found = await api("/api/hub/team/search", { method: "POST", body: { team_id: team.id, query: text } });
          swap(results, found.results.length ? found.results.map((entry) => h("article", { class: "ui-card ui-item" }, h("p", { class: "ui-item-title", dir: "auto" }, entry.text), h("div", { class: "ui-meta" }, badge(entry.project), h("span", {}, entry.source)))) : emptyState({ title: "No match", text: "Nothing this team shares matches those words.", art: "search", compact: true }));
        };
        query.addEventListener("keydown", (event) => { if (event.key === "Enter") run().catch((error) => toast(error.message, { tone: "danger" })); });
        return h("div", {},
          h("div", { class: "ui-grid ui-stat-grid" }, statTile({ label: "Members", value: members.length }), statTile({ label: "Shared projects", value: team.projects.length }), statTile({ label: "Board entries", value: board.length })),
          h("div", { class: "ui-section-head" }, h("h2", {}, "Projects"), button({ label: "Share a project", icon: "plus", disabled: viewer, title: viewer ? "A viewer can read but not write." : undefined, onClick: () => nameDialog({ title: "Share a project", label: "Project name", confirmLabel: "Share project", onSave: async (value) => { await api("/api/hub/team/projects", { method: "POST", body: { team_id: team.id, project: value } }); setTeamState({ project: value }); toast("Project shared.", { tone: "success" }); detail = null; reg.reload({ soft: true }); } }) })),
          h("div", { class: "ui-row" }, ...(team.projects.length ? team.projects.map((name) => button({ label: name, size: "sm", pressed: name === project, onClick: () => { setTeamState({ project: name }); detail = null; openTeam(team, name); } })) : [h("span", { class: "ui-meta" }, "No project is shared yet.")])),
          h("div", { class: "ui-section-head" }, h("h2", {}, "Members")),
          members.length ? h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": "Members" }, h("thead", {}, h("tr", {}, ...["Name", "Role", "Projects", "State"].map((label) => h("th", {}, label)))), h("tbody", {}, ...members.map((m) => h("tr", {}, h("td", { dir: "auto" }, m.name), h("td", {}, m.role), h("td", { dir: "auto" }, m.projects.join(", ") || "none"), h("td", {}, m.revoked ? badge("revoked", "danger") : badge("active", "success"))))))) : emptyState({ title: "No members", compact: true }),
          h("p", { class: "ui-meta" }, "Add members from the command line: ", mono("aletheia team add-member <team> --name n --role editor --projects a,b")),
          h("div", { class: "ui-section-head" }, h("h2", {}, "Board")),
          board.length ? h("div", { class: "ui-list-rows" }, ...board.map((entry) => h("article", { class: "ui-card ui-item" }, h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, entry.text), badge(entry.kind, entry.kind === "decision" ? "success" : "neutral")), h("div", { class: "ui-meta" }, h("span", { dir: "auto" }, entry.author.name), timeEl(entry.at))))) : emptyState({ title: "Nothing pinned or decided", text: "Pinned memories and decisions of this project show up here.", art: "review", compact: true }),
          brief ? h("div", {}, h("div", { class: "ui-section-head" }, h("h2", {}, "Brief")), h("div", { class: "ui-card" }, markdownView(brief.text))) : null,
          h("div", { class: "ui-section-head" }, h("h2", {}, "Search shared memory")),
          h("div", { class: "ui-row" }, h("div", { class: "ui-filter ui-filter-grow" }, query), button({ label: "Search", icon: "search", onClick: run })),
          results);
      },
    });
    swap(holder, h("h2", { dir: "auto" }, team.name), panel);
  }

  return h("div", {},
    h("p", { class: "ui-meta" }, "Shared projects, a board of pins and decisions, a rule-based brief and search limited by each member's access. A viewer can read but not write."),
    h("div", { class: "ui-acts" }, button({ label: "Create a team", icon: "plus", onClick: () => createTeam() })),
    reg);
}

