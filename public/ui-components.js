// The Aletheia component library (T-204). Every function returns a DOM node built with createElement,
// createTextNode and setAttribute; text from data is only ever set as text. No framework, no markup strings, no
// inline event handlers. Components that change over time return the node with a few methods attached.
import { brainLoader, emptyArt } from "./ui-brand.js";
import { icon } from "./ui-icons.js";
import { renderMarkdown } from "./ui-markdown.js";
import { animate, collapse, countUp, enter, expand, leave, reducedMotion, shake } from "./ui-motion.js";
import { PAGE_SIZES, errorDetails, formatDateTime, formatNumber, highlightParts, pagerModel, relativeTime, rovingIndex, trapTarget } from "./ui-pure.js";
import { h, setToastHandler, swap } from "./ui-dom.js";

const doc = () => globalThis.document;

/** Can this node take keyboard focus right now? A plain predicate, so it works on any DOM. */
export function isFocusable(node) {
  if (!node || node.nodeType !== 1 || node.hidden) return false;
  const tabindex = node.getAttribute("tabindex");
  if (tabindex === "-1") return false;
  if (node.disabled || node.getAttribute("disabled") != null) return false;
  const tag = String(node.tagName ?? "").toLowerCase();
  if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") return true;
  if (tag === "a") return node.getAttribute("href") != null;
  return tabindex != null;
}
let uid = 0;
const nextId = (prefix) => `${prefix}-${(uid += 1)}`;

export { icon };

/** Copy text and say so. The only place the clipboard is touched. */
export async function copyText(text, { quiet = false } = {}) {
  try {
    await globalThis.navigator.clipboard.writeText(String(text));
    if (!quiet) toast("Copied", { tone: "success", duration: 1800 });
    return true;
  } catch {
    if (!quiet) toast("Could not copy. Select the text and copy it by hand.", { tone: "warning" });
    return false;
  }
}

// ---- status and badges -----------------------------------------------------------------------------------

export const badge = (text, tone = "neutral", { title } = {}) => h("span", { class: `ui-chip ui-badge tone-${tone} ${tone}`, title }, text);

/** A coloured dot. state: ok, working, warn, error, idle or unknown. Working pulses; error is announced by the caller. */
export function statusDot(state = "unknown", { label } = {}) {
  return h("span", { class: `ui-dot is-${state}`, role: label ? "img" : null, "aria-label": label, "aria-hidden": label ? null : "true" });
}

export const spinner = ({ size = 16, label = null } = {}) =>
  h("span", { class: "ui-spinner", role: label ? "status" : null, "aria-label": label, "aria-hidden": label ? null : "true", "data-size": size });

export { brainLoader };

// ---- buttons ---------------------------------------------------------------------------------------------

/**
 * A button. `onClick` may return a promise: the button then shows a spinner and disables itself, shows a check on
 * success, and on failure shakes, shows the error in a toast and re-enables. Variants: primary, secondary, ghost, danger.
 */
