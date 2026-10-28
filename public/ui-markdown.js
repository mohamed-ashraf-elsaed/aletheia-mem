// A small, safe Markdown renderer. parseMarkdown() turns text into a plain tree; renderMarkdown() builds DOM
// nodes from that tree with createElement and createTextNode only. User text is never parsed as HTML, and a link is
// created only for http, https and mailto addresses. There is no library and no innerHTML.

const MAX_DEPTH = 6;
export const MAX_CHARS = 200_000;
export const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

// Whitespace, control and zero-width code points are removed before the scheme check.
const isHidden = (code) => code <= 0x20 || (code >= 0x7f && code <= 0x9f) || (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029 || code === 0xfeff || (code >= 0x202a && code <= 0x202e);

/** The only address kinds a link may carry. Control characters and spaces are stripped first, so "java\nscript:" fails. */
export function safeUrl(value) {
  const cleaned = Array.from(String(value ?? "")).filter((char) => !isHidden(char.codePointAt(0))).join("");
  if (!/^(https?:\/\/|mailto:)/i.test(cleaned)) return null;
  try {
    const url = new URL(cleaned);
    return SAFE_PROTOCOLS.includes(url.protocol) ? cleaned : null;
  } catch {
    return null;
  }
}

// ---- inline ----------------------------------------------------------------------------------------------

const PUNCT = /[\\`*_{}[\]()#+\-.!|~<>]/;

function closeIndex(text, marker, from) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === "\\") { i += 1; continue; }
    if (text.startsWith(marker, i)) return i;
  }
  return -1;
}

export function parseInline(text, depth = 0) {
  const out = [];
  let buffer = "";
  const flush = () => { if (buffer) { out.push({ t: "text", text: buffer }); buffer = ""; } };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\" && i + 1 < text.length && PUNCT.test(text[i + 1])) { buffer += text[i + 1]; i += 2; continue; }
    if (ch === "\n") { flush(); out.push({ t: "br" }); i += 1; continue; }
    if (ch === "`") {
      let run = 1;
      while (text[i + run] === "`") run += 1;
      const ticks = "`".repeat(run);
      const end = text.indexOf(ticks, i + run);
      if (end > 0) {
        flush();
        out.push({ t: "code", text: text.slice(i + run, end).replace(/^ (.*) $/s, "$1") });
        i = end + run;
        continue;
      }
      buffer += ticks;
      i += run;
      continue;
    }
    if (depth < MAX_DEPTH && ch === "[") {
      const close = closeIndex(text, "]", i + 1);
      if (close > 0 && text[close + 1] === "(") {
        let j = close + 2;
        let level = 1;
        while (j < text.length && level > 0) {
          if (text[j] === "(") level += 1;
          else if (text[j] === ")") level -= 1;
          if (level > 0) j += 1;
        }
        if (level === 0) {
          const target = text.slice(close + 2, j).trim().split(/\s+/)[0] ?? "";
          const label = parseInline(text.slice(i + 1, close), depth + 1);
          flush();
          const href = safeUrl(target);
          if (href) out.push({ t: "link", href, children: label });
          else out.push(...label);
          i = j + 1;
          continue;
        }
      }
    }
    if (depth < MAX_DEPTH && (text.startsWith("**", i) || text.startsWith("__", i) || text.startsWith("~~", i))) {
      const marker = text.slice(i, i + 2);
      const end = closeIndex(text, marker, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: marker === "~~" ? "del" : "strong", children: parseInline(text.slice(i + 2, end), depth + 1) });
        i = end + 2;
        continue;
      }
    }
    if (depth < MAX_DEPTH && (ch === "*" || ch === "_") && text[i + 1] !== " " && text[i + 1] !== ch) {
      const before = text[i - 1] ?? " ";
      const wordInside = ch === "_" && /\w/.test(before);
      const end = wordInside ? -1 : closeIndex(text, ch, i + 1);
      if (end > i + 1 && text[end - 1] !== " " && !(ch === "_" && /\w/.test(text[end + 1] ?? " "))) {
        flush();
        out.push({ t: "em", children: parseInline(text.slice(i + 1, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if ((ch === "h" || ch === "H") && /^https?:\/\//i.test(text.slice(i, i + 8)) && !/\w/.test(text[i - 1] ?? " ")) {
      const match = /^https?:\/\/[^\s<>]+/i.exec(text.slice(i));
      const raw = match[0].replace(/[.,;:!?)\]'"]+$/, "");
      const href = safeUrl(raw);
      if (href) {
        flush();
        out.push({ t: "link", href, children: [{ t: "text", text: raw }] });
        i += raw.length;
        continue;
      }
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

// ---- blocks ----------------------------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])( ?\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const indentOf = (line) => /^\s*/.exec(line)[0].replace(/\t/g, "    ").length;
const isBlockStart = (line) => FENCE.test(line) || HEADING.test(line) || HR.test(line) || /^ {0,3}>/.test(line);

function splitRow(line) {
  const cells = [];
  let cell = "";
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\\" && body[i + 1] === "|") { cell += "|"; i += 1; continue; }
    if (body[i] === "|") { cells.push(cell.trim()); cell = ""; continue; }
    cell += body[i];
  }
  cells.push(cell.trim());
  return cells;
}

export function parseBlocks(source, depth = 0) {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    let m = FENCE.exec(line);
    if (m) {
      const marker = m[1];
      const body = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push({ t: "code", lang: m[2].toLowerCase().slice(0, 24), text: body.join("\n") });
      continue;
    }
    m = HEADING.exec(line);
    if (m) { blocks.push({ t: "heading", level: m[1].length, children: parseInline(m[2]) }); i += 1; continue; }
    if (HR.test(line)) { blocks.push({ t: "hr" }); i += 1; continue; }

    if (/^ {0,3}>/.test(line)) {
      const inner = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) { inner.push(lines[i].replace(/^ {0,3}> ?/, "")); i += 1; }
      blocks.push({ t: "quote", children: depth < MAX_DEPTH ? parseBlocks(inner.join("\n"), depth + 1) : [{ t: "p", children: [{ t: "text", text: inner.join("\n") }] }] });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) => (/^:-+:$/.test(cell) ? "center" : /-:$/.test(cell) ? "right" : /^:-/.test(cell) ? "left" : null));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) { rows.push(splitRow(lines[i])); i += 1; }
      blocks.push({
        t: "table",
        head: head.map((cell) => parseInline(cell)),
        align,
        rows: rows.map((row) => head.map((_, index) => parseInline(row[index] ?? ""))),
      });
      continue;
    }

    m = ITEM.exec(line);
    if (m && !HR.test(line)) {
      const baseIndent = indentOf(line);
      const ordered = /\d/.test(m[2][0]);
      const items = [];
      while (i < lines.length) {
        const item = ITEM.exec(lines[i]);
        if (!item || indentOf(lines[i]) !== baseIndent || /\d/.test(item[2][0]) !== ordered || HR.test(lines[i])) break;
        const body = [item[3]];
        i += 1;
        while (i < lines.length) {
          const next = lines[i];
          if (!next.trim()) {
            const peek = lines.slice(i + 1).find((candidate) => candidate.trim());
            if (peek && indentOf(peek) > baseIndent) { body.push(""); i += 1; continue; }
            break;
          }
          if (indentOf(next) > baseIndent) { body.push(next.replace(new RegExp(`^\\s{0,${baseIndent + 2}}`), "")); i += 1; continue; }
          if (ITEM.test(next) || isBlockStart(next)) break;
          body.push(next.trim());
          i += 1;
        }
        let text = body.join("\n");
        let task = null;
        const t = /^\[([ xX])\]\s+/.exec(text);
        if (t) { task = t[1] !== " "; text = text.slice(t[0].length); }
        items.push({ task, children: depth < MAX_DEPTH ? parseBlocks(text, depth + 1).map((block) => (block.t === "p" ? { ...block, tight: true } : block)) : [{ t: "p", tight: true, children: [{ t: "text", text }] }] });
        // A blank line between items of the same list is allowed.
        if (i < lines.length && !lines[i].trim()) {
          const next = lines.slice(i).find((candidate) => candidate.trim());
          if (next && ITEM.test(next) && indentOf(next) === baseIndent) while (!lines[i].trim()) i += 1;
        }
      }
      blocks.push({ t: "list", ordered, start: ordered ? Number.parseInt(m[2], 10) || 1 : 1, items });
      continue;
    }

    const para = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !(ITEM.test(lines[i]) && !/^\s{4,}/.test(lines[i]))) {
      if (lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) break;
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: "p", children: parseInline(para.join("\n")) });
  }
  return blocks;
}

