// T-138: the Tools tab. Read-only status from `aletheia doctor`: installed, hooks present, last capture,
// spool size, plus copy-ready commands. No install, uninstall or connect button is offered here.
import { classicViewerAvailable, formatWhen } from "../ui-core.js";
import { activityDetails, api, chip, copy, errorCard, errorText, h, run, settledValue, swap, toast } from "../ui-dom.js";

export async function renderTools() {
  const root = document.getElementById("ui-tools");
  const [doctorResult, overviewResult, syncResult, linksResult] = await Promise.allSettled([api("/api/hub/doctor"), api("/api/hub/overview"), api("/api/hub/sync/status"), api("/api/hub/mcp-links")]);
  const data = settledValue(doctorResult, null);
  const overview = settledValue(overviewResult, null);
  const sync = settledValue(syncResult, null);
  const links = settledValue(linksResult, null);
  if (!data) {
    swap(root, h("h1", {}, "Tools"), errorCard(errorText(doctorResult, "Doctor")));
    return;
  }
  const checkRows = data.checks.map((check) => h("tr", {},
    h("td", {}, check.name),
    h("td", {}, chip(check.ok ? "ok" : "fail", check.ok ? "ok" : "bad")),
    h("td", {}, check.detail)));
  const checksTable = h("table", { class: "ui-table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Check"), h("th", {}, "State"), h("th", {}, "Detail"))),
    h("tbody", {}, ...checkRows));
  swap(root,
    h("h1", {}, "Tools"),
    h("p", { class: "ui-meta" }, "Read-only status from `aletheia doctor`. Install, uninstall and connect stay in the CLI."),
    h("div", { class: "ui-meta" }, `Data: ${data.dataDir}`, ` · generated ${formatWhen(data.generatedAt)}`, overview ? ` · provider: ${overview.provider}` : ""),
    h("div", {}, ...data.tools.map(toolCard)),
    classicViewerCard(overview),
    syncPanel(sync, syncResult, renderTools),
    remoteAccessCard(links, linksResult, renderTools),
    h("h2", {}, "Doctor checks"),
    checksTable,
    activityDetails());
}

/** The old viewer is optional and only offered when its database exists. It is not part of the Work tab. */
function classicViewerCard(overview) {
  if (!classicViewerAvailable(overview)) return null;
  return h("div", { class: "ui-card" },
    h("h2", {}, "Classic claude-mem viewer (reads ~/.claude-mem, read-only)"),
    h("p", { class: "ui-meta" }, "The optional legacy page reads the old database directly. It is not part of the Work tab."),
    h("a", { class: "ui-button", href: "/work-view/work.html", target: "_blank", rel: "noreferrer" }, "Open the classic viewer"));
}

function toolCard(tool) {
  const hooksTone = tool.hooks.error ? "bad" : tool.hooks.present === tool.hooks.expected ? "ok" : "warn";
  return h("div", { class: "ui-card" },
    h("div", { class: "ui-row" }, h("b", {}, tool.name), chip(tool.installed ? "detected" : "not detected", tool.installed ? "ok" : ""), chip(`hooks ${tool.hooks.present}/${tool.hooks.expected}`, hooksTone)),
    h("div", { class: "ui-meta" }, `hooks file: ${tool.hooks.file}`),
    tool.hooks.error ? h("div", { class: "ui-meta" }, tool.hooks.error) : null,
    h("div", { class: "ui-meta" }, `last capture: ${tool.lastCapture ?? "never"}`, ` · spool: ${tool.spool.items} item(s), ${tool.spool.bytes} bytes`),
    h("div", { class: "ui-meta" }, `events: ${tool.hooks.events.join(", ")}`),
    h("div", { class: "ui-row" }, h("b", {}, "Copy-ready commands")),
    h("pre", { class: "ui-pre" }, [tool.commands.install, tool.commands.uninstall, tool.commands.doctor, `mcp: ${tool.commands.mcp}`, ...Object.entries(tool.hooks.commands).map(([event, command]) => `${event}: ${command}`)].join("\n")),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => copy([tool.commands.install, tool.commands.uninstall, tool.commands.doctor, `mcp: ${tool.commands.mcp}`].join("\n")) }, "Copy commands")));
}

/** The Sync section (T-102, T-104, T-117): devices, last sync, pending ops, revoke, a pairing code and
 *  the E2EE status line. */