export function button({ label, variant = "secondary", icon: iconName = null, onClick = null, title, type = "button", disabled = false, size = "md", ariaLabel, loading = false, href = null, pressed = null, className = "" } = {}) {
  const tag = href ? "a" : "button";
  const slot = h("span", { class: "ui-btn-icon", "aria-hidden": "true" });
  const text = h("span", { class: "ui-btn-label" }, label ?? "");
  const el = h(tag, {
    class: `ui-btn ui-btn-${variant} ui-btn-${size} ${className}`.trim(),
    type: href ? null : type,
    href,
    title,
    "aria-label": ariaLabel,
    "aria-pressed": pressed == null ? null : String(pressed),
    disabled: !href && disabled,
  }, slot, text);
  const setIcon = (node) => { swap(slot, node); slot.hidden = !node; };
  setIcon(iconName ? icon(iconName, { size: 16 }) : null);
  let busy = false;
  let timer = null;
  const set = (state) => {
    clearTimeout(timer);
    el.classList.remove("is-loading", "is-ok", "is-err");
    el.removeAttribute("aria-busy");
    if (state === "loading") {
      busy = true;
      el.classList.add("is-loading");
      el.setAttribute("aria-busy", "true");
      setIcon(spinner());
    } else if (state === "ok") {
      el.classList.add("is-ok");
      setIcon(icon("check", { size: 16 }));
    } else if (state === "err") {
      el.classList.add("is-err");
      setIcon(icon("x", { size: 16 }));
    } else {
      setIcon(iconName ? icon(iconName, { size: 16 }) : null);
    }
    if (state === "ok" || state === "err") timer = setTimeout(() => set("idle"), state === "ok" ? 1100 : 1600);
    if (state !== "loading") busy = false;
  };
  el.setLoading = (on) => set(on ? "loading" : "idle");
  if (loading) set("loading");
  if (onClick) {
    el.addEventListener("click", async (event) => {
      if (busy || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      let result;
      try { result = onClick(event); } catch (error) { result = Promise.reject(error); }
      if (!result || typeof result.then !== "function") return;
      // Keep the width steady while the label area swaps content.
      const width = el.getBoundingClientRect?.().width;
      if (width) el.style.minWidth = `${Math.ceil(width)}px`;
      set("loading");
      el.disabled = true;
      try {
        await result;
        set("ok");
      } catch (error) {
        set("err");
        shake(el);
        toast(error?.message ?? "That did not work.", { tone: "danger" });
      } finally {
        el.disabled = disabled;
      }
    });
  }
  return el;
}

export const iconButton = ({ icon: iconName, label, onClick, variant = "ghost", title, pressed = null, disabled = false, href = null } = {}) =>
  button({ icon: iconName, label: "", ariaLabel: label, title: title ?? label, onClick, variant, pressed, disabled, href, size: "icon", className: "ui-btn-icononly" });

// ---- toasts ----------------------------------------------------------------------------------------------

const toasts = { visible: [], waiting: [], max: 3 };

function toastRegion() {
  let region = doc().getElementById?.("ui-toasts");
  if (!region) {
    region = h("div", { id: "ui-toasts", class: "ui-toasts", role: "status", "aria-live": "polite", "aria-atomic": "false" });
    doc().body.append(region);
  }
  return region;
}

/** Show a message. Three at a time; the rest wait. `action` adds a button ({ label, onClick }). Returns { dismiss }. */
export function toast(message, { tone = "info", action = null, duration = 4000 } = {}) {
  // A replaced document (a test, or a hot reload) can leave entries whose element is gone; forget them.
  toasts.visible = toasts.visible.filter((other) => other.el?.isConnected !== false);
  const entry = { message, tone, action, duration, el: null, timer: null, done: false };
  entry.dismiss = () => dismissToast(entry);
  if (toasts.visible.length >= toasts.max) toasts.waiting.push(entry);
  else showToast(entry);
  return { dismiss: entry.dismiss };
}

function showToast(entry) {
  const { message, tone, action, duration } = entry;
  const close = iconButton({ icon: "x", label: "Dismiss message", onClick: () => entry.dismiss() });
  const kids = [h("span", { class: "ui-toast-icon", "aria-hidden": "true" }, icon(tone === "success" ? "check" : tone === "danger" ? "alert" : tone === "warning" ? "alert" : "info", { size: 16 })), h("span", { class: "ui-toast-text", dir: "auto" }, message)];
  if (action) kids.push(button({ label: action.label, variant: "ghost", size: "sm", onClick: async () => { entry.dismiss(); await action.onClick?.(); } }));
  kids.push(close);
  entry.el = h("div", { class: `ui-toast-item tone-${tone}` }, ...kids);
  if (duration > 0) {
    entry.el.style.setProperty("--ui-toast-ms", `${duration}ms`);
    entry.el.classList.add("has-timer");
  }
  toasts.visible.push(entry);
  toastRegion().append(entry.el);
  enter(entry.el, "slide-right");
  const start = () => { clearTimeout(entry.timer); if (duration > 0) entry.timer = setTimeout(() => entry.dismiss(), duration); };
  entry.el.addEventListener("mouseenter", () => { clearTimeout(entry.timer); entry.el.classList.add("is-paused"); });
  entry.el.addEventListener("mouseleave", () => { entry.el.classList.remove("is-paused"); start(); });
  start();
}

async function dismissToast(entry) {
  if (entry.done) return;
  entry.done = true;
  clearTimeout(entry.timer);
  const index = toasts.visible.indexOf(entry);
  if (index >= 0) toasts.visible.splice(index, 1);
  else toasts.waiting = toasts.waiting.filter((other) => other !== entry);
  if (entry.el) {
    await leave(entry.el, "slide-right");
    entry.el.remove?.();
  }
  const next = toasts.waiting.shift();
  if (next) showToast(next);
}

/** A message with an Undo button that stays for 8 seconds. */
export const undoToast = (message, onUndo, { duration = 8000 } = {}) => toast(message, { tone: "info", duration, action: { label: "Undo", onClick: onUndo } });

setToastHandler(toast);

// ---- layers: modal, confirm, drawer ----------------------------------------------------------------------

const layers = [];

/** Forget module state. Tests call this when they install a fresh document. */
export function resetUi() {
  toasts.visible = [];
  toasts.waiting = [];
  layers.length = 0;
  tipEl = null;
}

function openLayer({ title, body, actions = [], side = null, size = "md", onClose, closeOnBackdrop = true, initialFocus = null }) {
  const titleId = nextId("ui-layer-title");
  const opener = doc().activeElement;
  const closeButton = iconButton({ icon: "x", label: "Close", onClick: () => api.close(null) });
  const panel = h("div", { class: `ui-layer-panel ${side ? "ui-drawer" : "ui-modal"} size-${size}`, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" },
    h("div", { class: "ui-layer-head" }, h("h2", { id: titleId, class: "ui-layer-title", dir: "auto" }, title), closeButton),
    h("div", { class: "ui-layer-body" }, body),
    actions.length ? h("div", { class: "ui-layer-actions" }, ...actions) : null);
  const overlay = h("div", { class: `ui-overlay${side ? " is-drawer" : ""}` }, panel);
  let closed = false;
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const focusables = () => [...panel.querySelectorAll("*")].filter(isFocusable);
  const api = {
    el: panel,
    result,
    async close(value = null) {
      if (closed) return;
      closed = true;
      layers.splice(layers.indexOf(api), 1);
      doc().removeEventListener("keydown", onKey, true);
      await Promise.all([leave(panel, side ? "slide-right" : "scale"), animate(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" })]);
      overlay.remove?.();
      if (!layers.length) doc().getElementById?.("ui-app")?.removeAttribute("inert");
      opener?.focus?.();
      onClose?.(value);
      resolveResult(value);
    },
  };
  function onKey(event) {
    if (layers[layers.length - 1] !== api) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); api.close(null); return; }
    if (event.key !== "Tab") return;
    const list = focusables();
    const target = trapTarget(list.length, list.indexOf(doc().activeElement), event.shiftKey);
    if (target >= 0) { event.preventDefault(); list[target].focus(); }
    else { event.preventDefault(); panel.focus?.(); }
  }
  if (closeOnBackdrop) overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) api.close(null); });
  doc().addEventListener("keydown", onKey, true);
  layers.push(api);
  doc().body.append(overlay);
  doc().getElementById?.("ui-app")?.setAttribute("inert", "");
  animate(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  enter(panel, side ? "slide-right" : "scale");
  const first = initialFocus?.() ?? focusables().find((node) => node !== closeButton) ?? closeButton;
  (first ?? panel).focus?.();
  return api;
}

/** A modal dialog. Focus stays inside, Esc and the backdrop close it, and focus returns to the opener. */
export const modal = (options) => openLayer(options);

/** A side panel with the same behaviour as a modal. */
export const drawer = (options) => openLayer({ ...options, side: options.side ?? "right", size: options.size ?? "lg" });

/**
 * Ask before something that cannot be undone. Say what will happen in `message`. Resolves true or false.
 * The safe button has focus when the action is dangerous.
 */
export function confirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, details = null } = {}) {
  let cancelButton;
  const confirmButton = button({ label: confirmLabel, variant: danger ? "danger" : "primary", onClick: () => layer.close(true) });
  cancelButton = button({ label: cancelLabel, variant: "secondary", onClick: () => layer.close(false) });
  const layer = openLayer({
    title,
    body: [h("p", { dir: "auto", class: "ui-layer-text" }, message), details ? h("div", { class: "ui-meta" }, details) : null],
    actions: [cancelButton, confirmButton],
    size: "sm",
    initialFocus: () => (danger ? cancelButton : confirmButton),
  });
  return layer.result.then((value) => value === true);
}

