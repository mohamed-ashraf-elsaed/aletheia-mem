// The pages inside the Tools tab (T-211): the tools Aletheia can capture from, paired devices, remote access links,
// the doctor's checks and the activity log. Revoking a device or a link cannot be undone, so each asks first and says
// what will happen. Commands are shown with a Copy button; nothing here runs a command for you.
import { badge, button, codeBlock, confirmDialog, copyText, emptyState, iconButton, mono, modal, skeleton, statTile, timeEl, toast, withTooltip } from "../ui-components.js";
import { formatBytes, relativeTime } from "../ui-pure.js";
import { api, h, state, swap } from "../ui-dom.js";
import { pagedList, region } from "../ui-region.js";
import { dateRange, filterBar, selectFilter, textFilter } from "../ui-views.js";
import { queryString } from "./memory-views.js";

const tip = (label, text) => { const el = h("span", { class: "ui-term", tabindex: "0" }, label); withTooltip(el, text); return el; };

// ---- tools -----------------------------------------------------------------------------------------------

const commandRow = (label, command) => h("div", { class: "ui-command-row" }, h("span", { class: "ui-command-label" }, label), h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, command), iconButton({ icon: "copy", label: `Copy the ${label} command`, onClick: () => copyText(command) })));

function toolCard(tool) {
  const hooks = tool.hooks;
  const hooksTone = hooks.error ? "danger" : hooks.expected === 0 ? "neutral" : hooks.present === hooks.expected ? "success" : "warning";
  const hookCommands = Object.entries(hooks.commands ?? {});
  return h("article", { class: "ui-card ui-item", "data-tool": tool.id },
    h("div", { class: "ui-item-head" },
      h("h3", { class: "ui-item-title" }, tool.name),
      h("div", { class: "ui-row" }, badge(tool.installed ? "detected" : "not detected", tool.installed ? "success" : "neutral"), badge(`hooks ${hooks.present}/${hooks.expected}`, hooksTone), badge(tool.capabilities ?? "")),
    ),
    h("div", { class: "ui-meta" }, tip("Hooks", "Small scripts the tool runs so Aletheia can capture your sessions. The numbers are installed over expected."), hooks.file ? mono(hooks.file) : h("span", {}, "this tool has no hooks file")),
    hooks.error ? h("div", { class: "ui-inline-error", role: "alert" }, hooks.error) : null,
    h("div", { class: "ui-meta" }, h("span", {}, "Last capture"), tool.lastCapture ? timeEl(tool.lastCapture) : h("span", {}, "never"), tip("Spool", "Events waiting on disk while the server is not reachable. They are sent when it is back."), h("span", {}, `${tool.spool.items} waiting, ${formatBytes(tool.spool.bytes)}`)),
    hooks.events?.length ? h("div", { class: "ui-meta" }, h("span", {}, "Events"), ...hooks.events.map((event) => badge(event))) : null,
    h("div", { class: "ui-commands" },
      commandRow("install", tool.commands.install),
      commandRow("uninstall", tool.commands.uninstall),
      commandRow("check", tool.commands.doctor),
      commandRow("MCP server", tool.commands.mcp),
      ...hookCommands.map(([event, command]) => commandRow(`hook: ${event}`, command))));
}

export function toolsView(ctx) {
  return region({
    load: async () => { const [doctor, overview] = await Promise.all([api("/api/hub/doctor"), api("/api/hub/overview")]); return { doctor, overview }; },
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    isEmpty: ({ doctor }) => !doctor.tools.length,
    empty: () => emptyState({ title: "No tools are known", text: "This build lists no installers.", compact: true }),
    errorTitle: "Could not read the tool status",
    render: ({ doctor, overview }) => {
      ctx.setDoctor?.(doctor, overview);
      return h("div", {},
        h("p", { class: "ui-meta" }, "Read-only status from ", h("code", { class: "ui-mono" }, "aletheia doctor"), ". Install, uninstall and connect stay on the command line; copy the commands below."),
        h("div", { class: "ui-meta" }, "Data folder", mono(doctor.dataDir), h("span", {}, "checked"), timeEl(doctor.generatedAt), overview?.provider ? h("span", {}, `model provider: ${overview.provider}`) : null),
        h("div", { class: "ui-list-rows ui-tools-list" }, ...doctor.tools.map(toolCard)),
        ctx.classic?.(overview));
    },
  });
}

// ---- devices -----------------------------------------------------------------------------------------------

