// A tiny DOM for tests that must run without a browser or a dependency. It records what a component builds so a test
// can assert on tags, attributes and text. Text is kept as data and escaped only when serialised.
export class FakeText {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); }
}
export class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.tag = tag.toLowerCase();
    this.attrs = {};
    this.children = [];
    this.listeners = {};
    this.className = "";
    this.hidden = false;
    this.dataset = {};
    this.classList = {
      add: (...names) => { this.className = [...new Set(`${this.className} ${names.join(" ")}`.trim().split(/\s+/))].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(" "); },
      toggle: (name, force) => { const on = force ?? !this.classList.contains(name); this.classList[on ? "add" : "remove"](name); return on; },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  setAttribute(key, value) { this.attrs[key] = String(value); if (key === "class") this.className = String(value); }
  getAttribute(key) { return this.attrs[key] ?? null; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...kids) { for (const kid of kids) this.children.push(typeof kid === "string" ? new FakeText(kid) : kid); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn({ type, target: this, preventDefault() {}, stopPropagation() {}, ...event }); }
  get textContent() { return this.children.map((kid) => kid.textContent).join(""); }
  set textContent(value) { this.children = [new FakeText(value)]; }
  querySelectorAll(selector) {
    const out = [];
    const match = (el) => (selector.startsWith(".") ? el.classList.contains(selector.slice(1)) : el.tag === selector);
    const walk = (el) => { for (const kid of el.children) if (kid.nodeType === 1) { if (match(kid)) out.push(kid); walk(kid); } };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  all() {
    const out = [];
    const walk = (el) => { for (const kid of el.children) if (kid.nodeType === 1) { out.push(kid); walk(kid); } };
    walk(this);
    return out;
  }
}
export const fakeDoc = {
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (text) => new FakeText(text),
  createElementNS: (_ns, tag) => new FakeElement(tag),
};
const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function serialize(node) {
  if (node.nodeType === 3) return esc(node.textContent);
  const attrs = Object.entries(node.attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}
