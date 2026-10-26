// Inline SVG icons (T-152). Each icon is a path on a 24 by 24 grid, drawn with the current text colour. They are
// built with createElementNS, so no markup string is ever parsed. Drawn for this project; no icon set is copied.
const NS = "http://www.w3.org/2000/svg";

export const ICON_PATHS = {
  search: "M11 5a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM16 16l5 5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  copy: "M9 9h10v10H9zM5 15V5h10",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
  "chevron-left": "M15 5l-7 7 7 7",
  "chevron-right": "M9 5l7 7-7 7",
  "chevron-down": "M5 9l7 7 7-7",
  "chevron-up": "M5 15l7-7 7 7",
  first: "M18 5l-7 7 7 7M6 5v14",
  last: "M6 5l7 7-7 7M18 5v14",
  undo: "M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 8h-3",
  pin: "M12 17v5M8 3h8l-1 6 3 4H6l3-4z",
  "eye-off": "M3 3l18 18M10.6 5.2A9 9 0 0 1 12 5c5 0 8.5 4.5 9.5 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.7C4.5 8.1 3 10.4 2.5 12c1 2.5 4.5 7 9.5 7 1.5 0 2.8-.4 4-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  auto: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3v18",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 11v6M12 7.5v.5",
  alert: "M12 3l10 18H2zM12 10v5M12 18v.5",
  plus: "M12 5v14M5 12h14",
  command: "M9 9h6v6H9zM9 9V6.5A2.5 2.5 0 1 0 6.5 9H9zM15 9h2.5A2.5 2.5 0 1 0 15 6.5V9zM9 15v2.5A2.5 2.5 0 1 1 6.5 15H9zM15 15h2.5a2.5 2.5 0 1 1-2.5 2.5V15z",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  "wifi-off": "M3 3l18 18M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-3.5-2.1M8.5 16a5 5 0 0 1 2.2-1.2M15.5 16a5 5 0 0 0-1.5-1M12 19.5v.01",
  database: "M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  download: "M12 4v11M7 11l5 5 5-5M5 20h14",
  upload: "M12 16V5M7 9l5-5 5 5M5 20h14",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7v5l3 2",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  terminal: "M4 5h16v14H4zM7 10l3 2-3 2M12 15h5",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  device: "M7 3h10v18H7zM11 18h2",
  folder: "M3 6h6l2 2h10v11H3z",
  home: "M4 11l8-7 8 7M6 10v10h12V10",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  rules: "M5 5h14M5 10h14M5 15h9M5 20h6",
  tool: "M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z",
};

/** An <svg> element for a named icon. Unknown names draw a plain square so a typo is visible, not silent. */
export function icon(name, { size = 18, label = null, doc = globalThis.document } = {}) {
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", `ui-icon ui-icon-${name}`);
  if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); } else svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(NS, "path");
  path.setAttribute("d", ICON_PATHS[name] ?? "M5 5h14v14H5z");
  svg.append(path);
  return svg;
}