/** A one-line text prompt in a dialog. Resolves the trimmed text, or null when cancelled. */
export function promptDialog({ title, label, value = "", confirmLabel = "Save", placeholder = "" } = {}) {
  const input = h("input", { type: "text", class: "ui-input", value, placeholder, dir: "auto", "aria-label": label });
  const submit = () => layer.close(input.value.trim() || null);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } });
  const layer = openLayer({
    title,
    body: h("label", { class: "ui-field" }, h("span", { class: "ui-field-label" }, label), input),
    actions: [button({ label: "Cancel", onClick: () => layer.close(null) }), button({ label: confirmLabel, variant: "primary", onClick: submit })],
    size: "sm",
    initialFocus: () => input,
  });
  return layer.result;
}

// ---- tabs, segmented control, toggle ---------------------------------------------------------------------

/** Move a sliding indicator under the active item. Uses transform and width, so it stays on the GPU. */
export function moveIndicator(container, indicator, active) {
  if (!container || !indicator || !active) return;
  const box = container.getBoundingClientRect?.();
  const rect = active.getBoundingClientRect?.();
  if (!box || !rect || !rect.width) return;
  indicator.style.width = `${rect.width}px`;
  indicator.style.transform = `translateX(${rect.left - box.left + (container.scrollLeft ?? 0)}px)`;
  indicator.classList.add("is-ready");
}

/**
 * A row of tabs with a sliding indicator. Items with `href` render as links (the app's main navigation); the rest
 * render as buttons. Arrow keys, Home and End move between tabs.
 */
