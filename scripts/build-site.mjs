#!/usr/bin/env bun
// Build the static documentation site from the Markdown in docs/, in the order and sections of docs/_nav.json.
// Plain HTML, no framework, no CDN, relative links. Writes site/docs/**/*.html (with a sidebar, breadcrumbs, structured
// data and a plain Markdown copy beside each page), site/sitemap.xml, site/robots.txt, site/llms.txt and site/llms-full.txt.
// The landing page site/index.html is hand-written and is not overwritten.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { isTracked, trackedFiles } from "./tracked.mjs";

const ROOT = process.env.SITE_ROOT ? resolve(process.env.SITE_ROOT) : join(import.meta.dir, "..");
const SITE = join(ROOT, "site");
const DOCS = join(ROOT, "docs");
const SITE_URL = "https://aletheia.mohamedashrafelsaed.com/";
const REPO = "https://github.com/mohamed-ashraf-elsaed/aletheia-mem";
const AUTHOR = { "@type": "Person", name: "Mohamed Ashraf Elsaed", url: "https://mohamedashrafelsaed.com", "@id": "https://mohamedashrafelsaed.com/#person" };

const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

const isSeparator = (line) => /^[\s|:-]+$/.test(line) && line.includes("-");
const parseRow = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());

function rewrite(target, ctx) {
  const raw = String(target).replace(/&amp;/g, "&");
  if (/^(https?:|mailto:|tel:|data:)/i.test(raw)) return target;
  if (raw.startsWith("#")) return raw;
  const [pathPart, anchor] = raw.split("#");
  if (!pathPart) return raw;
  let decoded = pathPart;
  try { decoded = decodeURIComponent(pathPart); } catch { /* keep raw */ }
  const abs = resolve(dirname(ctx.sourceFile), decoded);
  if (!abs.startsWith(ctx.root)) return target;
  const rel = relative(ctx.root, abs).split(sep).join("/");
  if (decoded.endsWith("/")) return `${REPO}/tree/main/${rel}`;
  if (rel.startsWith("docs/") && rel.endsWith(".md")) {
    const siteRel = `docs/${rel.slice("docs/".length).replace(/\.md$/, ".html")}`;
    if (ctx.pages.has(siteRel)) {
      const link = relative(dirname(ctx.siteFile), join(ctx.siteDir, siteRel)).split(sep).join("/");
      return `${link}${anchor ? `#${anchor}` : ""}`;
    }
  }
  return `${REPO}/blob/main/${rel}${anchor ? `#${anchor}` : ""}`;
}

