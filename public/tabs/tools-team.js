// The Alerts and Team pages inside the Tools tab. They put the team-mode and alert-rule APIs on the shared
// components: server-paged delivery feed, rule cards with Test and a confirmed Remove, shared projects with a board, a
// brief and search. Writing is refused by the server for a viewer; the page says so instead of hiding the buttons.
import { t } from "../ui-i18n.js";
import { badge, button, confirmDialog, emptyState, field, markdownView, modal, mono, skeleton, statTile, timeEl, toast } from "../ui-components.js";
import { api, h, swap } from "../ui-dom.js";
import { pagedList, region } from "../ui-region.js";
import { buildHash, parseHash } from "../ui-pure.js";
import { queryString } from "./memory-views.js";
import { addMemberDialog, auditPanel, boardDialog, leaveTeam, revokeMember, sharesDialog } from "./tools-team-actions.js";

export const ALERT_EVENTS = ["device.paired", "token.revoked", "quota.hit", "sync.error", "extraction.failed", "queue.depth"];

// ---- alerts ---------------------------------------------------------------------------------------------------

function ruleCard(rule, reload) {
  return h("article", { class: "ui-card ui-item", "data-kind": "alert-rule", "data-id": rule.id },
    h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, `#${rule.id} ${rule.name}`), h("div", { class: "ui-row" }, badge(rule.event), rule.hasSecret ? badge(t("team.signed"), "success") : null, rule.allowPrivate ? badge(t("team.privateAllowed"), "warning") : null)),
    h("div", { class: "ui-meta" }, h("span", {}, rule.target === "file" ? t("team.writesTo") : t("team.postsTo")), mono(String(rule.target === "file" ? rule.path : rule.url), { copy: false })),
    h("div", { class: "ui-acts" },
      button({ label: t("team.sendTest"), size: "sm", icon: "bolt", onClick: async () => {
        const out = await api("/api/hub/alerts/test", { method: "POST", body: { id: rule.id } });
        toast(t("team.testResult", { delivered: out.delivered, failed: out.failed, blocked: out.blocked }), { tone: out.failed || out.blocked ? "warning" : "success" });
      } }),
      button({ label: t("team.remove"), variant: "danger", size: "sm", icon: "trash", onClick: async () => {
        const ok = await confirmDialog({ title: t("team.removeRuleTitle", { id: rule.id }), message: t("team.removeRuleMessage"), confirmLabel: t("team.removeRuleConfirm"), danger: true });
        if (!ok) return;
        await api(`/api/hub/alerts/rules/${rule.id}`, { method: "DELETE" });
        toast(t("team.ruleRemoved"), { tone: "success" });
        reload();
      } })));
}

function addRuleDialog(onAdded) {
  const name = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": t("team.nameOptional") });
  const event = h("select", { class: "ui-select", "aria-label": t("team.event") }, ...ALERT_EVENTS.map((value) => h("option", { value }, value)));
  const target = h("select", { class: "ui-select", "aria-label": t("team.sendTo") }, h("option", { value: "file" }, t("team.localFile")), h("option", { value: "webhook" }, t("team.webhook")));
  const place = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": t("team.placeLabel"), placeholder: t("team.placePlaceholder") });
  const secret = h("input", { type: "password", class: "ui-input", dir: "ltr", "aria-label": t("team.secretOptional"), autocomplete: "off" });
  const count = h("input", { type: "number", class: "ui-input", min: "1", value: "1", "aria-label": t("team.countThreshold") });
  const min = h("input", { type: "number", class: "ui-input", "aria-label": t("team.minOptional") });
  const priv = h("input", { type: "checkbox", "aria-label": t("team.allowPrivateAddresses") });
  const layer = modal({
    title: t("team.addRuleTitle"), size: "md",
    body: h("div", {},
      field({ label: t("team.nameOptional"), control: name }),
      h("div", { class: "ui-inline" }, field({ label: t("team.whenThisHappens"), control: event }), field({ label: t("team.sendTo"), control: target })),
      field({ label: t("team.placeLabel"), control: place, hint: t("team.placeHint") }),
      field({ label: t("team.secretOptional"), control: secret }),
      h("div", { class: "ui-inline" }, field({ label: t("team.countThreshold"), control: count }), field({ label: t("team.minOptional"), control: min })),
      h("label", { class: "ui-check" }, priv, h("span", {}, t("team.allowPrivate")))),
    actions: [button({ label: t("team.cancel"), onClick: () => layer.close(false) }), button({ label: t("team.addRule"), variant: "primary", onClick: async () => {
      if (!place.value.trim()) throw new Error(t("team.sayWhere"));
      await api("/api/hub/alerts/rules", { method: "POST", body: { name: name.value.trim() || undefined, event: event.value, target: target.value, url: target.value === "webhook" ? place.value.trim() : undefined, path: target.value === "file" ? place.value.trim() : undefined, secret: secret.value.trim() || undefined, countThreshold: Number(count.value) || 1, minValue: min.value === "" ? undefined : Number(min.value), allowPrivate: priv.checked } });
      toast(t("team.ruleAdded"), { tone: "success" });
      layer.close(true);
      onAdded();
    } })],
  });
}

