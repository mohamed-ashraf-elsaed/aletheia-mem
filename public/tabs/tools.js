// T-138, T-211: the Tools tab. Five pages: the tools and the commands to set each up, paired devices, remote access
// links, the doctor's checks and the activity log. Install, uninstall and connect stay on the command line. The old
// viewer is offered only when its database exists.
import { classicViewerAvailable } from "../ui-core.js";
import { button } from "../ui-components.js";
import { byId, h, state, swap } from "../ui-dom.js";
import { tabFrame } from "../ui-frame.js";
import { accessView, activityView, checksView, devicesView, toolsView } from "./tools-views.js";

let frame = null;

/** The old viewer is optional and only offered when its database exists. It is not part of the Work tab. */
function classicViewerCard(overview) {
  if (!classicViewerAvailable(overview)) return null;
  return h("section", { class: "ui-card ui-classic" },
    h("h2", {}, "Classic claude-mem viewer (reads ~/.claude-mem, read-only)"),
    h("p", { class: "ui-meta" }, "The optional legacy page reads the old database directly. It is not part of the Work tab."),
    h("a", { class: "ui-button", href: "/work-view/work.html", target: "_blank", rel: "noreferrer" }, "Open the classic viewer"));
}

function build() {
  const ctx = { classic: classicViewerCard };
  const made = tabFrame({
    tab: "tools",
    title: "Tools",
    lede: "The AI tools Aletheia captures from, the devices it syncs with, and a record of what changed.",
    build: (sub) => ({ tools: toolsView, devices: devicesView, access: accessView, checks: checksView, activity: activityView }[sub] ?? toolsView)(ctx),
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