function inline(text, ctx) {
  return String(text)
    .split(/(`[^`]*`)/g)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) return `<code>${esc(part.slice(1, -1))}</code>`;
      let out = esc(part);
      out = out.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_match, url) => `<a href="${url}">${url}</a>`);
      out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, alt, src) => `<img src="${esc(rewrite(src, ctx))}" alt="${alt}" loading="lazy">`);
      out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, label, href) => `<a href="${esc(rewrite(href, ctx))}">${label}</a>`);
      out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
      return out;
    })
    .join("");
}

function renderList(lines, start, ctx) {
  const entries = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) break;
    const match = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (match) {
      entries.push({ indent: match[1].length, ordered: /\d/.test(match[2]), text: match[3] });
    } else if (/^\s{2,}\S/.test(line) && entries.length) {
      entries[entries.length - 1].text += ` ${line.trim()}`;
    } else break;
    index += 1;
  }
  if (!entries.length) return { html: "", end: start };

  const render = (list, indent) => {
    const ordered = list[0]?.ordered;
    let html = ordered ? "<ol>" : "<ul>";
    let index = 0;
    while (index < list.length) {
      const item = list[index];
      if (item.indent < indent) break;
      if (item.indent > indent) {
        html += render(list.slice(index), item.indent);
        break;
      }
      let inner = `<li>${inline(item.text, ctx)}`;
      let next = index + 1;
      while (next < list.length && list[next].indent > indent) next += 1;
      if (next > index + 1) {
        inner += render(list.slice(index + 1, next), list[index + 1].indent);
        index = next;
      } else {
        index += 1;
      }
      html += `${inner}</li>`;
    }
    html += ordered ? "</ol>" : "</ul>";
    return html;
  };

  return { html: render(entries, entries[0].indent), end: index };
}

export function renderMarkdown(markdown, ctx) {
  const lines = String(markdown).split("\n");
  const out = [];
  let paragraph = [];
  let index = 0;
  const flush = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(" "), ctx)}</p>`);
      paragraph = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      flush();
      const language = line.trim().slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++]);
      index += 1;
      out.push(`<pre><code${language ? ` class="language-${esc(language)}"` : ""}>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    if (!line.trim()) {
      flush();
      index += 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const explicit = /\s*\{#([^}]+)\}\s*$/.exec(heading[2]);
      const text = heading[2].replace(/\s*\{#[^}]+\}\s*$/, "");
      const id = explicit ? explicit[1] : slug(text);
      out.push(`<h${level} id="${esc(id)}">${inline(text, ctx)}</h${level}>`);
      index += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      out.push("<hr>");
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && isSeparator(lines[index + 1])) {
      flush();
      const headers = parseRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(parseRow(lines[index++]));
      out.push(
        `<div class="tablewrap"><table><thead><tr>${headers.map((cell) => `<th>${inline(cell, ctx)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      flush();
      const quote = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${renderMarkdown(quote.join("\n"), ctx)}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flush();
      const list = renderList(lines, index, ctx);
      out.push(list.html);
      index = list.end;
      continue;
    }
    if (/^\s*<!--/.test(line)) {
      index += 1;
      continue;
    }
    paragraph.push(line.trim());
    index += 1;
  }
  flush();
  return out.join("\n");
}


function firstHeading(markdown) {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].replace(/\s*\{#[^}]+\}\s*$/, "").trim() : null;
}

function descriptionOf(markdown) {
  const lines = markdown.split("\n");
  let started = false;
  const text = [];
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) {
      if (started) break;
      continue;
    }
    if (!line.trim()) {
      if (started) break;
      continue;
    }
    if (line.startsWith("```") || line.startsWith("|") || line.startsWith(">") || line.startsWith("<!--") || /^\s*([-*+]|\d+\.)\s+/.test(line)) continue;
    started = true;
    text.push(line.trim());
  }
  const plain = text.join(" ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "");
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
}

// A page may carry <!-- description: ... --> and <!-- keywords: a, b --> lines. They are invisible on GitHub.
function metaComment(markdown, name) {
  const match = new RegExp(`^<!--\\s*${name}:\\s*(.+?)\\s*-->\\s*$`, "m").exec(markdown);
  return match ? match[1].trim() : null;
}

const plainText = (text) =>
  String(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Headings of one level outside code fences: [{ text, id }].
function headingsOf(markdown, level) {
  const out = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match || match[1].length !== level) continue;
    const explicit = /\s*\{#([^}]+)\}\s*$/.exec(match[2]);
    const text = match[2].replace(/\s*\{#[^}]+\}\s*$/, "");
    out.push({ text: plainText(text), id: explicit ? explicit[1] : slug(text) });
  }
  return out;
}

// FAQ pages write each question as a ### heading with its answer under it. Returns [{ question, answer }].
export function faqOf(markdown) {
  const out = [];
  let fenced = false;
  let current = null;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      current = heading[1].length === 3 ? { question: plainText(heading[2]), lines: [] } : null;
      if (current) out.push(current);
      continue;
    }
    if (current && line.trim() && !line.startsWith("|") && !line.startsWith("<!--")) current.lines.push(plainText(line.replace(/^\s*([-*+]|\d+\.)\s+/, "")));
  }
  return out.map((item) => ({ question: item.question, answer: item.lines.join(" ").slice(0, 1500) })).filter((item) => item.answer);
}

// Last commit date of every tracked file, read once. One git call is far faster than one per page, notably on Windows.
let commitDates = null;
function loadCommitDates() {
  commitDates = new Map();
  try {
    const output = execFileSync("git", ["log", "--format=%x00%cs", "--name-only", "--", "docs", "site"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let date = "";
    for (const line of output.split("\n")) {
      if (line.startsWith("\0")) date = line.slice(1).trim();
      else if (line.trim() && !commitDates.has(line.trim())) commitDates.set(line.trim(), date);
    }
  } catch { /* not a git checkout: fall back to file times */ }
}

function gitDate(path) {
  if (!commitDates) loadCommitDates();
  const key = path.split(sep).join("/");
  if (commitDates.get(key)) return commitDates.get(key);
  try {
    return statSync(join(ROOT, path)).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const NAV_FILE = "_nav.json";
const SECTION_DIRS = ["start", "concepts", "tools", "guides", "reference", "compare", "project"];
const SITE_NAME = "Aletheia";
const SITE_SUMMARY =
  "Aletheia (npm package aletheia-mem) is a free, local memory and rules hub for AI coding tools such as Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode. One SQLite store is read over MCP, REST or CLI. Apache-2.0, no account, no telemetry. Alpha status.";
const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended"];

function listMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listMarkdown(path));
    else if (name.endsWith(".md") && !name.startsWith("_")) out.push(path);
  }
  return out;
}

// Pages come from docs/_nav.json (sections, in order). A top-level docs/*.md the manifest does not list goes under "More";
// a section-folder page the manifest does not list is an error, so nothing is published by accident or left orphaned.
export function loadPages(tracked) {
  const manifest = JSON.parse(readFileSync(join(DOCS, NAV_FILE), "utf8"));
  const seen = new Set();
  const sections = [];
  const make = (entry, section) => {
    const file = join(DOCS, entry);
    if (!entry.endsWith(".md")) throw new Error(`${NAV_FILE}: ${entry} is not a .md file`);
    if (seen.has(entry)) throw new Error(`${NAV_FILE}: ${entry} is listed twice`);
    if (!existsSync(file) || !isTracked(tracked, ROOT, file)) throw new Error(`${NAV_FILE}: ${entry} is missing or not tracked by git`);
    seen.add(entry);
    const markdown = readFileSync(file, "utf8");
    const rel = entry.replace(/\.md$/, "");
    const keywords = (metaComment(markdown, "keywords") ?? "").split(",").map((word) => word.trim()).filter(Boolean);
    return {
      rel,
      file,
      siteRel: `docs/${rel}.html`,
      mdRel: `docs/${rel}.md`,
      section,
      markdown,
      title: firstHeading(markdown) ?? basename(entry, ".md"),
      description: metaComment(markdown, "description") ?? descriptionOf(markdown),
      keywords,
    };
  };
  for (const section of manifest.sections) sections.push({ title: section.title, pages: section.pages.map((entry) => make(entry, section.title)) });
  const topLevel = readdirSync(DOCS).filter((name) => name.endsWith(".md") && !name.startsWith("_") && !seen.has(name) && isTracked(tracked, ROOT, join(DOCS, name)));
  if (topLevel.length) sections.push({ title: "More", pages: topLevel.sort().map((entry) => make(entry, "More")) });
  for (const dir of SECTION_DIRS) {
    const folder = join(DOCS, dir);
    if (!existsSync(folder)) continue;
    for (const file of listMarkdown(folder)) {
      const entry = relative(DOCS, file).split(sep).join("/");
      if (!seen.has(entry) && isTracked(tracked, ROOT, file)) throw new Error(`${NAV_FILE}: ${entry} exists but is not listed`);
    }
  }
  const order = sections.flatMap((section) => section.pages);
  if (!order.length) throw new Error("no Markdown documents found in docs/");
  return { sections, order, pages: new Map(order.map((page) => [page.siteRel, page])) };
}

function shell({ title, description, canonical, siteFile, body, jsonLd, keywords = [], ogType = "article", sidebar = "" }) {
  const from = dirname(siteFile);
  const asset = (path) => relative(from, join(SITE, path)).split(sep).join("/");
  const image = `${SITE_URL}assets/social.png`;
  const fullTitle = `${title} · Aletheia docs`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${keywords.length ? `<meta name="keywords" content="${esc(keywords.join(", "))}">\n` : ""}<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="google-site-verification" content="rZF-Cs7rUbS1FtbUSXFUQLM0TUQzqfHodsSL-sMImTM">
<meta name="msvalidate.01" content="E411C74C3FFB0D6D84EB24CA7C7E7101">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/plain" href="${SITE_URL}llms.txt" title="llms.txt">
<link rel="icon" type="image/png" sizes="64x64" href="${asset("favicon.png")}">
<link rel="icon" type="image/png" sizes="32x32" href="${asset("favicon-32.png")}">
<link rel="apple-touch-icon" href="${asset("apple-touch-icon.png")}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${image}">
<link rel="stylesheet" href="${asset("style.css")}">
${(Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join("\n")}
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${asset("index.html")}"><img src="${asset("assets/mark.png")}" alt="" width="26" height="26">Aletheia</a>
  <nav aria-label="Main"><a href="${asset("index.html")}">Home</a><a href="${asset("docs/index.html")}">Docs</a><a href="${asset("docs/start/quickstart.html")}">Quickstart</a><a href="${asset("docs/compare/aletheia-vs-claude-mem.html")}">Compare</a><a class="gh" href="${REPO}">GitHub</a></nav>
</div></header>
<main class="wrap doc docs-layout">
${sidebar}<article>
${body}
</article>
<footer>By <a rel="author" href="${AUTHOR.url}">${AUTHOR.name}</a> · Apache-2.0 · <a href="${REPO}/blob/main/NOTICE.md">NOTICE</a> · <a href="${REPO}">GitHub</a> · <a href="https://www.npmjs.com/package/aletheia-mem">npm</a> · <a href="${asset("llms.txt")}">llms.txt</a> · <a href="${asset("sitemap.xml")}">Sitemap</a></footer>
</main>
</body>
</html>
`;
}

function sidebarHtml(site, current, siteFile) {
  const from = dirname(siteFile);
  const link = (page) => relative(from, join(SITE, page.siteRel)).split(sep).join("/");
  const home = relative(from, join(SITE, "docs/index.html")).split(sep).join("/");
  const sections = site.sections
    .map((section) => {
      const open = section.pages.some((page) => page === current) ? " open" : "";
      const items = section.pages.map((page) => `<li><a href="${link(page)}"${page === current ? ' aria-current="page"' : ""}>${esc(page.title.replace(/\s*:.*$/, ""))}</a></li>`).join("");
      return `<details${open}><summary>${esc(section.title)}</summary><ul>${items}</ul></details>`;
    })
    .join("");
  return `<aside class="side" aria-label="Documentation"><a class="side-home" href="${home}">All documentation</a>${sections}</aside>\n`;
}

function breadcrumbs(page, siteFile) {
  const from = dirname(siteFile);
  const href = (path) => relative(from, join(SITE, path)).split(sep).join("/");
  const trail = [
    { name: "Aletheia", url: SITE_URL, href: href("index.html") },
    { name: "Docs", url: `${SITE_URL}docs/`, href: href("docs/index.html") },
    { name: page.section, url: null, href: null },
    { name: page.title, url: `${SITE_URL}${page.siteRel}`, href: null },
  ];
  const html = `<nav class="crumbs" aria-label="Breadcrumb">${trail.map((item) => (item.href ? `<a href="${item.href}">${esc(item.name)}</a>` : `<span>${esc(item.name)}</span>`)).join(" › ")}</nav>`;
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.filter((item) => item.url).map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
  };
  return { html, data };
}

function tocHtml(markdown) {
  const items = headingsOf(markdown, 2).filter((item) => !/^next steps$/i.test(item.text));
  if (items.length < 3) return "";
  return `<nav class="toc" aria-label="On this page"><strong>On this page</strong><ul>${items.map((item) => `<li><a href="#${esc(item.id)}">${esc(item.text)}</a></li>`).join("")}</ul></nav>`;
}

function prevNext(site, page, siteFile) {
  const from = dirname(siteFile);
  const index = site.order.indexOf(page);
  const link = (target, label) => `<a class="${label.toLowerCase()}" href="${relative(from, join(SITE, target.siteRel)).split(sep).join("/")}"><small>${label}</small><span>${esc(target.title)}</span></a>`;
  const before = site.order[index - 1];
  const after = site.order[index + 1];
  if (!before && !after) return "";
  return `<nav class="pager" aria-label="Previous and next">${before ? link(before, "Previous") : "<span></span>"}${after ? link(after, "Next") : "<span></span>"}</nav>`;
}

function buildLlms(site) {
  const url = (page) => `${SITE_URL}${page.mdRel}`;
  const lines = [`# ${SITE_NAME}`, "", `> ${SITE_SUMMARY}`, "", "Aletheia is a small server, a command line tool and an MCP server over one local SQLite file. Hooks in each AI coding tool capture sessions, secrets are redacted before storing, and the next session gets the relevant context back. Rules are written once and synced into each tool's own instruction file. Every page below is plain Markdown. Real-tool verification is stated per tool; answer accuracy is not measured.", ""];
  for (const section of site.sections) {
    lines.push(`## ${section.title}`, "");
    for (const page of section.pages) lines.push(`- [${page.title}](${url(page)}): ${page.description}`);
    lines.push("");
  }
  lines.push("## Optional", "", `- [README](${REPO}/blob/main/README.md): install, status and limits`, `- [Changelog](${SITE_URL}docs/changelog.html): release notes, generated from CHANGELOG.md`, `- [Full text of every page](${SITE_URL}llms-full.txt): all documentation in one file`, "");
  return lines.join("\n");
}

function buildLlmsFull(site, extra = []) {
  const parts = [`# ${SITE_NAME} documentation (full text)`, "", `> ${SITE_SUMMARY}`, ""];
  for (const page of [...site.order, ...extra]) {
    const body = page.markdown.split("\n").filter((line) => !/^<!--.*-->\s*$/.test(line)).join("\n").trim();
    parts.push("---", "", `Source: ${SITE_URL}${page.siteRel}`, "", body, "");
  }
  return parts.join("\n");
}

function docsIndexBody(site) {
  const sections = site.sections
    .map((section) => {
      const items = section.pages
        .map((page) => {
          const search = [page.title, page.description, page.keywords.join(" "), headingsOf(page.markdown, 2).map((item) => item.text).join(" ")].join(" ").toLowerCase();
          return `<li data-search="${esc(search)}"><a href="${page.siteRel.slice("docs/".length)}">${esc(page.title)}</a> — ${esc(page.description)}</li>`;
        })
        .join("");
      return `<section class="docsec"><h2>${esc(section.title)}</h2><ul class="doclist">${items}</ul></section>`;
    })
    .join("\n");
  const script = `<script>(function(){var q=document.getElementById("q");if(!q)return;var items=[].slice.call(document.querySelectorAll("[data-search]"));var secs=[].slice.call(document.querySelectorAll(".docsec"));q.addEventListener("input",function(){var terms=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);items.forEach(function(li){var t=li.getAttribute("data-search");li.hidden=!terms.every(function(w){return t.indexOf(w)>=0})});secs.forEach(function(s){s.hidden=!s.querySelector("[data-search]:not([hidden])")})})})();</script>`;
  return `<h1>Aletheia documentation</h1>
<p>Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools. These ${site.order.length} pages cover installing it, connecting Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode, how memory and rules work, the CLI, MCP and REST reference, and how it compares with claude-mem and other memory tools. The Markdown in <code>docs/</code> is canonical.</p>
<p class="docsearch"><label for="q">Search the docs</label><input id="q" type="search" placeholder="for example: claude code memory, rules sync, mcp tools" autocomplete="off"></p>
<p>AI tools can read <a href="../llms.txt">llms.txt</a> or <a href="../llms-full.txt">llms-full.txt</a>. Every page also has a plain Markdown copy at the same address ending in <code>.md</code>.</p>
${sections}
${script}`;
}

// The changelog page is generated from CHANGELOG.md at the repository root. It is not a docs/ document,
// so it is built here beside the index instead of living in _nav.json.
function buildChangelogPage(site) {
  const source = join(ROOT, "CHANGELOG.md");
  const markdown = readFileSync(source, "utf8");
  const siteFile = join(SITE, "docs/changelog.html");
  const page = { rel: "changelog", section: "Changelog", title: "Changelog", siteRel: "docs/changelog.html" };
  const ctx = { root: ROOT, siteDir: SITE, sourceFile: source, siteFile, pages: site.pages };
  const description = "What each Aletheia (aletheia-mem) release added, changed and fixed, generated from CHANGELOG.md.";
  const canonical = `${SITE_URL}docs/changelog.html`;
  const modified = gitDate("CHANGELOG.md");
  const crumbs = breadcrumbs(page, siteFile);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: page.title,
      description,
      url: canonical,
      mainEntityOfPage: canonical,
      inLanguage: "en",
      dateModified: modified,
      about: { "@type": "SoftwareApplication", name: SITE_NAME, alternateName: "aletheia-mem", url: SITE_URL },
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      author: AUTHOR,
      license: "https://www.apache.org/licenses/LICENSE-2.0",
    },
    crumbs.data,
  ];
  mkdirSync(dirname(siteFile), { recursive: true });
  writeFileSync(
    siteFile,
    shell({ title: page.title, description, canonical, siteFile, body: `${crumbs.html}\n${renderMarkdown(markdown, ctx)}`, jsonLd, keywords: ["aletheia-mem changelog", "aletheia release notes"] }),
  );
  writeFileSync(join(SITE, "docs/changelog.md"), markdown);
  return { markdown, modified };
}

function main() {
  const tracked = trackedFiles(ROOT);
  const site = loadPages(tracked);
  const { pages, order } = site;

  mkdirSync(join(SITE, "docs"), { recursive: true });
  mkdirSync(join(SITE, "assets"), { recursive: true });
  for (const asset of readdirSync(join(DOCS, "assets"))) {
    if (asset.endsWith(".svg")) copyFileSync(join(DOCS, "assets", asset), join(SITE, "assets", asset));
  }

  for (const page of order) {
    const siteFile = join(SITE, page.siteRel);
    const canonical = `${SITE_URL}${page.siteRel}`;
    const ctx = { root: ROOT, siteDir: SITE, sourceFile: page.file, siteFile, pages };
    let body = renderMarkdown(page.markdown, ctx);
    const toc = tocHtml(page.markdown);
    const crumbs = breadcrumbs(page, siteFile);
    const headEnd = body.indexOf("</h1>");
    const paragraphEnd = headEnd >= 0 ? body.indexOf("</p>", headEnd) : -1;
    if (paragraphEnd >= 0) body = `${body.slice(0, paragraphEnd + 4)}\n${toc}${body.slice(paragraphEnd + 4)}`;
    body = `${crumbs.html}\n${body}\n${prevNext(site, page, siteFile)}`;
    const modified = gitDate(relative(ROOT, page.file));
    const jsonLd = [
      {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: page.title,
        description: page.description,
        url: canonical,
        mainEntityOfPage: canonical,
        inLanguage: "en",
        dateModified: modified,
        ...(page.keywords.length ? { keywords: page.keywords.join(", ") } : {}),
        about: { "@type": "SoftwareApplication", name: SITE_NAME, alternateName: "aletheia-mem", url: SITE_URL },
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        author: AUTHOR,
        license: "https://www.apache.org/licenses/LICENSE-2.0",
      },
      crumbs.data,
    ];
    const questions = /^(faq|.*\/faq)$/.test(page.rel) ? faqOf(page.markdown) : [];
    if (questions.length) {
      jsonLd.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) });
    }
    mkdirSync(dirname(siteFile), { recursive: true });
    writeFileSync(siteFile, shell({ title: page.title, description: page.description, canonical, siteFile, body, jsonLd, keywords: page.keywords, sidebar: sidebarHtml(site, page, siteFile) }));
    // A plain Markdown copy beside each page, for people and AI tools that want text without markup.
    writeFileSync(join(SITE, page.mdRel), page.markdown);
  }

  const indexFile = join(SITE, "docs/index.html");
  writeFileSync(
    indexFile,
    shell({
      title: "Documentation",
      description: "Aletheia documentation: install, connect Claude Code, Codex, Cursor and Gemini CLI, memory and rules, CLI, MCP and REST reference, comparisons.",
      canonical: `${SITE_URL}docs/`,
      siteFile: indexFile,
      ogType: "website",
      body: docsIndexBody(site),
      keywords: ["claude code memory", "ai agent memory", "mcp memory server", "aletheia-mem documentation"],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Aletheia documentation",
        url: `${SITE_URL}docs/`,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
        hasPart: order.map((page) => ({ "@type": "TechArticle", headline: page.title, url: `${SITE_URL}${page.siteRel}` })),
      },
    }),
  );

  const changelog = buildChangelogPage(site);

  const urls = [
    { loc: SITE_URL, lastmod: gitDate("site/index.html") },
    { loc: `${SITE_URL}docs/`, lastmod: order.map((page) => gitDate(relative(ROOT, page.file))).sort().at(-1) ?? gitDate("docs") },
    { loc: `${SITE_URL}docs/changelog.html`, lastmod: changelog.modified },
    ...order.map((page) => ({ loc: `${SITE_URL}${page.siteRel}`, lastmod: gitDate(relative(ROOT, page.file)) })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url.loc}</loc><lastmod>${url.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  writeFileSync(join(SITE, "sitemap.xml"), sitemap);
  const robots = [
    "User-agent: *",
    "Allow: /",
    "",
    "# The documentation is public. Search engines and AI assistants may read, quote and cite it.",
    ...AI_CRAWLERS.flatMap((name) => [`User-agent: ${name}`, "Allow: /", ""]),
    `Sitemap: ${SITE_URL}sitemap.xml`,
    "",
  ].join("\n");
  writeFileSync(join(SITE, "robots.txt"), robots);
  writeFileSync(join(SITE, "llms.txt"), buildLlms(site));
  writeFileSync(join(SITE, "llms-full.txt"), buildLlmsFull(site, [{ siteRel: "docs/changelog.html", markdown: changelog.markdown }]));
  console.log(`site built: ${pages.size} document pages + index + changelog; sitemap has ${urls.length} URLs`);
}

if (import.meta.main) main();
