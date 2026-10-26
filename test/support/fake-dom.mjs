// A small DOM for tests that must run without a browser or a dependency. It records what a component builds so a test
// can assert on tags, attributes, text, focus and events. Text is kept as data and escaped only when serialised.
export class FakeText {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); this.parentNode = null; }
}

function matchesSimple(el, simple) {
  if (simple === "*") return true;
  const m = /^([a-z0-9-]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(simple);
  if (!m) return false;
  if (m[1] && el.tag !== m[1].toLowerCase()) return false;
  for (const cls of m[2].split(".").filter(Boolean)) if (!el.classList.contains(cls)) return false;
  for (const attr of m[3].match(/\[[^\]]+\]/g) ?? []) {
    const [, name, value] = /^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/.exec(attr);
    const actual = el.getAttribute(name);
    if (actual == null || (value !== undefined && actual !== value)) return false;
  }
  return true;
}

export class FakeElement {
  constructor(tag, owner) {
    this.nodeType = 1;
    this.owner = owner;
    this.tagName = tag.toUpperCase();
    this.tag = tag.toLowerCase();
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.value = "";
    this.style = { props: {}, setProperty(key, value) { this.props[key] = value; }, removeProperty(key) { delete this.props[key]; } };
    this.scrollHeight = 40;
    this.clientHeight = 40;
    this.offsetWidth = 100;
    this.offsetHeight = 30;
    this.classList = {
      add: (...names) => { this.className = [...new Set(`${this.className} ${names.join(" ")}`.trim().split(/\s+/).filter(Boolean))].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(" "); },
      toggle: (name, force) => { const on = force ?? !this.classList.contains(name); this.classList[on ? "add" : "remove"](name); return on; },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === this.owner?.documentElement; }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === "class") this.className = String(value);
    if (key === "disabled") this.disabled = true;
    if (key === "hidden") this.hidden = true;
  }
  getAttribute(key) {
    if (key === "class") return this.className || null;
    return this.attrs[key] ?? null;
  }
  removeAttribute(key) { delete this.attrs[key]; if (key === "disabled") this.disabled = false; if (key === "hidden") this.hidden = false; }
  append(...kids) {
    for (const raw of kids) {
      const kid = typeof raw === "string" ? new FakeText(raw) : raw;
      kid.parentNode?.removeChild?.(kid);
      kid.parentNode = this;
      this.children.push(kid);
    }
  }
  removeChild(kid) { this.children = this.children.filter((child) => child !== kid); kid.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
  replaceChildren(...kids) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...kids); }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== fn); }
  /** Fire an event on this element, then let it bubble to the document. */
  dispatch(type, event = {}) {
    const full = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...event };
    for (let node = this; node && !full.stopped; node = node.parentNode) for (const fn of node.listeners?.[type] ?? []) fn(full);
    if (!full.stopped) this.owner?.dispatchOnDocument(type, full);
    return full;
  }
  focus() { this.owner.activeElement = this; this.dispatch("focus"); }
  click() { return this.dispatch("click"); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30, right: 100, bottom: 30 }; }
  get textContent() { return this.children.map((kid) => kid.textContent).join(""); }
  set textContent(value) { this.replaceChildren(new FakeText(value)); }
  querySelectorAll(selector) {
    const parts = selector.split(",").map((part) => part.trim()).filter(Boolean);
    const out = [];
    const walk = (el) => { for (const kid of el.children) if (kid.nodeType === 1) { if (parts.some((part) => matchesSimple(kid, part))) out.push(kid); walk(kid); } };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  all() { return this.querySelectorAll("*"); }
}

export class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement("html", this);
    this.body = new FakeElement("body", this);
    this.documentElement.append(this.body);
    this.activeElement = this.body;
    this.listeners = {};
    this.visibilityState = "visible";
  }
  createElement(tag) { return new FakeElement(tag, this); }
  createElementNS(_ns, tag) { return new FakeElement(tag, this); }
  createTextNode(text) { return new FakeText(text); }
  getElementById(id) { return this.documentElement.all().find((el) => el.getAttribute("id") === id) ?? null; }
  querySelectorAll(selector) { return this.documentElement.querySelectorAll(selector); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== fn); }
  dispatchOnDocument(type, event) { for (const fn of [...(this.listeners[type] ?? [])]) fn(event); }
  /** Fire a key press at whatever has focus. */
  press(key, extra = {}) { return (this.activeElement ?? this.body).dispatch("keydown", { key, shiftKey: false, ...extra }); }
}

const KEYS = ["document", "navigator", "fetch", "location", "history", "addEventListener", "removeEventListener", "requestAnimationFrame", "matchMedia"];
let saved = null;

/** Install a fresh fake document as the global one and return it. Call restoreGlobals() when the file is done. */
export function installFakeDom() {
  if (!saved) saved = Object.fromEntries(KEYS.map((key) => [key, { had: key in globalThis, value: globalThis[key] }]));
  const fake = new FakeDocument();
  globalThis.document = fake;
  globalThis.navigator = { clipboard: { written: [], async writeText(text) { this.written.push(text); } } };
  return fake;
}

/** Put the real globals back, so a test file never changes what later files see (they share one process). */
export function restoreGlobals() {
  if (!saved) return;
  for (const key of KEYS) {
    if (saved[key].had) globalThis[key] = saved[key].value; else delete globalThis[key];
  }
  saved = null;
}

export const fakeDoc = new FakeDocument();
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function serialize(node) {
  if (node.nodeType === 3) return esc(node.textContent);
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}