export const parseMarkdown = (text, { maxChars = MAX_CHARS } = {}) => {
  const source = String(text ?? "");
  return { blocks: parseBlocks(source.length > maxChars ? source.slice(0, maxChars) : source), truncated: source.length > maxChars };
};

// ---- DOM -------------------------------------------------------------------------------------------------

function make(doc, tag, attrs = {}, kids = []) {
  const el = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) if (value != null && value !== false) el.setAttribute(key, value === true ? "" : String(value));
  for (const kid of kids) el.append(typeof kid === "string" ? doc.createTextNode(kid) : kid);
  return el;
}

function inlineNodes(doc, nodes) {
  return nodes.map((node) => {
    switch (node.t) {
      case "text": return doc.createTextNode(node.text);
      case "br": return make(doc, "br");
      case "code": return make(doc, "code", { class: "ui-md-inline-code" }, [node.text]);
      case "strong": return make(doc, "strong", {}, inlineNodes(doc, node.children));
      case "em": return make(doc, "em", {}, inlineNodes(doc, node.children));
      case "del": return make(doc, "del", {}, inlineNodes(doc, node.children));
      case "link": return make(doc, "a", { href: node.href, rel: "noopener noreferrer", target: "_blank" }, inlineNodes(doc, node.children));
      default: return doc.createTextNode("");
    }
  });
}