export function tabs({ items, active, onChange = null, label = "Sections", className = "" } = {}) {
  const indicator = h("span", { class: "ui-tab-indicator", "aria-hidden": "true" });
  const nodes = new Map();
  const list = h("div", { class: `ui-tablist ${className}`.trim(), role: "tablist", "aria-label": label }, indicator);
  const select = (id, { focus = false, notify = true } = {}) => {
    for (const [key, node] of nodes) {
      const on = key === id;
      node.setAttribute("aria-selected", String(on));
      node.setAttribute("tabindex", on ? "0" : "-1");
      node.classList.toggle("on", on);
      if (on && node.setAttribute) node.setAttribute("data-active", "1"); else node.removeAttribute?.("data-active");
    }
    const node = nodes.get(id);
    moveIndicator(list, indicator, node);
    if (focus) node?.focus?.();
    if (notify) onChange?.(id);
  };
  items.forEach((item, index) => {
    const content = [item.icon ? icon(item.icon, { size: 16 }) : null, h("span", { class: "ui-tab-text" }, item.label), item.count != null ? h("span", { class: "ui-tab-count" }, formatNumber(item.count)) : null];
    const node = h(item.href ? "a" : "button", { class: "ui-tab", role: "tab", href: item.href, type: item.href ? null : "button", "data-tab": item.id, id: item.domId }, ...content);
    node.addEventListener("click", () => { if (!item.href) select(item.id); });
    node.addEventListener("keydown", (event) => {
      const next = rovingIndex(index, items.length, event.key);
      if (next == null) return;
      event.preventDefault();
      const target = items[next];
      if (item.href) nodes.get(target.id).focus?.();
      else select(target.id, { focus: true });
    });
    nodes.set(item.id, node);
    list.append(node);
  });
  list.setActive = (id, options) => select(id, { notify: false, ...options });
  list.refreshIndicator = () => moveIndicator(list, indicator, nodes.get([...nodes.keys()].find((key) => nodes.get(key).getAttribute("aria-selected") === "true")));
  list.setCount = (id, count) => {
    const countEl = nodes.get(id)?.querySelector?.(".ui-tab-count");
    if (countEl) countEl.textContent = formatNumber(count);
  };
  select(active ?? items[0]?.id, { notify: false });
  if (typeof globalThis.ResizeObserver === "function") new globalThis.ResizeObserver(() => list.refreshIndicator()).observe(list);
  return list;
}

/** A group of mutually exclusive choices that looks like one control. */
export function segmented({ options, value, onChange, label }) {
  const buttons = new Map();
  const group = h("div", { class: "ui-segmented", role: "radiogroup", "aria-label": label });
  let current = value;
  const set = (next, { notify = true } = {}) => {
    current = next;
    for (const [key, node] of buttons) {
      node.setAttribute("aria-checked", String(key === next));
      node.setAttribute("tabindex", key === next ? "0" : "-1");
      node.classList.toggle("on", key === next);
    }
    if (notify) onChange?.(next);
  };
  options.forEach((option, index) => {
    const node = h("button", { class: "ui-seg", type: "button", role: "radio", "data-value": option.value }, option.icon ? icon(option.icon, { size: 14 }) : null, h("span", {}, option.label), option.count != null ? h("span", { class: "ui-seg-count" }, formatNumber(option.count)) : null);
    node.addEventListener("click", () => set(option.value));
    node.addEventListener("keydown", (event) => {
      const next = rovingIndex(index, options.length, event.key);
      if (next == null) return;
      event.preventDefault();
      set(options[next].value);
      buttons.get(options[next].value).focus?.();
    });
    buttons.set(option.value, node);
    group.append(node);
  });
  group.set = (next) => set(next, { notify: false });
  group.value = () => current;
  set(value, { notify: false });
  return group;
}

/** An on/off switch with a visible label. */
export function toggle({ label, checked = false, onChange, hint }) {
  const input = h("button", { class: "ui-switch", type: "button", role: "switch", "aria-checked": String(checked) });
  const wrap = h("label", { class: "ui-toggle" }, input, h("span", { class: "ui-toggle-label" }, label), hint ? h("span", { class: "ui-meta" }, hint) : null);
  const set = (value, notify = true) => {
    input.setAttribute("aria-checked", String(value));
    if (notify) onChange?.(value);
  };
  input.addEventListener("click", () => set(input.getAttribute("aria-checked") !== "true"));
  wrap.set = (value) => set(value, false);
  return wrap;
}

// ---- tooltip and popover ---------------------------------------------------------------------------------

let tipEl = null;
function placeFloating(el, anchor, placement = "bottom") {
  const rect = anchor.getBoundingClientRect?.();
  if (!rect) return;
  const width = el.offsetWidth ?? 0;
  const height = el.offsetHeight ?? 0;
  const vw = globalThis.innerWidth ?? 1024;
  const vh = globalThis.innerHeight ?? 768;
  let top = placement === "top" ? rect.top - height - 8 : rect.bottom + 8;
  if (top + height > vh - 8) top = Math.max(8, rect.top - height - 8);
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), Math.max(8, vw - width - 8));
  el.style.top = `${Math.round(top)}px`;
  el.style.left = `${Math.round(left)}px`;
}

