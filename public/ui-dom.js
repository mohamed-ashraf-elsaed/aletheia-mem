// Shared DOM helpers for the one UI. Views receive untrusted text and append it as text nodes; this module
// never builds markup from strings. Tab modules import what they need from here.

import { t } from "./ui-i18n.js";
export const state = { project: "", query: "", health: "checking", factsHistory: false, loaded: {} };

/** setTimeout that does nothing once the document is gone (a finished test, a torn-down window). */
export const later = (fn, ms) => setTimeout(() => { if (globalThis.document) fn(); }, ms);

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

let toastHandler = null;
/** The component library registers the real toast queue here, so older code that imports toast keeps working. */
export const setToastHandler = (fn) => { toastHandler = fn; };

export function toast(message, options) {
  if (toastHandler) return toastHandler(message, options);
  const el = byId("ui-toast");
  if (!el) return null;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
  return null;
}

/** A failed request. `status` is the HTTP status (0 when the server was unreachable) and `path` the request path. */
export class ApiError extends Error {
  constructor(message, { status = 0, path = "" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

// ---- the server's API key (ALETHEIA_API_KEY) --------------------------------------------------------------
// The key lives in sessionStorage, so it is gone when the tab closes, and goes only in the Authorization header.

const KEY_STORE = "aletheia.apiKey";
let keyInMemory = "";

export function storedKey() {
  try { const storage = globalThis.sessionStorage; if (storage) return storage.getItem(KEY_STORE) ?? ""; } catch { /* storage blocked */ }
  return keyInMemory;
}
export function storeKey(value) {
  keyInMemory = value || "";
  try {
    if (value) globalThis.sessionStorage?.setItem(KEY_STORE, value);
    else globalThis.sessionStorage?.removeItem(KEY_STORE);
  } catch { /* storage blocked: the key lasts until the page reloads */ }
}
export const authHeaders = () => { const key = storedKey(); return key ? { Authorization: `Bearer ${key}` } : {}; };

/** A 401 that asks for the API key. A remote-login "session required" 401 has no Bearer challenge. */
const isKeyChallenge = (response) => response.status === 401 && /^Bearer\b/i.test(response.headers?.get?.("www-authenticate") ?? "");

let keyPrompt = null;
let asking = null;
/** The shell registers the dialog that asks for the key: ({retry}) => key or null. */
export const setKeyPrompt = (fn) => { keyPrompt = fn; asking = null; };

/** Ask once, however many requests wait. Resolves true when the person entered a key. */
function askForKey(retry) {
  if (!keyPrompt) return Promise.resolve(false);
  asking ??= Promise.resolve()
    .then(() => keyPrompt({ retry }))
    .then((value) => { const key = String(value ?? "").trim(); if (key) storeKey(key); return !!key; }, () => false)
    .finally(() => { asking = null; });
  return asking;
}

/** fetch with the stored key. On a key challenge it asks for the key and sends the request again, at most three times. */
export async function authFetch(path, init = {}, fetchImpl = globalThis.fetch) {
  for (let round = 0; ; round += 1) {
    const used = storedKey();
    const response = await fetchImpl(path, { ...init, headers: { ...init.headers, ...authHeaders() } });
    if (!isKeyChallenge(response) || round === 3) return response;
    if (storedKey() !== used) continue; // another request already got a new key
    if (used) storeKey("");
    if (!(await askForKey(!!used))) return response;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Remote mode: state-changing calls echo the CSRF cookie in a header.
  if (method !== "GET") {
    const pair = (document.cookie ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("__Host-aletheia_csrf=") || part.startsWith("aletheia_csrf="));
    if (pair) {
      try {
        headers["X-CSRF-Token"] = decodeURIComponent(pair.slice(pair.indexOf("=") + 1));
      } catch { /* a bad cookie value is no token */ }
    }
  }
  let response;
  try {
    response = await authFetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    throw new ApiError(t("ui.serverUnreachable"), { status: 0, path });
  }
  const type = response.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new ApiError((data && data.error) || t("ui.requestFailed", { status: response.status }), { status: response.status, path });
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

export const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast(t("ui.copied")), () => toast(t("ui.copyFailedShort")));
export const qs = (project) => (project ? `project=${encodeURIComponent(project)}` : "");
export const settledValue = (result, fallback) => (result.status === "fulfilled" ? result.value : fallback);
export const errorText = (result, label) => (result.status === "rejected" ? `${label}: ${result.reason?.message ?? result.reason}` : null);
export const errorCard = (text) => (text ? h("div", { class: "ui-card" }, h("div", { class: "ui-meta" }, text)) : null);

/** The audit table. Shared by the Memory tab and the Tools tab so the activity is never lost. */
export function activityDetails() {
  const out = h("div", {});
  return h("details", { class: "ui-card" },
    h("summary", {}, t("ui.activity")),
    h("div", { class: "ui-acts" }, h("button", { onclick: () => run(async () => {
      const { audit } = await api("/api/hub/audit?limit=50");
      swap(out, audit.length
        ? h("table", { class: "ui-table" },
          h("thead", {}, h("tr", {}, ...[t("ui.when"), t("ui.actor"), t("ui.action"), t("ui.detail")].map((label) => h("th", {}, label)))),
          h("tbody", {}, ...audit.map((row) => h("tr", {},
            h("td", {}, new Date(row.at_epoch).toISOString().replace("T", " ").slice(0, 16)),
            h("td", {}, row.actor),
            h("td", {}, row.action),
            h("td", {}, row.detail ? JSON.stringify(row.detail).slice(0, 140) : "")))))
        : h("div", { class: "ui-empty" }, t("ui.noActivity")));
    }) }, t("ui.loadActivity"))),
    out);
}
