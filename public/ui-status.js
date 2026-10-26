// The status bar (first version, T-205): one indicator for the server. T-206 replaces this with the full bar.
import { statusDot } from "./ui-components.js";
import { h, state, swap } from "./ui-dom.js";
import { faviconHref } from "./ui-brand.js";
import { healthView } from "./ui-core.js";

export function setFaviconState(kind, doc = globalThis.document) {
  const link = doc.getElementById("ui-favicon");
  if (!link) return;
  link.setAttribute("type", "image/svg+xml");
  link.setAttribute("href", faviconHref(kind));
}

export function mountStatus({ el, healthEl }) {
  const label = h("span", {}, "Checking…");
  const dot = statusDot("idle");
  const item = h("span", { class: "ui-status-item" }, dot, label);
  swap(el, item);
  const poll = async () => {
    try {
      const response = await fetch("/v1/health", { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      state.health = response.ok && data.status === "ok" ? "ok" : "down";
    } catch {
      state.health = "down";
    }
    const view = healthView(state.health);
    dot.className = `ui-dot is-${state.health === "ok" ? "ok" : "error"}`;
    label.textContent = view.label;
    healthEl.className = `ui-health ${view.state} ui-sr`;
    healthEl.textContent = view.dot;
    healthEl.setAttribute("aria-label", view.label);
    setFaviconState(state.health === "ok" ? "idle" : "error");
  };
  poll();
  setInterval(poll, 30_000);
}
