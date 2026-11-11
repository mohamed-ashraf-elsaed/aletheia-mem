// The pages inside the Tools tab: the tools Aletheia can capture from, paired devices, remote access links,
// the doctor's checks and the activity log. Revoking a device or a link cannot be undone, so each asks first and says
// what will happen. Commands are shown with a Copy button; nothing here runs a command for you.
import { badge, button, codeBlock, confirmDialog, copyText, emptyState, iconButton, mono, modal, skeleton, statTile, timeEl, toast, withTooltip } from "../ui-components.js";
import { formatBytes, relativeTime } from "../ui-pure.js";
import { api, h, state, swap } from "../ui-dom.js";
import { pagedList, region } from "../ui-region.js";
import { dateRange, filterBar, selectFilter, textFilter } from "../ui-views.js";
import { queryString } from "./memory-views.js";
import { t } from "../ui-i18n.js";

/** Splits a translated sentence around one {name} slot so a DOM node can sit inside it. */
const withNode = (text, node) => text.split("\u0000").flatMap((part, i) => (i ? [node, part] : [part])).filter((part) => part !== "");

const tip = (label, text) => { const el = h("span", { class: "ui-term", tabindex: "0" }, label); withTooltip(el, text); return el; };

// ---- tools -----------------------------------------------------------------------------------------------

const commandRow = (label, command) => h("div", { class: "ui-command-row" }, h("span", { class: "ui-command-label" }, label), h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, command), iconButton({ icon: "copy", label: t("tools.copyCommand", { label }), onClick: () => copyText(command) })));

function toolCard(tool) {
  const hooks = tool.hooks;
  const hooksTone = hooks.error ? "danger" : hooks.expected === 0 ? "neutral" : hooks.present === hooks.expected ? "success" : "warning";
  const hookCommands = Object.entries(hooks.commands ?? {});
  return h("article", { class: "ui-card ui-item", "data-tool": tool.id },
    h("div", { class: "ui-item-head" },
      h("h3", { class: "ui-item-title" }, tool.name),
      h("div", { class: "ui-row" }, badge(tool.installed ? t("tools.detected") : t("tools.notDetected"), tool.installed ? "success" : "neutral"), badge(t("tools.hooksBadge", { present: hooks.present, expected: hooks.expected }), hooksTone), badge(tool.capabilities ?? "")),
    ),
    h("div", { class: "ui-meta" }, tip(t("tools.hooks"), t("tools.hooksTip")), hooks.file ? mono(hooks.file) : h("span", {}, t("tools.noHooksFile"))),
    hooks.error ? h("div", { class: "ui-inline-error", role: "alert" }, hooks.error) : null,
    h("div", { class: "ui-meta" }, h("span", {}, t("tools.lastCapture")), tool.lastCapture ? timeEl(tool.lastCapture) : h("span", {}, t("tools.never")), tip(t("tools.spool"), t("tools.spoolTip")), h("span", {}, t("tools.spoolWaiting", { items: tool.spool.items, size: formatBytes(tool.spool.bytes) }))),
    hooks.events?.length ? h("div", { class: "ui-meta" }, h("span", {}, t("tools.events")), ...hooks.events.map((event) => badge(event))) : null,
    h("div", { class: "ui-commands" },
      commandRow(t("tools.cmdInstall"), tool.commands.install),
      commandRow(t("tools.cmdUninstall"), tool.commands.uninstall),
      commandRow(t("tools.cmdCheck"), tool.commands.doctor),
      commandRow(t("tools.cmdMcp"), tool.commands.mcp),
      ...hookCommands.map(([event, command]) => commandRow(t("tools.cmdHook", { event }), command))));
}

export function toolsView(ctx) {
  return region({
    load: async () => { const [doctor, overview] = await Promise.all([api("/api/hub/doctor"), api("/api/hub/overview")]); return { doctor, overview }; },
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    isEmpty: ({ doctor }) => !doctor.tools.length,
    empty: () => emptyState({ title: t("tools.noToolsTitle"), text: t("tools.noToolsText"), compact: true }),
    errorTitle: t("tools.errStatus"),
    render: ({ doctor, overview }) => {
      ctx.setDoctor?.(doctor, overview);
      return h("div", {},
        h("p", { class: "ui-meta" }, ...withNode(t("tools.readOnlyStatus", { command: "\u0000" }), h("code", { class: "ui-mono" }, "aletheia doctor"))),
        h("div", { class: "ui-meta" }, t("tools.dataFolder"), mono(doctor.dataDir), h("span", {}, t("tools.checked")), timeEl(doctor.generatedAt), overview?.provider ? h("span", {}, t("tools.modelProvider", { provider: overview.provider })) : null),
        h("div", { class: "ui-list-rows ui-tools-list" }, ...doctor.tools.map(toolCard)),
        ctx.classic?.(overview));
    },
  });
}

