// The brain mark, the loader, the empty-state picture and the favicon (T-204). All built from the logo's idea: a
// brain drawn as a network of nodes. Colours come from CSS variables, so both themes work. The favicon is a static
// data URL with literal colours because a favicon cannot read page variables.
const NS = "http://www.w3.org/2000/svg";

// Node positions on a 120 by 104 grid, and the lines between them (indexes into NODES).
export const NODES = [
  [60, 8], [84, 12], [36, 16], [100, 28], [18, 34], [112, 52], [8, 56], [60, 34], [36, 44], [84, 40],
  [22, 76], [100, 78], [48, 70], [72, 66], [44, 92], [70, 100], [60, 56],
];
export const EDGES = [
  [0, 1], [0, 2], [0, 7], [1, 3], [1, 9], [1, 7], [2, 4], [2, 8], [2, 7], [3, 5], [3, 9], [4, 6], [4, 8], [5, 11], [5, 9],
  [6, 10], [6, 8], [7, 8], [7, 9], [7, 16], [8, 12], [8, 16], [9, 13], [9, 16], [10, 12], [10, 14], [11, 13], [11, 15],
  [12, 13], [12, 14], [13, 15], [14, 15], [12, 16], [13, 16],
];

const el = (doc, tag, attrs = {}) => {
  const node = doc.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

/** The mark. `animated` adds the class the loader CSS hooks into; `label` makes it an image for screen readers. */
export function brainMark({ size = 28, animated = false, label = null, doc = globalThis.document } = {}) {
  const svg = el(doc, "svg", { viewBox: "0 0 120 104", width: size, height: Math.round(size * 104 / 120), class: `ui-brain${animated ? " ui-brain-loading" : ""}` });
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  const edges = el(doc, "g", { class: "ui-brain-edges" });
  for (const [a, b] of EDGES) edges.append(el(doc, "line", { x1: NODES[a][0], y1: NODES[a][1], x2: NODES[b][0], y2: NODES[b][1] }));
  const nodes = el(doc, "g", { class: "ui-brain-nodes" });
  NODES.forEach(([x, y], index) => nodes.append(el(doc, "circle", { cx: x, cy: y, r: index === 7 || index === 16 ? 4.4 : 3.6, class: x > 60 ? "n-b" : "n-a" })));
  svg.append(edges, nodes);
  return svg;
}

/** The loading mark: the nodes pulse in sequence. `text` is announced by screen readers. */
export function brainLoader({ size = 48, text = "Loading", doc = globalThis.document } = {}) {
  const wrap = doc.createElement("div");
  wrap.className = "ui-loader";
  wrap.setAttribute("role", "status");
  wrap.append(brainMark({ size, animated: true, doc }));
  const label = doc.createElement("span");
  label.className = "ui-sr";
  label.textContent = text;
  wrap.append(label);
  return wrap;
}

const OVERLAYS = {
  memory: "M60 52v-12M54 46h12",
  search: "M56 38a8 8 0 1 0 0 .01zM62 44l8 8",
  review: "M52 46l6 6 10-12",
  error: "M60 36v14M60 58v.5",
  offline: "M50 36l20 20M70 36L50 56",
  rules: "M48 38h24M48 46h24M48 54h14",
};

/** The empty-state picture: a faded brain with a small symbol that says what is missing. */
export function emptyArt({ kind = "memory", size = 120, doc = globalThis.document } = {}) {
  const svg = el(doc, "svg", { viewBox: "0 0 120 104", width: size, height: Math.round(size * 104 / 120), class: "ui-empty-art", "aria-hidden": "true" });
  const mark = brainMark({ size, doc });
  mark.setAttribute("class", "ui-brain ui-brain-faded");
  svg.append(...[...mark.children]);
  svg.append(el(doc, "circle", { cx: 60, cy: 48, r: 17, class: "ui-art-disc" }));
  svg.append(el(doc, "path", { d: OVERLAYS[kind] ?? OVERLAYS.memory, class: "ui-art-glyph", fill: "none", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }));
  return svg;
}

const FAVICON_COLORS = { idle: "#26bbea", working: "#33f0d8", error: "#ff6b7f" };

/** A data URL for the tab icon in one of three states. */
export function faviconHref(state = "idle") {
  const color = FAVICON_COLORS[state] ?? FAVICON_COLORS.idle;
  const lines = EDGES.map(([a, b]) => `<line x1="${NODES[a][0]}" y1="${NODES[a][1]}" x2="${NODES[b][0]}" y2="${NODES[b][1]}"/>`).join("");
  const dots = NODES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5"/>`).join("");
  const badge = state === "working" ? `<circle cx="104" cy="92" r="14" fill="#33f0d8" stroke="#0a1017" stroke-width="4"/>` : state === "error" ? `<circle cx="104" cy="92" r="14" fill="#ff6b7f" stroke="#0a1017" stroke-width="4"/>` : "";
  const svg = `<svg xmlns="${NS}" viewBox="-4 -4 128 112"><rect x="-4" y="-4" width="128" height="112" rx="22" fill="#0a1017"/><g stroke="${color}" stroke-width="2.4" opacity=".7">${lines}</g><g fill="${color}">${dots}</g>${badge}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
