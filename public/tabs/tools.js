// the Tools tab. Pages: the tools and the commands to set each up, paired devices, remote access
// links, alert rules and their deliveries, teams, data safety (erasure and project merge), the doctor's checks and the activity log. Install, uninstall and connect stay on the command line. The old
// viewer is offered only when its database exists.
import { classicViewerAvailable } from "../ui-core.js";
import { button } from "../ui-components.js";
import { byId, h, state, swap } from "../ui-dom.js";
import { contextView } from "../ui-context.js";
import { t } from "../ui-i18n.js";
import { tabFrame } from "../ui-frame.js";
import { settingsView } from "./settings.js";
import { accessView, activityView, checksView, devicesView, toolsView } from "./tools-views.js";
import { alertsView, teamView } from "./tools-team.js";
import { dataView } from "./tools-data.js";

let frame = null;

/** The old viewer is optional and only offered when its database exists. It is not part of the Work tab. */
function classicViewerCard(overview) {
  if (!classicViewerAvailable(overview)) return null;
  return h("section", { class: "ui-card ui-classic" },
    h("h2", {}, t("toolsPage.classicTitle")),
    h("p", { class: "ui-meta" }, t("toolsPage.classicText")),
    h("a", { class: "ui-button", href: "/work-view/work.html", target: "_blank", rel: "noreferrer" }, t("toolsPage.classicOpen")));
}

function build() {
  const ctx = { classic: classicViewerCard };
  const made = tabFrame({
    tab: "tools",
    title: t("toolsPage.title"),
    lede: t("toolsPage.lede"),
    build: (sub) => ({ tools: toolsView, devices: devicesView, access: accessView, alerts: alertsView, team: teamView, data: dataView, checks: checksView, activity: activityView, context: contextView, settings: settingsView }[sub] ?? toolsView)(ctx),
  });
  made.project = state.project;
  frame = made;
  return made;
}

export async function renderTools(route = { sub: "tools", params: {} }) {
  const root = byId("ui-tools");
  if (!frame || !root.contains(frame.el)) {
    build();
    swap(root, frame.el);
  }
  frame.show(route);
}