// ---- devices -----------------------------------------------------------------------------------------------

function deviceCard(device, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "device", "data-id": device.deviceId });
  swap(card,
    h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, device.name ?? device.deviceId), h("div", { class: "ui-row" }, device.revoked ? badge(t("tools.revoked"), "danger") : badge(t("tools.paired"), "success"))),
    h("div", { class: "ui-meta" }, h("span", {}, t("tools.device")), mono(device.deviceId), h("span", {}, t("tools.lastSync")), device.lastSync ? timeEl(device.lastSync) : h("span", {}, t("tools.never")), tip(t("tools.pending"), t("tools.pendingTip")), h("span", {}, t("tools.pendingCount", { count: device.pendingOps }))),
    h("div", { class: "ui-acts" }, button({ label: t("tools.revoke"), variant: "danger", size: "sm", icon: "x", disabled: device.revoked, onClick: async () => {
      const ok = await confirmDialog({ title: t("tools.revokeDeviceTitle", { name: device.name ?? device.deviceId }), message: t("tools.revokeDeviceMessage"), confirmLabel: t("tools.revokeDevice"), danger: true });
      if (!ok) return;
      await api("/api/hub/sync/revoke", { method: "POST", body: { device_id: device.deviceId } });
      toast(t("tools.deviceRevoked"), { tone: "success" });
      ctx.changed();
    } })));
  return card;
}

export function devicesView(ctx) {
  const info = h("div", { class: "ui-sync-info" });
  const pairOut = h("div", { class: "ui-pair-out" });
  const list = pagedList({
    defaults: { limit: 10 }, label: t("tools.devices"),
    fetchPage: async (p) => { const data = await api(`/api/hub/sync/status?${queryString({ limit: p.limit, offset: p.offset })}`); return { items: data.devices, total: data.total ?? data.devices.length, data }; },
    renderItem: (device) => deviceCard(device, { changed: () => list.reload({ soft: true }) }),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: t("tools.noDevicesTitle"), text: t("tools.noDevicesText"), art: "offline", command: "aletheia sync pair" }),
    onData: (data) => {
      const sync = data.data;
      swap(info, h("div", { class: "ui-grid ui-stat-grid" }, statTile({ label: t("tools.devices"), value: sync.deviceCount ?? data.total }), statTile({ label: t("tools.logPosition"), value: sync.headSeq }), statTile({ label: t("tools.epoch"), value: sync.epoch })),
        h("p", { class: "ui-meta" }, sync.e2ee?.enabled ? t("tools.e2eeOn", { kid: sync.e2ee.currentKid }) : t("tools.e2eeOff")));
    },
  });
  const pair = button({ label: t("tools.showPairing"), variant: "primary", icon: "plus", onClick: async () => {
    const result = await api("/api/hub/sync/pair", { method: "POST", body: {} });
    const join = `aletheia sync join ${result.url} ${result.code}`;
    swap(pairOut, h("div", { class: "ui-card" }, h("div", { class: "ui-meta" }, t("tools.pairingCode"), mono(result.code)), h("p", { class: "ui-meta" }, t("tools.pairingHelp")), h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, join), iconButton({ icon: "copy", label: t("tools.copyJoin"), onClick: () => copyText(join) }))));
  } });
  const wrap = h("div", {}, info, h("div", { class: "ui-acts" }, pair), pairOut, list);
  wrap.reload = (options) => list.reload(options);
  wrap.dispose = () => list.dispose?.();
  return wrap;
}

// ---- remote access ------------------------------------------------------------------------------------------

