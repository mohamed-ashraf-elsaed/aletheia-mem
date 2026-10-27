// T-137, T-210: the Rules tab. Four pages: the rules, suggested rules, writing the rules into each tool's file, and
// importing from one. The frame shows the counts. Nothing is applied until you Accept, and a rule is turned off
// rather than deleted, so every hide action here can be undone.
import { button, toast } from "../ui-components.js";
import { api, byId, state, swap } from "../ui-dom.js";
import { tabFrame } from "../ui-frame.js";
import { addRuleDialog, importView, rulesView, suggestionsView, syncView } from "./rules-views.js";

let frame = null;

function build() {
  const ctx = {
    counts: (next) => { if (next.suggestions != null) frame.subnav.setCount("suggestions", next.suggestions); },
    changed: () => refreshCounts(),
    addRule: async () => {
      let tools = [];
      try { tools = (await api("/api/hub/tools")).tools; } catch { /* the dialog still works without the tool list */ }
      addRuleDialog({ tools, onAdded: () => { const view = frame.current(); view?.reload?.(); } });
    },
  };
  const refreshCounts = async () => {
    try {
      const p = state.project ? `&project=${encodeURIComponent(state.project)}` : "";
      const pending = await api(`/api/hub/rule-suggestions?status=pending&limit=1${p}`);
      frame.subnav.setCount("suggestions", pending.total);
    } catch { /* the page itself shows its own errors */ }
  };
  const made = tabFrame({
    tab: "rules",
    title: "Rules",
    lede: "How you want every AI tool to work. Write a rule once, then write it into each tool's file.",
    actions: [button({ label: "Add a rule", variant: "primary", icon: "plus", onClick: () => ctx.addRule() })],
    build: (sub) => ({ rules: rulesView, suggestions: suggestionsView, sync: syncView, import: importView }[sub] ?? rulesView)(ctx),
  });
  made.project = state.project;
  frame = made;
  refreshCounts();
  return made;
}

export async function renderRules(route = { sub: "rules", params: {} }) {
  const root = byId("ui-rules");
  if (!frame || frame.project !== state.project || !root.contains(frame.el)) {
    build();
    swap(root, frame.el);
  }
  frame.show(route);
}