function copyButton(doc, text, onCopy) {
  const button = make(doc, "button", { type: "button", class: "ui-md-copy", "aria-label": "Copy code" }, ["Copy"]);
  button.addEventListener("click", async () => {
    try {
      await (onCopy ?? ((value) => globalThis.navigator?.clipboard?.writeText(value)))(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    setTimeout(() => { if (globalThis.document) button.textContent = "Copy"; }, 1600);
  });
  return button;
}

function blockNodes(doc, blocks, options) {
  return blocks.map((block) => {
    switch (block.t) {
      case "heading": return make(doc, `h${Math.min(6, block.level + 1)}`, { dir: "auto", class: "ui-md-h" }, inlineNodes(doc, block.children));
      case "p": return block.tight ? make(doc, "span", { dir: "auto", class: "ui-md-tight" }, inlineNodes(doc, block.children)) : make(doc, "p", { dir: "auto" }, inlineNodes(doc, block.children));
      case "hr": return make(doc, "hr");
      case "quote": return make(doc, "blockquote", { dir: "auto" }, blockNodes(doc, block.children, options));
      case "code": {
        const head = make(doc, "div", { class: "ui-md-code-head" }, [make(doc, "span", { class: "ui-md-lang" }, [block.lang || "text"]), copyButton(doc, block.text, options.onCopy)]);
        const pre = make(doc, "pre", { tabindex: "0", dir: "ltr" }, [make(doc, "code", block.lang ? { "data-lang": block.lang } : {}, [block.text])]);
        return make(doc, "div", { class: "ui-md-code" }, [head, pre]);
      }
      case "list": {
        const items = block.items.map((item) => {
          const kids = blockNodes(doc, item.children, options);
          if (item.task !== null) kids.unshift(make(doc, "input", { type: "checkbox", disabled: true, checked: item.task, "aria-label": item.task ? "done" : "not done" }), doc.createTextNode(" "));
          return make(doc, "li", item.task !== null ? { class: "ui-md-task" } : {}, kids);
        });
        return make(doc, block.ordered ? "ol" : "ul", block.ordered && block.start !== 1 ? { start: block.start } : {}, items);
      }
      case "table": {
        const cell = (tag, nodes, index) => make(doc, tag, block.align[index] ? { class: `ui-align-${block.align[index]}`, dir: "auto" } : { dir: "auto" }, inlineNodes(doc, nodes));
        const table = make(doc, "table", { class: "ui-table" }, [
          make(doc, "thead", {}, [make(doc, "tr", {}, block.head.map((nodes, index) => cell("th", nodes, index)))]),
          make(doc, "tbody", {}, block.rows.map((row) => make(doc, "tr", {}, row.map((nodes, index) => cell("td", nodes, index))))),
        ]);
        return make(doc, "div", { class: "ui-md-table" }, [table]);
      }
      default: return doc.createTextNode("");
    }
  });
}

/** Returns a <div class="ui-md">. `doc` defaults to the page's document; tests pass a small fake. */
export function renderMarkdown(text, options = {}) {
  const doc = options.doc ?? globalThis.document;
  const tree = parseMarkdown(text, options);
  const root = make(doc, "div", { class: "ui-md" }, blockNodes(doc, tree.blocks, options));
  if (tree.truncated) root.append(make(doc, "p", { class: "ui-meta" }, ["The text was cut here because it is very long."]));
  return root;
}