function deviceCard(device, ctx) {
  const card = h("article", { class: "ui-card ui-item", "data-kind": "device", "data-id": device.deviceId });
  swap(card,
    h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, device.name ?? device.deviceId), h("div", { class: "ui-row" }, device.revoked ? badge("revoked", "danger") : badge("paired", "success"))),
    h("div", { class: "ui-meta" }, h("span", {}, "device"), mono(device.deviceId), h("span", {}, "last sync"), device.lastSync ? timeEl(device.lastSync) : h("span", {}, "never"), tip("Pending", "Changes this device has not received yet."), h("span", {}, `${device.pendingOps} pending`)),
    h("div", { class: "ui-acts" }, button({ label: "Revoke", variant: "danger", size: "sm", icon: "x", disabled: device.revoked, onClick: async () => {
      const ok = await confirmDialog({ title: `Revoke ${device.name ?? device.deviceId}?`, message: "Its token stops working on the next call, so it can no longer push or pull. The device keeps its own local copy. To use it again you pair it again.", confirmLabel: "Revoke device", danger: true });
      if (!ok) return;
      await api("/api/hub/sync/revoke", { method: "POST", body: { device_id: device.deviceId } });
      toast("Device revoked.", { tone: "success" });
      ctx.changed();
    } })));
  return card;
}

export function devicesView(ctx) {
  const info = h("div", { class: "ui-sync-info" });
  const pairOut = h("div", { class: "ui-pair-out" });
  const list = pagedList({
    defaults: { limit: 10 }, label: "Devices",
    fetchPage: async (p) => { const data = await api(`/api/hub/sync/status?${queryString({ limit: p.limit, offset: p.offset })}`); return { items: data.devices, total: data.total ?? data.devices.length, data }; },
    renderItem: (device) => deviceCard(device, { changed: () => list.reload({ soft: true }) }),
    skeleton: () => skeleton({ kind: "card", count: 2 }),
    empty: () => emptyState({ title: "No paired devices", text: "Pair a second computer to keep one memory on both. Press Show pairing code, then run the join command on the other machine.", art: "offline", command: "aletheia sync pair" }),
    onData: (data) => {
      const sync = data.data;
      swap(info, h("div", { class: "ui-grid ui-stat-grid" }, statTile({ label: "Devices", value: sync.deviceCount ?? data.total }), statTile({ label: "Log position", value: sync.headSeq }), statTile({ label: "Epoch", value: sync.epoch })),
        h("p", { class: "ui-meta" }, sync.e2ee?.enabled ? `End-to-end encryption is on (key #${sync.e2ee.currentKid}).` : "End-to-end encryption is off. Turn it on from the command line: aletheia sync enable-e2ee."));
    },
  });
  const pair = button({ label: "Show pairing code", variant: "primary", icon: "plus", onClick: async () => {
    const result = await api("/api/hub/sync/pair", { method: "POST", body: {} });
    const join = `aletheia sync join ${result.url} ${result.code}`;
    swap(pairOut, h("div", { class: "ui-card" }, h("div", { class: "ui-meta" }, "Pairing code", mono(result.code)), h("p", { class: "ui-meta" }, "Run this on the other machine. The code works once."), h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, join), iconButton({ icon: "copy", label: "Copy the join command", onClick: () => copyText(join) }))));
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
    errorTitle: "Could not read the access links",
    render: (links) => {
      const create = button({ label: "Create MCP link", variant: "primary", icon: "plus", onClick: async () => {
        const link = await api("/api/hub/mcp-links", { method: "POST", body: {} });
        const snippet = `${link.claudeCode}\n\nClaude Desktop (claude_desktop_config.json):\n${link.claudeDesktop}`;
        const layer = modal({ title: "Your new MCP link", size: "lg", body: h("div", { class: "ui-detail" },
          h("p", {}, "The token is shown once. Copy it now; it cannot be shown again."),
          h("div", { class: "ui-meta" }, `scope ${link.scope}`, mono(link.token), mono(link.url)), codeBlock({ code: snippet, lang: "sh" })), actions: [button({ label: "Done", variant: "primary", onClick: () => layer.close(true) })] });
        reg.reload({ soft: true });
      } });
      const rows = links.map((link) => h("article", { class: "ui-card ui-item", "data-kind": "link", "data-id": link.id },
        h("div", { class: "ui-item-head" }, h("h3", { class: "ui-item-title", dir: "auto" }, link.name ? `Link #${link.id} (${link.name})` : `Link #${link.id}`), h("div", { class: "ui-row" }, badge(link.scope), link.revoked ? badge("revoked", "danger") : badge("active", "success"))),
        h("div", { class: "ui-meta" }, `projects: ${link.projects.length ? link.projects.join(", ") : "all"}`),
        h("div", { class: "ui-acts" }, button({ label: "Revoke", variant: "danger", size: "sm", icon: "x", disabled: link.revoked, onClick: async () => {
          const ok = await confirmDialog({ title: `Revoke link #${link.id}?`, message: "Any client using this token loses access at once. This cannot be undone; create a new link if you need one again.", confirmLabel: "Revoke link", danger: true });
          if (!ok) return;
          await api("/api/hub/mcp-links/revoke", { method: "POST", body: { id: link.id } });
          toast("Link revoked.", { tone: "success" });
          reg.reload({ soft: true });
        } }))));
      return h("div", {},
        h("p", { class: "ui-meta" }, "Read-only MCP links for remote clients such as Claude Code or Claude Desktop. The token travels in the Authorization header, never in the URL."),
        h("div", { class: "ui-acts" }, create),
        rows.length ? h("div", { class: "ui-list-rows" }, ...rows) : emptyState({ title: "No links yet", text: "Create a link to let one remote tool read your memory. Nothing is reachable from outside until you do.", art: "offline", compact: true }));
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
    empty: () => emptyState({ title: "No checks ran", compact: true }),
    errorTitle: "Could not run the checks",
    render: (data) => {
      const failing = data.checks.filter((check) => !check.ok).length;
      return h("div", {},
        h("div", { class: "ui-section-head" }, h("p", { class: "ui-meta", role: "status" }, failing ? `${failing} of ${data.checks.length} checks need attention.` : `All ${data.checks.length} checks pass.`, h("span", {}, "checked"), timeEl(data.generatedAt)), button({ label: "Run again", icon: "refresh", onClick: () => reg.reload({ soft: true }) })),
        h("div", { class: "ui-table-wrap" }, h("table", { class: "ui-table", "aria-label": "Doctor checks" },
          h("thead", {}, h("tr", {}, h("th", {}, "Check"), h("th", {}, "State"), h("th", {}, "Detail"))),
          h("tbody", {}, ...data.checks.map((check) => h("tr", {}, h("td", {}, check.name), h("td", {}, badge(check.ok ? "ok" : "needs attention", check.ok ? "success" : "danger")), h("td", { dir: "auto" }, check.detail)))))));
    },
  });
  return reg;
}