export function accessView(ctx) {
  const reg = region({
    load: async () => (await api("/api/hub/mcp-links")).links ?? [],
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    isEmpty: () => false,
    errorTitle: t("tools.errLinks"),
    render: (links) => {
      const create = button({ label: t("tools.createLink"), variant: "primary", icon: "plus", onClick: async () => {
        const link = await api("/api/hub/mcp-links", { method: "POST", body: {} });
        const snippet = `${link.claudeCode}\n\n${t("tools.desktopLabel")}\n${link.claudeDesktop}`;
        const layer = modal({ title: t("tools.newLinkTitle"), size: "lg", body: h("div", { class: "ui-detail" },
          h("p", {}, t("tools.tokenOnce")),
          h("div", { class: "ui-meta" }, t("tools.scopeLabel", { scope: link.scope }), mono(link.token), mono(link.url)), codeBlock({ code: snippet, lang: "sh" })), actions: [button({ label: t("tools.done"), variant: "primary", onClick: () => layer.close(true) })] });
        reg.reload({ soft: true });
      } });
      const rows = links.map((link) => h("article", { class: "ui-card ui-item", "data-kind": "link", "data-id": link.id },
        h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, link.name ? t("tools.linkNamed", { id: link.id, name: link.name }) : t("tools.linkPlain", { id: link.id })), h("div", { class: "ui-row" }, badge(link.scope), link.revoked ? badge(t("tools.revoked"), "danger") : badge(t("tools.active"), "success"))),
        h("div", { class: "ui-meta" }, t("tools.linkProjects", { projects: link.projects.length ? link.projects.join(", ") : t("tools.allProjects") })),
        h("div", { class: "ui-acts" }, button({ label: t("tools.revoke"), variant: "danger", size: "sm", icon: "x", disabled: link.revoked, onClick: async () => {
          const ok = await confirmDialog({ title: t("tools.revokeLinkTitle", { id: link.id }), message: t("tools.revokeLinkMessage"), confirmLabel: t("tools.revokeLink"), danger: true });
          if (!ok) return;
          await api("/api/hub/mcp-links/revoke", { method: "POST", body: { id: link.id } });
          toast(t("tools.linkRevoked"), { tone: "success" });
          reg.reload({ soft: true });
        } }))));
      return h("div", {},
        h("p", { class: "ui-meta" }, t("tools.linksIntro")),
        h("div", { class: "ui-acts" }, create),
        rows.length ? h("div", { class: "ui-list-rows" }, ...rows) : emptyState({ title: t("tools.noLinksTitle"), text: t("tools.noLinksText"), art: "offline", compact: true }));
    },
  });
  return reg;
}

// ---- checks ----------------------------------------------------------------------------------------------------

export function checksView() {
  const reg = region({
    load: () => api("/api/hub/doctor"),
    skeleton: () => skeleton({ kind: "row", count: 6 }),
    isEmpty: (d) => !d.checks.length,
    empty: () => emptyState({ title: t("tools.noChecks"), compact: true }),
    errorTitle: t("tools.errChecks"),
    render: (data) => {
      const failing = data.checks.filter((check) => !check.ok).length;
      return h("div", {},
        h("div", { class: "ui-section-head" }, h("p", { class: "ui-meta", role: "status" }, failing ? t("tools.checksFailing", { failing, total: data.checks.length }) : t("tools.checksPass", { total: data.checks.length }), h("span", {}, t("tools.checked")), timeEl(data.generatedAt)), button({ label: t("tools.runAgain"), icon: "refresh", onClick: () => reg.reload({ soft: true }) })),
        h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": t("tools.doctorChecks") },
          h("thead", {}, h("tr", {}, h("th", {}, t("tools.thCheck")), h("th", {}, t("tools.thState")), h("th", {}, t("tools.thDetail")))),
          h("tbody", {}, ...data.checks.map((check) => h("tr", {}, h("td", {}, check.name), h("td", {}, badge(check.ok ? t("tools.ok") : t("tools.needsAttention"), check.ok ? "success" : "danger")), h("td", { dir: "auto" }, check.detail)))))));
    },
  });
  return reg;
}

// ---- activity ------------------------------------------------------------------------------------------------------

export function activityView() {
  const defaults = { limit: 25, actor: "", action: "", since: "", until: "" };
  const list = pagedList({
    defaults, label: t("tools.activity"),
    fetchPage: (p) => api(`/api/hub/audit?${queryString({ limit: p.limit, offset: p.offset, actor: p.actor, action: p.action, since: p.since, until: p.until })}`).then((data) => ({ items: data.audit, total: data.total })),
    renderItem: (row) => h("article", { class: "ui-card ui-item ui-audit-row" },
      h("div", { class: "ui-item-head" }, h("code", { class: "ui-mono ui-item-title" }, row.action), h("div", { class: "ui-row" }, badge(row.actor), timeEl(row.at_epoch))),
      row.detail ? h("div", { class: "ui-meta ui-mono-block", dir: "ltr" }, JSON.stringify(row.detail).slice(0, 400)) : null),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: () => emptyState({ title: t("tools.noActivityTitle"), text: t("tools.noActivityText"), art: "review" }),
    emptyFiltered: () => emptyState({ title: t("tools.noMatchTitle"), text: t("tools.noMatchText"), art: "search", compact: true }),
    toolbar: ({ state: s, set }) => filterBar([[
      textFilter({ key: "action", value: s.action, label: t("tools.filterAction"), placeholder: t("tools.filterActionHint"), onChange: (action) => set({ action }, { replace: true }) }),
      selectFilter({ key: "actor", label: t("tools.actor"), value: s.actor, options: ["ui", "api", "demo", "extract", "mcp"], allLabel: t("tools.anyone"), onChange: (actor) => set({ actor }) }),
      dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
    ]]),
  });
  return list;
}
