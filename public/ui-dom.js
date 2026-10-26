// Shared DOM helpers for the one UI. Views receive untrusted text and append it as text nodes; this module
// never builds markup from strings. Tab modules import what they need from here.

export const state = { project: "", query: "", health: "checking", factsHistory: false, loaded: {} };

export const byId = (id) => document.getElementById(id);

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "value") el.value = value;
    else if (key === "checked") el.checked = !!value;
    else if (key === "selected") el.selected = !!value;
    else if (key === "hidden") el.hidden = !!value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat(4)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};

export const swap = (el, ...kids) => el.replaceChildren(...kids.flat(4).filter((kid) => kid != null && kid !== false));
export const chip = (text, tone = "") => h("span", { class: `ui-chip ${tone}`.trim() }, text);

export function toast(message) {
  const el = byId("ui-toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Remote mode (T-110): state-changing calls echo the CSRF cookie in a header.
  if (method !== "GET") {
    const pair = (document.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("aletheia_csrf="));
    if (pair) headers["X-CSRF-Token"] = decodeURIComponent(pair.slice("aletheia_csrf=".length));
  }
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error((data && data.error) || `Request failed (${response.status})`);
  return data;
}

export async function run(fn, okMessage = null) {
  try {
    const result = await fn();
    if (okMessage) toast(okMessage);
    return result;
  } catch (error) {
    toast(error.message);
    return null;
  }
}

export const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast("Copied"), () => toast("Copy failed"));
export const qs = (project) => (project ? `project=${encodeURIComponent(project)}` : "");
export const settledValue = (result, fallback) => (result.status === "fulfilled" ? result.value : fallback);
export const errorText = (result, label) => (result.status === "rejected" ? `${label}: ${result.reason?.message ?? result.reason}` : null);
export const errorCard = (text) => (text ? h("div", { class: "ui-card" }, h("div", { class: "ui-meta" }, text)) : null);

/** The audit table. Shared by the Memory tab and the Tools tab so the activity is never lost. */
export function activityDetails() {
  const out = h("div", {});
  return h("details", { class: "ui-card" },
    h("summary", {}, "Activity"),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      const { audit } = await api("/api/hub/audit?limit=50");
      swap(out, audit.length
        ? h("table", { class: "ui-table" },
          h("thead", {}, h("tr", {}, ...["When", "Actor", "Action", "Detail"].map((label) => h("th", {}, label)))),
          h("tbody", {}, ...audit.map((row) => h("tr", {},
            h("td", {}, new Date(row.at_epoch).toISOString().replace("T", " ").slice(0, 16)),
            h("td", {}, row.actor),
            h("td", {}, row.action),
            h("td", {}, row.detail ? JSON.stringify(row.detail).slice(0, 140) : "")))))
        : h("div", { class: "ui-empty" }, "No activity yet."));
    }) }, "Load activity")),
    out);
}
