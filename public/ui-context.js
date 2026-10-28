// Context preview: the exact block a session-start hook would read for this project. It comes from
// POST /v1/context, the same route the MCP session_start_context tool and the CLI use, and is rendered as plain
// text (never innerHTML) so the wrapped memory stays data, not markup.
import { emptyState, skeleton } from "./ui-components.js";
import { api, h, state } from "./ui-dom.js";
import { region } from "./ui-region.js";

export function contextView() {
  return region({
    skeleton: () => skeleton({ kind: "card", count: 1 }),
    load: () => api("/v1/context", { method: "POST", body: { project: state.project || undefined, limit: 20 } }),
    isEmpty: (data) => !data.context,
    empty: () => emptyState({ title: "No context yet", text: "Nothing would be injected for this project. Capture some memories first.", compact: true }),
    errorTitle: "Could not load the context",
    render: (data) => h("div", { class: "ui-context-preview" },
      h("p", { class: "ui-meta" }, "The exact block a session-start hook reads. It is memory data, never instructions."),
      h("pre", { class: "ui-mono-block ui-context-block", tabindex: "0", dir: "ltr" }, data.context)),
  });
}