// ---- activity ------------------------------------------------------------------------------------------------------

export function activityView() {
  const defaults = { limit: 25, actor: "", action: "", since: "", until: "" };
  const list = pagedList({
    defaults, label: "Activity",
    fetchPage: (p) => api(`/api/hub/audit?${queryString({ limit: p.limit, offset: p.offset, actor: p.actor, action: p.action, since: p.since, until: p.until })}`).then((data) => ({ items: data.audit, total: data.total })),
    renderItem: (row) => h("article", { class: "ui-card ui-item ui-audit-row" },
      h("div", { class: "ui-item-head" }, h("code", { class: "ui-mono ui-item-title" }, row.action), h("div", { class: "ui-row" }, badge(row.actor), timeEl(row.at_epoch))),
      row.detail ? h("div", { class: "ui-meta ui-mono-block", dir: "ltr" }, JSON.stringify(row.detail).slice(0, 400)) : null),
    skeleton: () => skeleton({ kind: "card", count: 4 }),
    empty: () => emptyState({ title: "No activity yet", text: "Every change made from this page, the command line or a tool is listed here, newest first.", art: "review" }),
    emptyFiltered: () => emptyState({ title: "No activity matches", text: "Try fewer filters or a wider date range.", art: "search", compact: true }),
    toolbar: ({ state: s, set }) => filterBar([[
      textFilter({ key: "action", value: s.action, label: "Filter by action", placeholder: "Action, for example memory.add", onChange: (action) => set({ action }, { replace: true }) }),
      selectFilter({ key: "actor", label: "Actor", value: s.actor, options: ["ui", "api", "demo", "extract", "mcp"], allLabel: "Anyone", onChange: (actor) => set({ actor }) }),
      dateRange({ since: s.since, until: s.until, onChange: (range) => set(range) }),
    ]]),
  });
  return list;
}