/** Attach a short explanation to an element. Shown on hover and keyboard focus; also read as its description. */
export function withTooltip(target, text, { placement = "bottom" } = {}) {
  const id = nextId("ui-tip");
  target.setAttribute("aria-describedby", id);
  const show = () => {
    if (!tipEl || tipEl.isConnected === false) { tipEl = h("div", { class: "ui-tooltip", role: "tooltip", hidden: true }); doc().body.append(tipEl); }
    tipEl.setAttribute("id", id);
    tipEl.textContent = text;
    tipEl.hidden = false;
    placeFloating(tipEl, target, placement);
    tipEl.classList.add("is-open");
  };
  const hide = () => { if (tipEl) { tipEl.hidden = true; tipEl.classList.remove("is-open"); } };
  target.addEventListener("mouseenter", show);
  target.addEventListener("focus", show);
  target.addEventListener("mouseleave", hide);
  target.addEventListener("blur", hide);
  target.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
  return target;
}

/**
 * A small panel anchored to a control: the status bar's details. Click or Enter opens it; Esc, a click outside or
 * focus leaving closes it. `content` is a node or a function returning one, called each time it opens.
 */
export function popover({ anchor, content, label = "Details", placement = "bottom" }) {
  const panel = h("div", { class: "ui-popover", role: "dialog", "aria-label": label, tabindex: "-1", hidden: true });
  let open = false;
  const outside = (event) => { if (!panel.contains?.(event.target) && !anchor.contains?.(event.target)) api.close(); };
  const api = {
    el: panel,
    isOpen: () => open,
    open() {
      if (open) return;
      open = true;
      swap(panel, typeof content === "function" ? content() : content);
      if (!panel.parentNode) doc().body.append(panel);
      panel.hidden = false;
      anchor.setAttribute("aria-expanded", "true");
      placeFloating(panel, anchor, placement);
      enter(panel, "scale");
      doc().addEventListener("mousedown", outside, true);
    },
    close({ restoreFocus = false } = {}) {
      if (!open) return;
      open = false;
      panel.hidden = true;
      anchor.setAttribute("aria-expanded", "false");
      doc().removeEventListener("mousedown", outside, true);
      if (restoreFocus) anchor.focus?.();
    },
    toggle() { open ? api.close() : api.open(); },
    refresh() { if (open) { swap(panel, typeof content === "function" ? content() : content); placeFloating(panel, anchor, placement); } },
  };
  anchor.setAttribute("aria-haspopup", "dialog");
  anchor.setAttribute("aria-expanded", "false");
  anchor.addEventListener("click", () => api.toggle());
  panel.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.stopPropagation(); api.close({ restoreFocus: true }); } });
  anchor.addEventListener("keydown", (event) => { if (event.key === "Escape" && open) { event.stopPropagation(); api.close({ restoreFocus: true }); } });
  return api;
}

// ---- cards, tiles, progress ------------------------------------------------------------------------------

export function card({ title, subtitle, actions = [], children = [], interactive = false, className = "", as = "section" } = {}) {
  const head = title || actions.length
    ? h("header", { class: "ui-card-head" }, h("div", {}, title ? h("h3", { class: "ui-card-title", dir: "auto" }, title) : null, subtitle ? h("div", { class: "ui-meta", dir: "auto" }, subtitle) : null), actions.length ? h("div", { class: "ui-card-actions" }, ...actions) : null)
    : null;
  return h(as, { class: `ui-card${interactive ? " is-interactive" : ""} ${className}`.trim() }, head, ...[children].flat());
}

/** A number with a label. The number counts up from its last value when update() is called. */
export function statTile({ label, value = null, detail = null, tone = null, format = formatNumber, href = null } = {}) {
  const number = h("b", { class: "ui-stat-value" }, value == null ? "—" : format(value));
  const el = h(href ? "a" : "div", { class: `ui-card ui-stat${tone ? ` tone-${tone}` : ""}${href ? " is-interactive" : ""}`, href }, number, h("span", { class: "ui-stat-label" }, label), detail ? h("div", { class: "ui-meta" }, detail) : null);
  let last = Number.isFinite(value) ? value : 0;
  el.update = (next) => {
    if (!Number.isFinite(next)) { number.textContent = "—"; return; }
    const from = last;
    last = next;
    countUp(number, next, { from, format });
  };
  if (Number.isFinite(value)) { number.textContent = format(0); countUp(number, value, { from: 0, format }); }
  return el;
}

