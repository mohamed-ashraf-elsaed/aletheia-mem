// The first-run guide: three steps shown while the store is empty. Install capture for your tool, start a
// session, see it here. Step 1 turns done by itself when the doctor sees hooks; step 3 waits for the first event and
// flips to done the moment data arrives. Every command has a Copy button. Nothing is run for you.
import { badge, brainLoader, button, copyText, icon, iconButton, statusDot } from "./ui-components.js";
import { t } from "./ui-i18n.js";
import { api, h, swap } from "./ui-dom.js";

export const GUIDE_HIDDEN_KEY = "aletheia.guide.hidden";

/** True when nothing has been captured yet: no memories and no facts. */
export const storeIsEmpty = ({ stats = {}, facts = 0 } = {}) => !(stats.total > 0) && !(facts > 0);

/** The doctor's view of tool `id`: has Aletheia installed its hooks there? */
export const hooksInstalled = (tools, id) => {
  const tool = tools.find((candidate) => candidate.id === id);
  return !!tool && tool.hooks.expected > 0 && tool.hooks.present >= tool.hooks.expected;
};

export function guideHidden(storage = globalThis.localStorage) {
  try { return storage?.getItem(GUIDE_HIDDEN_KEY) === "1"; } catch { return false; }
}

/**
 * firstRunGuide({ tools, onArrived, intervalMs })
 *   tools        the doctor's tool list (id, name, installed, hooks, commands).
 *   onArrived    called once, a moment after the first memory shows up.
 *   intervalMs   how often to look for the first event (0 turns the timer off; poll() still works).
 *   arrivedDelayMs  how long the done state stays before onArrived runs.
 * Returns the node with poll() and dispose().
 */
export function firstRunGuide({ tools = [], onArrived = () => {}, onHide = null, intervalMs = 3000, arrivedDelayMs = 2500, fetchState = defaultFetchState } = {}) {
  const preferred = tools.find((tool) => tool.installed) ?? tools.find((tool) => tool.id === "claude-code") ?? tools[0];
  let toolId = preferred?.id ?? "claude-code";
  let installed = hooksInstalled(tools, toolId);
  let arrived = null;
  let timer = null;
  let disposed = false;

  const root = h("section", { class: "ui-card ui-guide", "aria-labelledby": "ui-guide-title" });
  const select = h("select", { class: "ui-select", "aria-label": t("guide.yourTool"), onchange: (event) => { toolId = event.target.value; installed = hooksInstalled(tools, toolId); paint(); } },
    ...(tools.length ? tools : [{ id: "claude-code", name: "Claude Code" }]).map((tool) => h("option", { value: tool.id, selected: tool.id === toolId }, tool.name)));

  const command = (text, label) => h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, text), iconButton({ icon: "copy", label: label === "preview" ? t("guide.copyPreview") : t("guide.copyInstall"), onClick: () => copyText(text) }));
  const step = (number, done, title, ...body) => h("li", { class: `ui-guide-step${done ? " is-done" : ""}`, "aria-label": done ? t("guide.stepDone", { number }) : t("guide.step", { number }) },
    h("span", { class: "ui-guide-num", "aria-hidden": "true" }, done ? icon("check", { size: 16 }) : String(number)),
    h("div", { class: "ui-guide-body" }, h("h3", { class: "ui-guide-title" }, title, done ? badge(t("guide.done"), "success") : null), ...body));

  function paint() {
    const tool = tools.find((candidate) => candidate.id === toolId);
    const install = tool?.commands?.install ?? `aletheia install ${toolId} --write`;
    swap(root,
      h("div", { class: "ui-guide-head" },
        h("div", {}, h("h2", { id: "ui-guide-title", class: "ui-guide-h" }, arrived ? t("guide.arrivedTitle") : t("guide.title")), h("p", { class: "ui-meta" }, arrived ? (arrived.tool ? t("guide.arrivedBody", { tool: arrived.tool }) : t("guide.arrivedBodyUnknown")) : t("guide.emptyBody"))),
        onHide && !arrived ? button({ label: t("guide.hide"), variant: "ghost", size: "sm", onClick: () => onHide() }) : null),
      h("ol", { class: "ui-guide-steps" },
        step(1, installed || !!arrived, t("guide.step1Title"),
          h("div", { class: "ui-inline" }, h("label", { class: "ui-field" }, h("span", { class: "ui-field-label" }, t("guide.yourTool")), select)),
          h("p", { class: "ui-meta" }, t("guide.step1Body")),
          command(`aletheia install ${toolId}`, "preview"),
          command(install, "install")),
        step(2, !!arrived, t("guide.step2Title"),
          h("p", { class: "ui-meta" }, t("guide.step2Body"))),
        step(3, !!arrived, t("guide.step3Title"),
          arrived
            ? h("p", { class: "ui-meta" }, t("guide.step3Arrived"))
            : h("div", { class: "ui-guide-wait", role: "status" }, brainLoader({ size: 30, text: t("guide.waitingLoader") }), h("span", {}, t("guide.waiting")), statusDot("working")))));
  }

  async function poll() {
    if (disposed || arrived) return;
    try {
      const state = await fetchState();
      if (disposed) return;
      if (state.tools) { tools = state.tools; installed = hooksInstalled(tools, toolId); }
      if (state.captured) {
        arrived = { tool: state.tool };
        stop();
        paint();
        setTimeout(() => { if (!disposed) onArrived(); }, arrivedDelayMs);
        return;
      }
      paint();
    } catch {
      // the status bar reports an unreachable server; keep waiting
    }
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  paint();
  if (intervalMs > 0) timer = setInterval(poll, intervalMs);
  return Object.assign(root, { poll, dispose: () => { disposed = true; stop(); }, isArrived: () => !!arrived });
}

/** The default check: ask the API whether anything has been captured, and whether hooks are installed. */
async function defaultFetchState() {
  const [overview, doctor, work] = await Promise.all([api("/api/hub/overview"), api("/api/hub/doctor"), api("/v1/work?sessions=1&facts=1&review=1")]);
  const newest = (work.lastCapture ?? [])[0];
  return { captured: !storeIsEmpty({ stats: overview.stats }) || (work.lastCapture ?? []).length > 0, tool: newest?.tool, tools: doctor.tools };
}
