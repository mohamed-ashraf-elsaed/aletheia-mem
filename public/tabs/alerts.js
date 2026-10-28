// the Alerts tab. Rules, the delivery feed and the test/run buttons over `/api/hub/alerts/*`.
// The one-UI shell wires `renderAlerts`; this module touches no other file.
import { api, chip, errorCard, errorText, h, run, swap, toast } from "../ui-dom.js";

const EVENTS = ["device.paired", "token.revoked", "quota.hit", "sync.error", "extraction.failed", "queue.depth"];

export async function renderAlerts() {
  const root = document.getElementById("ui-alerts");
  const result = await Promise.allSettled([api("/api/hub/alerts/rules"), api("/api/hub/alerts/feed?limit=30")]);
  const rules = result[0].status === "fulfilled" ? result[0].value.rules : null;
  const feed = result[1].status === "fulfilled" ? result[1].value.deliveries : [];
  if (!rules) {
    swap(root, h("h1", {}, "Alerts"), errorCard(errorText(result[0], "Alerts")));
    return;
  }
  const list = h("div", {});
  const rows = feed.map((row) => h("tr", {},
    h("td", {}, `#${row.id}`),
    h("td", {}, row.event),
    h("td", {}, chip(row.status, row.status === "delivered" ? "ok" : row.status === "failed" ? "bad" : "warn")),
    h("td", {}, String(row.attempts)),
    h("td", {}, row.lastError ?? "")));

  const form = h("div", { class: "ui-card" },
    h("h2", {}, "Add a rule"),
    h("div", { class: "ui-row" },
      h("input", { placeholder: "Name", id: "alert-name" }),
      h("select", { id: "alert-event" }, ...EVENTS.map((event) => h("option", { value: event }, event)))),
    h("div", { class: "ui-row" },
      h("select", { id: "alert-target" }, h("option", { value: "file" }, "local file"), h("option", { value: "webhook" }, "webhook")),
      h("input", { placeholder: "path or https:// URL", id: "alert-place" }),
      h("input", { placeholder: "HMAC secret (optional)", id: "alert-secret" })),
    h("div", { class: "ui-row" },
      h("input", { placeholder: "count threshold", id: "alert-count", type: "number", value: "1" }),
      h("input", { placeholder: "min value", id: "alert-min", type: "number" }),
      h("label", {}, h("input", { type: "checkbox", id: "alert-private" }), " allow private"),
      h("button", { class: "primary", onclick: () => run(async () => {
        const target = document.getElementById("alert-target").value;
        const place = document.getElementById("alert-place").value.trim();
        const count = Number(document.getElementById("alert-count").value) || 1;
        const min = document.getElementById("alert-min").value;
        await api("/api/hub/alerts/rules", { method: "POST", body: {
          name: document.getElementById("alert-name").value.trim() || undefined,
          event: document.getElementById("alert-event").value,
          target,
          url: target === "webhook" ? place : undefined,
          path: target === "file" ? place : undefined,
          secret: document.getElementById("alert-secret").value.trim() || undefined,
          countThreshold: count,
          minValue: min === "" ? undefined : Number(min),
          allowPrivate: document.getElementById("alert-private").checked,
        } });
        toast("Rule added");
        await renderAlerts();
      }) }, "Add")));

  swap(root,
    h("h1", {}, "Alerts"),
    h("p", { class: "ui-meta" }, "Rules match device, token, quota, sync, extraction and queue events. Webhook bodies are signed with HMAC-SHA256; private targets need explicit permission."),
    h("div", { class: "ui-card" },
      h("h2", {}, "Rules"),
      rules.length ? h("div", {}, ...rules.map(ruleCard)) : h("div", { class: "ui-empty" }, "No rules yet.")),
    form,
    h("div", { class: "ui-card" },
      h("h2", {}, "Delivery feed"),
      h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
        const out = await api("/api/hub/alerts/run", { method: "POST", body: {} });
        toast(`delivered ${out.delivered}, retried ${out.retried}, failed ${out.failed}`);
        await renderAlerts();
      }) }, "Deliver due")),
      rows.length ? h("table", { class: "ui-table" },
        h("thead", {}, h("tr", {}, ...["#", "Event", "State", "Attempts", "Last error"].map((label) => h("th", {}, label)))),
        h("tbody", {}, ...rows))
        : h("div", { class: "ui-empty" }, "No deliveries.")));
}

function ruleCard(rule) {
  return h("div", { class: "ui-row" },
    h("b", {}, `#${rule.id} ${rule.name}`),
    chip(rule.event, ""),
    rule.hasSecret ? chip("signed", "ok") : null,
    rule.allowPrivate ? chip("private allowed", "warn") : null,
    h("span", { class: "ui-meta" }, rule.target === "file" ? rule.path : rule.url),
    h("button", { onclick: () => run(async () => {
      const out = await api("/api/hub/alerts/test", { method: "POST", body: { id: rule.id } });
      toast(`test: delivered ${out.delivered}, failed ${out.failed}, blocked ${out.blocked}`);
    }) }, "Test"),
    h("button", { onclick: () => run(async () => {
      if (!confirm(`Remove alert rule #${rule.id}?`)) return;
      await api(`/api/hub/alerts/rules/${rule.id}`, { method: "DELETE" });
      await renderAlerts();
    }) }, "Remove"));
}