/** A progress bar with a text value. Without a value it is indeterminate. `update({ value, max, label })` changes it. */
export function progressBar({ value = null, max = 100, label = "Progress", text = null } = {}) {
  const fill = h("span", { class: "ui-progress-fill" });
  const caption = h("span", { class: "ui-progress-text ui-meta" });
  const bar = h("div", { class: "ui-progress", role: "progressbar", "aria-label": label }, h("span", { class: "ui-progress-track" }, fill));
  const wrap = h("div", { class: "ui-progress-wrap" }, bar, caption);
  const apply = (next) => {
    const determinate = Number.isFinite(next.value);
    bar.classList.toggle("is-indeterminate", !determinate);
    if (determinate) {
      const ratio = Math.min(1, Math.max(0, next.value / (next.max || 100)));
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(next.max || 100));
      bar.setAttribute("aria-valuenow", String(next.value));
      fill.style.transform = `scaleX(${ratio})`;
      caption.textContent = next.text ?? `${Math.round(ratio * 100)}%`;
    } else {
      bar.removeAttribute("aria-valuenow");
      fill.style.transform = "";
      caption.textContent = next.text ?? "Working…";
    }
  };
  wrap.update = (next) => apply({ max, text: null, ...next });
  apply({ value, max, text });
  return wrap;
}

// ---- loading, empty and error ----------------------------------------------------------------------------

/**
 * Placeholder blocks. kind: "lines", "card", "row", "stat". Pass the same counts and heights as the final layout
 * so nothing moves when the data arrives. Shimmer is CSS only and stops under reduced motion.
 */
export function skeleton({ kind = "lines", count = 3, lines = 3 } = {}) {
  const block = (cls = "") => h("span", { class: `ui-skel-block ${cls}`.trim(), "aria-hidden": "true" });
  const one = () => {
    if (kind === "stat") return h("div", { class: "ui-card ui-stat ui-skel-item" }, block("w-40 h-xl"), block("w-60 h-sm"));
    if (kind === "row") return h("div", { class: "ui-skel-row ui-skel-item" }, block("w-30"), block("w-60"), block("w-20"));
    if (kind === "card") return h("div", { class: "ui-card ui-skel-item" }, block("w-60 h-md"), block("w-90"), block("w-75"), h("div", { class: "ui-skel-chips" }, block("w-15 h-chip"), block("w-20 h-chip"), block("w-15 h-chip")));
    return h("div", { class: "ui-skel-item" }, ...Array.from({ length: lines }, (_, index) => block(index === lines - 1 ? "w-60" : "w-90")));
  };
  return h("div", { class: `ui-skel kind-${kind}`, "aria-hidden": "true" }, ...Array.from({ length: count }, one));
}

/** The picture, a title, a sentence about what it means and a way to fix it: buttons, or a command with Copy. */
export function emptyState({ title, text, art = "memory", actions = [], command = null, compact = false } = {}) {
  const cmd = command
    ? h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, command), iconButton({ icon: "copy", label: "Copy command", onClick: () => copyText(command) }))
    : null;
  return h("div", { class: `ui-empty ui-empty-state${compact ? " is-compact" : ""}`, role: "status" },
    compact ? null : emptyArt({ kind: art }),
    h("h3", { class: "ui-empty-title", dir: "auto" }, title),
    text ? h("p", { class: "ui-empty-text", dir: "auto" }, text) : null,
    cmd,
    actions.length ? h("div", { class: "ui-acts ui-empty-actions" }, ...actions) : null);
}

/** A failure the user can act on: what went wrong, Retry, and Copy details for a bug report. */
export function errorState({ title = "Could not load this", message, onRetry, error = null, path = null, compact = false } = {}) {
  const details = errorDetails({ message: message ?? error?.message, path: path ?? error?.path, status: error?.status });
  return h("div", { class: `ui-error-state${compact ? " is-compact" : ""}`, role: "alert" },
    compact ? null : emptyArt({ kind: "error", size: 88 }),
    h("h3", { class: "ui-empty-title" }, title),
    h("p", { class: "ui-empty-text", dir: "auto" }, message ?? error?.message ?? "Something went wrong."),
    h("div", { class: "ui-acts ui-empty-actions" },
      onRetry ? button({ label: "Retry", variant: "primary", icon: "refresh", onClick: onRetry }) : null,
      button({ label: "Copy details", icon: "copy", onClick: () => copyText(details) })));
}

/** A banner across the top of a region, for example "Connection lost". `action` is a button config. */
export function banner({ tone = "warning", text, action = null, id } = {}) {
  const el = h("div", { class: `ui-banner tone-${tone}`, role: "status", id }, icon(tone === "danger" ? "wifi-off" : "alert", { size: 16 }), h("span", { class: "ui-banner-text" }, text), action ? button({ label: action.label, size: "sm", onClick: action.onClick }) : null);
  el.setText = (next) => { el.querySelector(".ui-banner-text").textContent = next; };
  return el;
}

// ---- lists, pager ----------------------------------------------------------------------------------------