function syncPanel(sync, result, refresh) {
  if (!sync) return errorCard(errorText(result, "Sync"));
  const devices = sync.devices ?? [];
  const e2ee = sync.e2ee?.enabled ? `end-to-end encryption: on (key #${sync.e2ee.currentKid})` : "end-to-end encryption: off";
  return h("section", { class: "ui-card" },
    h("h2", {}, "Sync"),
    h("p", { class: "ui-meta" }, `Epoch ${sync.epoch} · head seq ${sync.headSeq} · ${devices.length} paired device(s) · ${e2ee}`),
    devices.length ? h("div", {}, ...devices.map((device) => deviceCard(device, refresh))) : h("div", { class: "ui-empty" }, "No paired devices. Pair a device below."),
    pairControls(refresh));
}

function deviceCard(device, refresh) {
  return h("div", { class: "ui-card" },
    h("div", { class: "ui-row" },
      h("b", {}, device.name ?? device.deviceId),
      device.revoked ? chip("revoked", "bad") : chip("paired", "ok")),
    h("div", { class: "ui-meta" },
      h("span", {}, `device: ${device.deviceId}`),
      h("span", {}, `last sync: ${device.lastSync ? formatWhen(device.lastSync) : "never"}`),
      h("span", {}, `pending ops: ${device.pendingOps}`)),
    h("div", { class: "ui-acts" },
      h("button", {
        disabled: device.revoked,
        onclick: () => {
          if (!confirm(`Revoke ${device.name ?? device.deviceId}? Its token stops working on the next call, and it can no longer push or pull. The device keeps its local copy.`)) return;
          run(async () => {
            await api("/api/hub/sync/revoke", { method: "POST", body: { device_id: device.deviceId } });
            toast("Revoked");
            await refresh();
          });
        },
      }, "Revoke")));
}

function pairControls(refresh) {
  const out = h("div", {});
  const button = h("button", {
    class: "primary",
    onclick: () => run(async () => {
      const pair = await api("/api/hub/sync/pair", { method: "POST", body: {} });
      const join = `aletheia sync join ${pair.url} ${pair.code}`;
      swap(out,
        h("div", { class: "ui-meta" }, `Pairing code: ${pair.code}`),
        h("pre", { class: "ui-pre" }, join),
        h("div", { class: "ui-acts" }, h("button", { onclick: () => copy(join) }, "Copy join command")));
    }),
  }, "Show pairing code");
  return h("div", { class: "ui-acts" }, button, out);
}

/** The Remote access section (T-107): MCP links for Claude Code, Claude Desktop and other MCP clients. */
function remoteAccessCard(links, result, refresh) {
  if (!links) return errorCard(errorText(result, "Remote access"));
  const out = h("div", {});
  const create = h("button", {
    class: "primary",
    onclick: () => run(async () => {
      const link = await api("/api/hub/mcp-links", { method: "POST", body: {} });
      const snippet = `${link.claudeCode}\n\nClaude Desktop (claude_desktop_config.json):\n${link.claudeDesktop}`;
      swap(out,
        h("div", { class: "ui-meta" }, `Token shown once (scope ${link.scope}): ${link.token}`),
        h("div", { class: "ui-meta" }, link.url),
        h("pre", { class: "ui-pre" }, snippet),
        h("div", { class: "ui-acts" }, h("button", { onclick: () => copy(snippet) }, "Copy client config")));
      await refresh();
    }),
  }, "Create MCP link");
  const rows = (links.links ?? []).map((link) => h("div", { class: "ui-row" },
    h("span", {}, `#${link.id}`),
    chip(link.scope, ""),
    h("span", { class: "ui-meta" }, link.name ? ` (${link.name})` : ""),
    h("span", { class: "ui-meta" }, `projects: ${link.projects.length ? link.projects.join(", ") : "all"}`),
    link.revoked ? chip("revoked", "bad") : chip("active", "ok"),
    h("button", {
      disabled: link.revoked,
      onclick: () => run(async () => {
        await api("/api/hub/mcp-links/revoke", { method: "POST", body: { id: link.id } });
        toast("Revoked");
        await refresh();
      }),
    }, "Revoke")));
  return h("section", { class: "ui-card" },
    h("h2", {}, "Remote access"),
    h("p", { class: "ui-meta" }, "Read-only MCP links for remote clients. The token travels in the Authorization header, never in the URL."),
    rows.length ? h("div", {}, ...rows) : h("div", { class: "ui-empty" }, "No MCP links. Create one for Claude Code, Claude Desktop or another MCP client."),
    h("div", { class: "ui-acts" }, create, out));
}
