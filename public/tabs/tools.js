// T-138: the Tools tab. Read-only status from `aletheia doctor`: installed, hooks present, last capture,
// spool size, plus copy-ready commands. No install, uninstall or connect button is offered here.
import { formatWhen } from "../ui-core.js";
import { activityDetails, api, chip, copy, errorCard, errorText, h, settledValue, swap } from "../ui-dom.js";

export async function renderTools() {
  const root = document.getElementById("ui-tools");
  const [doctorResult, overviewResult] = await Promise.allSettled([api("/api/hub/doctor"), api("/api/hub/overview")]);
  const data = settledValue(doctorResult, null);
  const overview = settledValue(overviewResult, null);
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
    h("h2", {}, "Doctor checks"),
    checksTable,
    activityDetails());
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