/** Children that rise into place one after another (capped at 12 steps, so a long page is not slow). */
export function enterList(container, items) {
  items.forEach((item, index) => {
    item.classList.add("ui-rise");
    item.style.setProperty("--i", String(Math.min(index, 12)));
  });
  container.replaceChildren(...items);
  return container;
}

export const listView = ({ items = [], className = "" } = {}) => enterList(h("div", { class: `ui-list ${className}`.trim(), role: "list" }), items.map((item) => { item.setAttribute("role", "listitem"); return item; }));

/**
 * First, previous, numbered pages, next, last, a rows-per-page select and "Showing 26 to 50 of 312". `onChange`
 * receives { offset, limit }. Left and right arrows move between pages while focus is inside the pager.
 */
export function pager({ total, limit, offset, onChange, sizes = PAGE_SIZES, label = "Pagination" } = {}) {
  const model = pagerModel({ total, limit, offset });
  const go = (page) => onChange?.({ offset: (page - 1) * model.limit, limit: model.limit });
  const numbered = model.pages.map((entry) => (entry === "…"
    ? h("span", { class: "ui-pager-gap", "aria-hidden": "true" }, "…")
    : h("button", { class: `ui-pager-page${entry === model.page ? " on" : ""}`, type: "button", "aria-label": `Page ${entry}`, "aria-current": entry === model.page ? "page" : null, "data-page": entry, onclick: () => entry !== model.page && go(entry) }, formatNumber(entry))));
  const nav = (name, iconName, text, enabled, page) => h("button", { class: `ui-pager-nav ui-pager-${name}`, type: "button", "aria-label": text, title: text, disabled: !enabled, onclick: () => go(page) }, icon(iconName, { size: 16 }));
  const select = h("select", { class: "ui-select ui-pager-size", "aria-label": "Rows per page", onchange: (event) => onChange?.({ offset: 0, limit: Number(event.target.value) }) },
    ...sizes.map((size) => h("option", { value: String(size), selected: size === model.limit }, `${size} per page`)));
  const el = h("nav", { class: "ui-pager", "aria-label": label },
    h("div", { class: "ui-pager-buttons" }, nav("first", "first", "First page", model.hasPrev, 1), nav("prev", "chevron-left", "Previous page", model.hasPrev, model.page - 1), ...numbered, nav("next", "chevron-right", "Next page", model.hasNext, model.page + 1), nav("last", "last", "Last page", model.hasNext, model.pageCount)),
    h("div", { class: "ui-pager-meta" }, h("span", { class: "ui-pager-status", role: "status", "aria-live": "polite" }, model.label), select));
  el.model = model;
  el.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" && model.hasPrev) { event.preventDefault(); go(model.page - 1); }
    if (event.key === "ArrowRight" && model.hasNext) { event.preventDefault(); go(model.page + 1); }
  });
  return el;
}

// ---- text and code ---------------------------------------------------------------------------------------

/** Text with the matched search words wrapped in <mark>. The text is never parsed as markup. */
export function highlight(text, query) {
  return h("span", { class: "ui-hl-text", dir: "auto" }, ...highlightParts(text, query).map((part) => (part.hit ? h("mark", { class: "ui-hl" }, part.text) : part.text)));
}

export const markdownView = (text) => renderMarkdown(text, { onCopy: (value) => copyText(value) });

/** A code block with a language label and a Copy button. Whitespace is kept. */
export function codeBlock({ code, lang = "" } = {}) {
  return h("div", { class: "ui-md-code ui-codeblock" },
    h("div", { class: "ui-md-code-head" }, h("span", { class: "ui-md-lang" }, lang || "text"), button({ label: "Copy", variant: "ghost", size: "sm", icon: "copy", ariaLabel: "Copy code", onClick: () => copyText(code) })),
    h("pre", { tabindex: "0", dir: "ltr" }, h("code", {}, code)));
}

/** An id or a path in a monospace face with a copy button. */
export const mono = (text, { copy = true, label = "Copy" } = {}) =>
  h("span", { class: "ui-mono-wrap" }, h("code", { class: "ui-mono", dir: "ltr" }, text), copy ? iconButton({ icon: "copy", label: `${label} ${text}`, onClick: () => copyText(text) }) : null);

/** "3 min ago", with the exact time on hover and in the datetime attribute. Kept fresh by startClock(). */
export function timeEl(value, { locale } = {}) {
  const ms = typeof value === "number" ? value : Date.parse(value);
  const el = h("time", { class: "ui-time", datetime: Number.isFinite(ms) ? new Date(ms).toISOString() : null, title: formatDateTime(ms, locale), "data-ms": Number.isFinite(ms) ? ms : null }, relativeTime(ms, Date.now(), locale));
  return el;
}

let clock = null;
/** One timer for every <time> on the page. It stops while the page is hidden. */
export function startClock() {
  if (clock) return;
  const tick = () => {
    if (doc().visibilityState === "hidden") return;
    for (const node of doc().querySelectorAll?.("time[data-ms]") ?? []) node.textContent = relativeTime(Number(node.getAttribute("data-ms")));
  };
  clock = setInterval(tick, 30_000);
  doc().addEventListener("visibilitychange", tick);
}