export function alertsView() {
  const rules = region({
    load: async () => (await api("/api/hub/alerts/rules")).rules,
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: t("team.noRulesTitle"), text: t("team.noRulesText"), art: "offline", actions: [button({ label: t("team.addAlertRule"), variant: "primary", icon: "plus", onClick: () => addRuleDialog(() => rules.reload({ soft: true })) })] }),
    errorTitle: t("team.rulesError"),
    render: (list) => h("div", { class: "ui-list-rows" }, ...list.map((rule) => ruleCard(rule, () => rules.reload({ soft: true })))),
  });
  const feed = pagedList({
    defaults: { limit: 10 }, prefix: "f", label: t("team.deliveryFeed"),
    fetchPage: (p) => api(`/api/hub/alerts/feed?${queryString({ limit: p.limit, offset: p.offset })}`).then((data) => ({ items: data.deliveries, total: data.total })),
    renderItem: (row) => h("article", { class: "ui-card ui-item", "data-kind": "delivery" },
      h("div", { class: "ui-item-head" }, h("code", { class: "ui-mono ui-item-title" }, row.event), h("div", { class: "ui-row" }, badge(row.status, row.status === "delivered" ? "success" : row.status === "failed" ? "danger" : "warning"), badge(t("team.attempts", { count: row.attempts })))),
      h("div", { class: "ui-meta" }, h("span", {}, `#${row.id}`), row.lastError ? h("span", { dir: "auto" }, row.lastError) : null)),
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    empty: () => emptyState({ title: t("team.noDeliveriesTitle"), text: t("team.noDeliveriesText"), art: "review", compact: true }),
  });
  return h("div", {},
    h("p", { class: "ui-meta" }, t("team.alertsIntro")),
    h("div", { class: "ui-section-head" }, h("h2", {}, t("team.rules")), h("div", { class: "ui-row" }, button({ label: t("team.addARule"), variant: "primary", icon: "plus", onClick: () => addRuleDialog(() => rules.reload({ soft: true })) }))),
    rules,
    h("div", { class: "ui-section-head" }, h("h2", {}, t("team.deliveryFeed")), button({ label: t("team.deliverDue"), icon: "refresh", onClick: async () => {
      const out = await api("/api/hub/alerts/run", { method: "POST", body: {} });
      toast(t("team.deliveredResult", { delivered: out.delivered, retried: out.retried, failed: out.failed }), { tone: out.failed ? "warning" : "success" });
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
  const layer = modal({ title, size: "sm", body: field({ label, control: input }), initialFocus: () => input, actions: [button({ label: t("team.cancel"), onClick: () => layer.close(false) }), button({ label: confirmLabel, variant: "primary", onClick: async () => {
    if (!input.value.trim()) throw new Error(t("team.typeName"));
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
    empty: () => emptyState({ title: t("team.noTeamTitle"), text: t("team.noTeamText"), art: "offline", actions: [button({ label: t("team.createTeam"), variant: "primary", icon: "plus", onClick: () => createTeam() })] }),
    errorTitle: t("team.teamsError"),
    render: (teams) => {
      const wanted = teamState();
      const chosen = teams.find((team) => String(team.id) === wanted.team) ?? teams[0];
      queueMicrotask(() => openTeam(chosen, wanted.project || chosen.projects[0] || ""));
      return h("div", {},
        h("div", { class: "ui-list-rows" }, ...teams.map((team) => h("article", { class: `ui-card ui-item${team.id === chosen.id ? " is-selected" : ""}`, "data-kind": "team", "data-id": team.id },
          h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, team.name), h("div", { class: "ui-row" }, badge(team.role ?? t("team.member"), team.role === "viewer" ? "warning" : "success"))),
          h("div", { class: "ui-meta" }, t("team.projectsList", { list: team.projects.join(", ") || t("team.none") })),
          h("div", { class: "ui-acts" }, button({ label: team.id === chosen.id ? t("team.open") : t("team.openThis"), size: "sm", pressed: team.id === chosen.id, onClick: () => { setTeamState({ team: team.id, project: team.projects[0] ?? "" }); openTeam(team, team.projects[0] ?? ""); reg.reload({ soft: true }); } }))))),
        holder);
    },
  });

  async function createTeam() {
    nameDialog({ title: t("team.createTeam"), label: t("team.teamName"), confirmLabel: t("team.createTeamConfirm"), onSave: async (name) => { await api("/api/hub/team", { method: "POST", body: { name } }); toast(t("team.teamCreated"), { tone: "success" }); reg.reload({ soft: true }); } });
  }

  function openTeam(team, project) {
    if (detail === `${team.id}:${project}`) return;
    detail = `${team.id}:${project}`;
    const viewer = team.role === "viewer";
    const noWrite = viewer ? t("team.viewerReadOnly") : undefined;
    const refresh = () => { detail = null; reg.reload({ soft: true }); };
    const p = project ? `&project=${encodeURIComponent(project)}` : "";
    const panel = region({
      load: async () => { const [members, board, brief] = await Promise.all([api(`/api/hub/team/members?team_id=${team.id}`), api(`/api/hub/team/board?team_id=${team.id}${p}`), project ? api(`/api/hub/team/brief?team_id=${team.id}&project=${encodeURIComponent(project)}`) : Promise.resolve(null)]); return { members: members.members, board: board.entries, brief }; },
      skeleton: () => skeleton({ kind: "card", count: 3 }),
      isEmpty: () => false,
      errorTitle: t("team.teamError"),
      render: ({ members, board, brief }) => {
        const query = h("input", { type: "search", class: "ui-input", dir: "auto", "aria-label": t("team.searchShared"), placeholder: t("team.searchPlaceholder") });
        const results = h("div", { class: "ui-list-rows", role: "status" });
        const run = async () => {
          const text = query.value.trim();
          if (!text) throw new Error(t("team.typeSearch"));
          const found = await api("/api/hub/team/search", { method: "POST", body: { team_id: team.id, query: text } });
          swap(results, found.results.length ? found.results.map((entry) => h("article", { class: "ui-card ui-item" }, h("p", { class: "ui-item-title", dir: "auto" }, entry.text), h("div", { class: "ui-meta" }, badge(entry.project), h("span", {}, entry.source)))) : emptyState({ title: t("team.noMatchTitle"), text: t("team.noMatchText"), art: "search", compact: true }));
        };
        query.addEventListener("keydown", (event) => { if (event.key === "Enter") run().catch((error) => toast(error.message, { tone: "danger" })); });
        return h("div", {},
          h("div", { class: "ui-grid ui-stat-grid" }, statTile({ label: t("team.members"), value: members.length }), statTile({ label: t("team.sharedProjects"), value: team.projects.length }), statTile({ label: t("team.boardEntries"), value: board.length })),
          h("div", { class: "ui-section-head" }, h("h2", {}, t("team.projects")), button({ label: t("team.shareProject"), icon: "plus", disabled: viewer, title: noWrite, onClick: () => nameDialog({ title: t("team.shareProject"), label: t("team.projectName"), confirmLabel: t("team.shareProjectConfirm"), onSave: async (value) => { await api("/api/hub/team/projects", { method: "POST", body: { team_id: team.id, project: value } }); setTeamState({ project: value }); toast(t("team.projectShared"), { tone: "success" }); detail = null; reg.reload({ soft: true }); } }) })),
          h("div", { class: "ui-row" }, ...(team.projects.length ? team.projects.map((name) => button({ label: name, size: "sm", pressed: name === project, onClick: () => { setTeamState({ project: name }); detail = null; openTeam(team, name); } })) : [h("span", { class: "ui-meta" }, t("team.noProjectShared"))])),
          h("div", { class: "ui-section-head" }, h("h2", {}, t("team.members")), button({ label: t("team.addMember"), icon: "plus", disabled: viewer, title: noWrite, onClick: () => addMemberDialog({ team, onDone: refresh }) })),
          members.length ? h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": t("team.members") }, h("thead", {}, h("tr", {}, ...[t("team.colName"), t("team.colRole"), t("team.colProjects"), t("team.colState"), t("team.colActions")].map((label) => h("th", {}, label)))), h("tbody", {}, ...members.map((m) => h("tr", {}, h("td", { dir: "auto" }, m.name), h("td", {}, m.role), h("td", { dir: "auto" }, m.projects.join(", ") || t("team.none")), h("td", {}, m.revoked ? badge(t("team.revoked"), "danger") : badge(t("team.active"), "success")), h("td", {}, m.revoked ? null : h("div", { class: "ui-row" }, button({ label: t("team.changeShares"), size: "sm", disabled: viewer, title: noWrite, onClick: () => sharesDialog({ team, member: m, onDone: refresh }) }), button({ label: t("team.revoke"), size: "sm", variant: "danger", disabled: viewer, title: noWrite, onClick: () => revokeMember({ team, member: m, onDone: refresh }) })))))))) : emptyState({ title: t("team.noMembers"), compact: true }),
          h("div", { class: "ui-section-head" }, h("h2", {}, t("team.board")), h("div", { class: "ui-row" }, button({ label: t("team.pinNote"), icon: "plus", disabled: viewer || !project, title: viewer ? noWrite : project ? undefined : t("team.pickProject"), onClick: () => boardDialog({ team, project, kind: "pin", onDone: refresh }) }), button({ label: t("team.recordDecision"), icon: "plus", disabled: viewer || !project, title: viewer ? noWrite : project ? undefined : t("team.pickProject"), onClick: () => boardDialog({ team, project, kind: "decision", onDone: refresh }) }))),
          board.length ? h("div", { class: "ui-list-rows" }, ...board.map((entry) => h("article", { class: "ui-card ui-item" }, h("div", { class: "ui-item-head" }, h("p", { class: "ui-item-title", dir: "auto" }, entry.text), badge(entry.kind, entry.kind === "decision" ? "success" : "neutral")), h("div", { class: "ui-meta" }, h("span", { dir: "auto" }, entry.author.name), timeEl(entry.at))))) : emptyState({ title: t("team.nothingPinnedTitle"), text: t("team.nothingPinnedText"), art: "review", compact: true }),
          brief ? h("div", {}, h("div", { class: "ui-section-head" }, h("h2", {}, t("team.brief"))), h("div", { class: "ui-card" }, markdownView(brief.text))) : null,
          auditPanel(team),
          h("div", { class: "ui-section-head" }, h("h2", {}, t("team.leave")), button({ label: t("team.leaveThis"), variant: "danger", icon: "trash", onClick: () => leaveTeam({ team, onDone: () => { detail = null; reg.reload({ soft: true }); } }) })),
          h("div", { class: "ui-section-head" }, h("h2", {}, t("team.searchShared"))),
          h("div", { class: "ui-row" }, h("div", { class: "ui-filter ui-filter-grow" }, query), button({ label: t("team.search"), icon: "search", onClick: run })),
          results);
      },
    });
    swap(holder, h("h2", { dir: "auto" }, team.name), panel);
  }

  return h("div", {},
    h("p", { class: "ui-meta" }, t("team.teamIntro")),
    h("div", { class: "ui-acts" }, button({ label: t("team.createTeam"), icon: "plus", onClick: () => createTeam() })),
    reg);
}