/** Long text cut to `lines` with Show more / Show less. The button appears only when the text is actually cut. */
export function clampText({ text = "", lines = 4, markdown = false, query = "", mono: monoFace = false } = {}) {
  const body = h("div", { class: `ui-clamp-body${monoFace ? " ui-mono-block" : ""}`, dir: "auto", "data-lines": lines }, markdown ? markdownView(text) : query ? highlight(text, query) : text);
  const more = button({ label: "Show more", variant: "ghost", size: "sm", icon: "chevron-down" });
  more.hidden = true;
  more.setAttribute("aria-expanded", "false");
  let expanded = false;
  more.addEventListener("click", async () => {
    expanded = !expanded;
    if (expanded) {
      const from = body.getBoundingClientRect?.().height ?? 0;
      body.classList.add("is-open");
      const to = body.scrollHeight;
      if (from && to > from && !reducedMotion()) animate(body, [{ maxHeight: `${from}px` }, { maxHeight: `${to}px` }], { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    } else {
      const from = body.scrollHeight;
      body.classList.remove("is-open");
      const to = body.getBoundingClientRect?.().height ?? 0;
      if (to && from > to && !reducedMotion()) animate(body, [{ maxHeight: `${from}px` }, { maxHeight: `${to}px` }], { duration: 150, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
    more.setAttribute("aria-expanded", String(expanded));
    more.querySelector(".ui-btn-label").textContent = expanded ? "Show less" : "Show more";
  });
  const el = h("div", { class: "ui-clamp" }, body, more);
  // Show the button only if the text overflows. Measured after layout.
  el.measure = () => { more.hidden = !(expanded || body.scrollHeight > body.clientHeight + 1); };
  if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => el.measure());
  return el;
}

/** A section that opens and closes with an animated height. */
export function disclosure({ summary, content, open = false, onToggle } = {}) {
  const panelId = nextId("ui-disc");
  const body = h("div", { class: "ui-disc-body", id: panelId, hidden: !open }, content);
  const head = h("button", { class: "ui-disc-head", type: "button", "aria-expanded": String(open), "aria-controls": panelId }, icon("chevron-right", { size: 16 }), h("span", {}, summary));
  head.addEventListener("click", async () => {
    const next = head.getAttribute("aria-expanded") !== "true";
    head.setAttribute("aria-expanded", String(next));
    if (next) await expand(body); else await collapse(body);
    onToggle?.(next);
  });
  return h("div", { class: `ui-disc${open ? " is-open" : ""}` }, head, body);
}

/** Events in time order. Each item: { title, text, at, tone, meta }. */
export function timeline(items = []) {
  return h("ol", { class: "ui-timeline" }, ...items.map((item) => h("li", { class: `ui-timeline-item tone-${item.tone ?? "neutral"}` },
    h("div", { class: "ui-timeline-head" }, h("b", { dir: "auto" }, item.title), item.at ? timeEl(item.at) : null, item.meta ? h("span", { class: "ui-meta" }, item.meta) : null),
    item.text ? h("div", { class: "ui-timeline-text", dir: "auto" }, item.text) : null)));
}

/** Filter chips. Single choice by default; `multi` lets several be on. Each option: { value, label, count }. */
export function chipFilters({ options, value = null, multi = false, onChange, label = "Filter" } = {}) {
  const selected = new Set(multi ? [].concat(value ?? []) : value == null ? [] : [value]);
  const nodes = new Map();
  const group = h("div", { class: "ui-chipfilters", role: "group", "aria-label": label });
  const paint = () => nodes.forEach((node, key) => { node.setAttribute("aria-pressed", String(selected.has(key))); node.classList.toggle("on", selected.has(key)); });
  for (const option of options) {
    const node = h("button", { class: "ui-chipfilter", type: "button", "data-value": option.value }, h("span", {}, option.label), option.count != null ? h("span", { class: "ui-chipfilter-count" }, formatNumber(option.count)) : null);
    node.addEventListener("click", () => {
      if (multi) selected.has(option.value) ? selected.delete(option.value) : selected.add(option.value);
      else { selected.clear(); selected.add(option.value); }
      paint();
      onChange?.(multi ? [...selected] : option.value);
    });
    nodes.set(option.value, node);
    group.append(node);
  }
  paint();
  group.set = (next) => { selected.clear(); for (const item of [].concat(next ?? [])) selected.add(item); paint(); };
  return group;
}

/** A labelled form field wrapper. */
export const field = ({ label, control, hint }) => h("label", { class: "ui-field" }, h("span", { class: "ui-field-label" }, label), control, hint ? h("span", { class: "ui-meta" }, hint) : null);
