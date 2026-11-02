#!/usr/bin/env bun
// Build the static documentation site from the Markdown in docs/, in the order and sections of docs/_nav.json.
// Plain HTML, no framework, no CDN, relative links. Writes site/docs/**/*.html (with a sidebar, breadcrumbs, structured
// data and a plain Markdown copy beside each page), the release notes from CHANGELOG.md (site/docs/changelog.html, one
// page per version under site/docs/releases/ and an Atom feed), site/docs/search.json, site/sitemap.xml,
// site/robots.txt, site/llms.txt and site/llms-full.txt. The landing page site/index.html is hand-written; the build
// fills only its marked latest-release line and the version fields of its JSON-LD.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
      const id = `${ctx.idPrefix ?? ""}${explicit ? explicit[1] : slug(text)}`;
      const anchor = level >= 2 && level <= 4 ? `<a class="anchor" href="#${esc(id)}" aria-hidden="true" tabindex="-1"></a>` : "";
      out.push(`<h${level} id="${esc(id)}">${inline(text, ctx)}${anchor}</h${level}>`);
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
      const inner = renderMarkdown(quote.join("\n"), ctx);
      const kind = /^<p><strong>(note|tip|warning|important|caution)\b/i.exec(inner)?.[1].toLowerCase();
      out.push(kind ? `<blockquote class="callout callout-${kind}">${inner}</blockquote>` : `<blockquote>${inner}</blockquote>`);
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

// Short sidebar and card labels. A page not listed here uses its title up to the first colon.
const NAV_LABELS = {
  "start/introduction": "Introduction",
  "start/installation": "Installation",
  "start/quickstart": "Quickstart",
  "start/how-it-works": "How it works",
  "start/dashboard": "Dashboard",
  "start/faq": "FAQ",
  "concepts/memory-model": "Memory model",
  "concepts/session-context": "Session-start context",
  "concepts/privacy": "Privacy and redaction",
  "33-facts": "Facts",
  "concepts/glossary": "Glossary",
  "tools/overview": "Overview",
  "tools/claude-code": "Claude Code",
  "tools/command-code": "Command Code",
  "tools/codex": "Codex CLI",
  "tools/cursor": "Cursor",
  "tools/gemini-cli": "Gemini CLI",
  "tools/windsurf": "Windsurf",
  "tools/opencode": "OpenCode",
  "claude-desktop": "Claude Desktop",
  "tools/other-tools": "Copilot, Aider and others",
  "25-installers": "Installers and capture",
  "guides/migrate-from-claude-mem": "Migrate from claude-mem",
  "guides/write-rules-once": "Write rules once",
  "guides/backup-export-import": "Backup, export and import",
  "guides/run-as-a-service": "Run as a service",
  "guides/troubleshooting": "Troubleshooting",
  "29-sync": "Sync",
  "30-remote-mcp": "Remote MCP",
  "32-requests": "Requests and goals",
  "reference/cli": "CLI",
  "reference/mcp-tools": "MCP tools",
  "reference/configuration": "Configuration",
  "reference/hooks": "Hooks",
  "compare/aletheia-vs-claude-mem": "Aletheia vs claude-mem",
  "compare/memory-tools": "Memory tools compared",
  "compare/claude-code-memory": "Claude Code memory options",
  "project/benchmarks": "Benchmarks",
  "project/status-and-limits": "Status and limits",
};
const navLabel = (rel, title) => NAV_LABELS[rel] ?? title.replace(/\s*:.*$/, "").replace(/^\d+\.\s+/, "");

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
      label: navLabel(rel, firstHeading(markdown) ?? basename(entry, ".md")),
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

const NPM = "https://www.npmjs.com/package/aletheia-mem";
const FEED_REL = "docs/releases/feed.xml";
const SOCIAL = { url: `${SITE_URL}assets/social.png`, width: 1280, height: 640, alt: "Aletheia: one memory for every AI coding tool" };
const COLLAPSED = new Set(["Internals", "More"]);
const SIDEBAR_RELEASES = 8;

// The page script: the mobile menu, a copy button on code blocks and the header search over docs/search.json.
// Inline, so the site loads no script file; String.raw keeps the regular expression escapes.
const SCRIPT = String.raw`(function(){var b=document.body,root=b.getAttribute("data-root")||"";
var m=document.querySelector(".menu"),sd=document.getElementById("side");function nav(o){b.classList.toggle("nav-open",o);if(m)m.setAttribute("aria-expanded",String(o))}
if(m)m.addEventListener("click",function(e){e.stopPropagation();nav(!b.classList.contains("nav-open"))});
document.addEventListener("click",function(e){if(b.classList.contains("nav-open")&&sd&&!sd.contains(e.target))nav(false)});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&b.classList.contains("nav-open"))nav(false)});
[].forEach.call(document.querySelectorAll(".doc pre"),function(p){if(!navigator.clipboard)return;var c=document.createElement("button");c.type="button";c.className="copy";c.textContent="Copy";c.addEventListener("click",function(){var t=p.querySelector("code")||p;navigator.clipboard.writeText(t.innerText).then(function(){c.textContent="Copied";setTimeout(function(){c.textContent="Copy"},1500)})});p.appendChild(c)});
var i=document.getElementById("ds"),r=document.getElementById("dsr");if(!i||!r)return;var idx=null,hits=[],sel=0;
function load(){return idx?Promise.resolve(idx):fetch(root+"docs/search.json").then(function(x){return x.json()}).then(function(d){idx=d;return d})}
function paint(){[].forEach.call(r.querySelectorAll("a"),function(a,n){a.className=n===sel?"on":""})}
function show(){var q=i.value.trim().toLowerCase();if(!q){r.hidden=true;hits=[];return}load().then(function(d){var w=q.split(/\s+/);hits=d.map(function(e){var t=e.t.toLowerCase(),h=e.h.toLowerCase(),o=(e.d+" "+e.k+" "+e.s).toLowerCase(),s=0;for(var k=0;k<w.length;k++){if(t.indexOf(w[k])>=0)s+=5;else if(h.indexOf(w[k])>=0)s+=2;else if(o.indexOf(w[k])>=0)s+=1;else return null}return{e:e,s:s}}).filter(Boolean).sort(function(a,c){return c.s-a.s}).slice(0,8);sel=0;r.textContent="";hits.forEach(function(x){var a=document.createElement("a"),s=document.createElement("small");a.href=root+x.e.u;a.textContent=x.e.t;s.textContent=x.e.s;a.appendChild(s);r.appendChild(a)});if(!hits.length){var p=document.createElement("p");p.className="none";p.textContent="No page matches.";r.appendChild(p)}paint();r.hidden=false})}
i.addEventListener("input",show);i.addEventListener("focus",function(){load();if(i.value)show()});
i.addEventListener("keydown",function(e){if(e.key==="Escape"){r.hidden=true;i.blur()}else if(e.key==="Enter"&&hits[sel]){e.preventDefault();location.href=root+hits[sel].e.u}else if((e.key==="ArrowDown"||e.key==="ArrowUp")&&hits.length){e.preventDefault();sel=(sel+(e.key==="ArrowDown"?1:hits.length-1))%hits.length;paint()}});
document.addEventListener("keydown",function(e){var a=document.activeElement;if(e.key==="/"&&a&&!/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){e.preventDefault();i.focus()}});
document.addEventListener("click",function(e){if(e.target!==i&&!r.contains(e.target))r.hidden=true})})();`;

// A relative link from one generated file to a site path. A path that ends in "/" (or is empty) is a folder.
function linkTo(siteFile, rel) {
  const out = relative(dirname(siteFile), join(SITE, rel)).split(sep).join("/");
  return rel === "" || rel.endsWith("/") ? `${out || "."}/` : out;
}

// ---- Release notes, parsed from CHANGELOG.md (Keep a Changelog: "## [1.2.3] - YYYY-MM-DD", optional " [YANKED]").

const RELEASE_HEAD = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})(\s+\[YANKED\])?\s*$/;

function countChanges(markdown) {
  const counts = {};
  let current = null;
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) current = heading[1];
    else if (current && /^[-*]\s+/.test(line)) counts[current] = (counts[current] ?? 0) + 1;
  }
  return counts;
}

export function parseChangelog(markdown) {
  const text = String(markdown).replace(/^\[[^\]]+\]:\s*\S+\s*$/gm, "");
  const blocks = text.split(/^(?=## )/m).filter((block) => block.startsWith("## "));
  const releases = [];
  const notes = [];
  let unreleased = "";
  for (const block of blocks) {
    const [head, ...rest] = block.split("\n");
    const body = rest.join("\n").trim();
    const match = RELEASE_HEAD.exec(head);
    if (/^## \[Unreleased\]/i.test(head)) unreleased = body;
    else if (match) releases.push({ version: match[1], date: match[2], yanked: Boolean(match[3]), markdown: body, counts: countChanges(body) });
    else notes.push({ title: head.replace(/^##\s+/, "").replace(/[[\]]/g, "").trim(), markdown: body });
  }
  releases.forEach((release, index) => {
    release.newer = releases[index - 1] ?? null;
    release.older = releases[index + 1] ?? null;
  });
  return { unreleased, releases, notes };
}

const releaseRel = (release) => `docs/releases/v${release.version}.html`;
const releaseMdRel = (release) => `docs/releases/v${release.version}.md`;
const releaseTitle = (release) => `Aletheia ${release.version} release notes`;
const countsText = (counts) => Object.entries(counts).map(([kind, count]) => `${count} ${kind.toLowerCase()}`).join(", ");

function firstPoint(markdown) {
  const line = markdown.split("\n").find((item) => /^[-*]\s+/.test(item)) ?? markdown.split("\n").find((item) => item.trim() && !item.startsWith("#"));
  return line ? plainText(line.replace(/^[-*]\s+/, "")) : "";
}

function releaseDescription(release) {
  const lead = `Aletheia (aletheia-mem) ${release.version}, released ${release.date}${release.yanked ? " and later yanked" : ""}: ${countsText(release.counts) || "release notes"}.`;
  const point = firstPoint(release.markdown);
  const text = point ? `${lead} ${point}` : lead;
  return text.length > 175 ? `${text.slice(0, 172).replace(/\s+\S*$/, "")}...` : text;
}

// The newest older release that was not yanked: the base for a compare link.
function publishedBefore(release) {
  let older = release.older;
  while (older && older.yanked) older = older.older;
  return older;
}

function releaseLinks(release) {
  if (release.yanked) return [];
  const links = [
    { label: `npm ${release.version}`, url: `${NPM}/v/${release.version}` },
    { label: "GitHub release", url: `${REPO}/releases/tag/v${release.version}` },
  ];
  const base = publishedBefore(release);
  if (base) links.push({ label: `Changes since ${base.version}`, url: `${REPO}/compare/v${base.version}...v${release.version}` });
  return links;
}

function releaseBadges(release, latest) {
  return `${release === latest ? '<span class="badge">Latest</span>' : ""}${release.yanked ? '<span class="badge badge-warn">Yanked</span>' : ""}`;
}

const YANKED_NOTE = "<strong>Yanked.</strong> This version was withdrawn from npm and cannot be installed from it. Install a later version.";

function releasePageBody(site, release, siteFile) {
  const ctx = { root: ROOT, siteDir: SITE, sourceFile: join(ROOT, "CHANGELOG.md"), siteFile, pages: site.pages };
  const links = releaseLinks(release).map((link) => `<a href="${link.url}">${esc(link.label)}</a>`).join(" · ");
  const install = release.yanked
    ? `<blockquote class="callout callout-warning"><p>${YANKED_NOTE}</p></blockquote>`
    : `<pre><code class="language-bash">npm install -g aletheia-mem@${release.version}</code></pre>`;
  const pager = (target, label) => `<a class="${label === "Older" ? "prev" : "next"}" href="${linkTo(siteFile, releaseRel(target))}"><small>${label}</small><span>${esc(releaseTitle(target))}</span></a>`;
  const nav = release.older || release.newer ? `<nav class="pager" aria-label="Older and newer releases">${release.older ? pager(release.older, "Older") : "<span></span>"}${release.newer ? pager(release.newer, "Newer") : "<span></span>"}</nav>` : "";
  return [
    `<h1 id="release-${release.version.replace(/\./g, "-")}">${esc(releaseTitle(release))}</h1>`,
    `<p class="relmeta"><span>Released <time datetime="${release.date}">${release.date}</time></span>${releaseBadges(release, site.latest)}${countsText(release.counts) ? `<span>${esc(countsText(release.counts))}</span>` : ""}</p>`,
    links ? `<p class="rellinks">${links}</p>` : "",
    install,
    renderMarkdown(release.markdown, ctx),
    `<p class="rellinks"><a href="${linkTo(siteFile, "docs/changelog.html")}#v${release.version}">All release notes</a> · <a href="${linkTo(siteFile, FEED_REL)}">Atom feed</a></p>`,
    nav,
  ].filter(Boolean).join("\n");
}

function releaseMarkdown(release) {
  const links = releaseLinks(release).map((link) => `[${link.label}](${link.url})`).join(" · ");
  const head = [`# ${releaseTitle(release)}`, "", `Released ${release.date}.${release.yanked ? " Yanked: this version was withdrawn from npm." : ""}`, ""];
  if (links) head.push(links, "");
  if (!release.yanked) head.push("```bash", `npm install -g aletheia-mem@${release.version}`, "```", "");
  return `${head.join("\n")}${release.markdown}\n`;
}

function changelogBody(site, siteFile) {
  const { releases, unreleased, notes } = site.log;
  const latest = site.latest;
  const ctx = (idPrefix) => ({ root: ROOT, siteDir: SITE, sourceFile: join(ROOT, "CHANGELOG.md"), siteFile, pages: site.pages, idPrefix });
  const block = (id, meta, markdown, prefix, footer = "") =>
    `<section class="release" id="${esc(id)}"><div class="release-meta">${meta}</div><div class="release-body">${renderMarkdown(markdown, ctx(prefix))}${footer}</div></section>`;
  const parts = [
    `<h1 id="release-notes">Release notes</h1>`,
    `<p>What each release of Aletheia (npm package aletheia-mem) added, changed and fixed, newest first. Every version has its own page, and the text comes from <a href="${REPO}/blob/main/CHANGELOG.md">CHANGELOG.md</a> in the repository. Follow new releases with the <a href="${linkTo(siteFile, FEED_REL)}">Atom feed</a> or on <a href="${REPO}/releases">GitHub</a>.</p>`,
  ];
  if (latest) {
    parts.push(
      `<blockquote class="callout callout-note"><p><strong>Latest release:</strong> <a href="${linkTo(siteFile, releaseRel(latest))}">Aletheia ${latest.version}</a>, ${latest.date}. Install or update with <code>npm install -g aletheia-mem</code>.</p></blockquote>`,
    );
  }
  if (unreleased) parts.push(block("unreleased", `<h2 class="vtag">Unreleased</h2><small>On main, not in a release yet</small>`, unreleased, "unreleased-"));
  for (const release of releases) {
    const meta = `<h2 class="vtag"><a href="${linkTo(siteFile, releaseRel(release))}">${release.version}</a></h2><time datetime="${release.date}">${release.date}</time>${releaseBadges(release, latest)}`;
    const links = [`<a href="${linkTo(siteFile, releaseRel(release))}">Release page</a>`, ...releaseLinks(release).map((link) => `<a href="${link.url}">${esc(link.label)}</a>`)];
    const yanked = release.yanked ? `<blockquote class="callout callout-warning"><p>${YANKED_NOTE}</p></blockquote>` : "";
    parts.push(block(`v${release.version}`, meta, release.markdown, `v${release.version.replace(/\./g, "-")}-`, `${yanked}<p class="rellinks">${links.join(" · ")}</p>`));
  }
  for (const note of notes) parts.push(block(slug(note.title), `<h2 class="vtag">${esc(note.title)}</h2>`, note.markdown, `${slug(note.title)}-`));
  return parts.join("\n");
}

function buildFeed(site) {
  const entries = site.log.releases.map((release) => {
    const url = `${SITE_URL}${releaseRel(release)}`;
    const ctx = { root: ROOT, siteDir: SITE, sourceFile: join(ROOT, "CHANGELOG.md"), siteFile: join(SITE, releaseRel(release)), pages: site.pages };
    return [
      `  <entry xml:base="${url}">`,
      `    <title>${esc(`Aletheia ${release.version}${release.yanked ? " (yanked)" : ""}`)}</title>`,
      `    <link rel="alternate" type="text/html" href="${url}"/>`,
      `    <id>${url}</id>`,
      `    <published>${release.date}T00:00:00Z</published>`,
      `    <updated>${release.date}T00:00:00Z</updated>`,
      `    <summary>${esc(releaseDescription(release))}</summary>`,
      `    <content type="html">${esc(renderMarkdown(release.markdown, ctx))}</content>`,
      "  </entry>",
    ].join("\n");
  });
  const updated = site.latest ? `${site.latest.date}T00:00:00Z` : new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Aletheia release notes</title>
  <subtitle>New releases of Aletheia (aletheia-mem), the local memory and rules hub for AI coding tools.</subtitle>
  <link rel="self" type="application/atom+xml" href="${SITE_URL}${FEED_REL}"/>
  <link rel="alternate" type="text/html" href="${SITE_URL}docs/changelog.html"/>
  <id>${SITE_URL}docs/changelog.html</id>
  <updated>${updated}</updated>
  <author><name>${AUTHOR.name}</name><uri>${AUTHOR.url}</uri></author>
  <icon>${SITE_URL}favicon.png</icon>
${entries.join("\n")}
</feed>
`;
}

// ---- Page chrome.

function shell({ site, title, description, canonical, siteFile, body, jsonLd, keywords = [], ogType = "article", sidebar = "", toc = "", modified = null, markdownUrl = null }) {
  const asset = (path) => linkTo(siteFile, path);
  const root = relative(dirname(siteFile), SITE).split(sep).join("/");
  const latest = site.latest;
  // The site suffix only when it still fits a search result title; a long title stands alone.
  const fullTitle = title.length + 16 <= 70 ? `${title} · Aletheia docs` : title;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${keywords.length ? `<meta name="keywords" content="${esc(keywords.join(", "))}">\n` : ""}<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<meta name="author" content="${AUTHOR.name}">
<meta name="google-site-verification" content="rZF-Cs7rUbS1FtbUSXFUQLM0TUQzqfHodsSL-sMImTM">
<meta name="msvalidate.01" content="E411C74C3FFB0D6D84EB24CA7C7E7101">
<meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1117" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/plain" href="${SITE_URL}llms.txt" title="llms.txt">
<link rel="alternate" type="application/atom+xml" href="${SITE_URL}${FEED_REL}" title="Aletheia release notes">
${markdownUrl ? `<link rel="alternate" type="text/markdown" href="${markdownUrl}" title="Markdown">\n` : ""}<link rel="icon" type="image/png" sizes="64x64" href="${asset("favicon.png")}">
<link rel="icon" type="image/png" sizes="32x32" href="${asset("favicon-32.png")}">
<link rel="apple-touch-icon" href="${asset("apple-touch-icon.png")}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SOCIAL.url}">
<meta property="og:image:width" content="${SOCIAL.width}">
<meta property="og:image:height" content="${SOCIAL.height}">
<meta property="og:image:alt" content="${SOCIAL.alt}">
${ogType === "article" && modified ? `<meta property="article:modified_time" content="${modified}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SOCIAL.url}">
<link rel="stylesheet" href="${asset("style.css")}">
<noscript><style>.side{position:static;transform:none;width:auto;height:auto;box-shadow:none}.menu,.search{display:none}</style></noscript>
${(Array.isArray(jsonLd) ? jsonLd : [jsonLd]).map((data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`).join("\n")}
</head>
<body class="docs" data-root="${root ? `${root}/` : ""}">
<a class="skip" href="#content">Skip to content</a>
<header class="top"><div class="bar">
  <a class="brand" href="${asset("")}"><img src="${asset("assets/mark.png")}" alt="" width="26" height="26">Aletheia</a>
  ${latest ? `<a class="ver" href="${asset(releaseRel(latest))}" title="Latest release, ${latest.date}">v${latest.version}</a>` : ""}
  <div class="search" role="search"><input id="ds" type="search" placeholder="Search the docs" aria-label="Search the documentation" autocomplete="off"><kbd>/</kbd><div id="dsr" class="results" hidden></div></div>
  <nav aria-label="Main"><a href="${asset("docs/")}">Docs</a><a href="${asset("docs/changelog.html")}">Release notes</a><a href="${asset("docs/start/quickstart.html")}">Quickstart</a><a class="gh" href="${REPO}">GitHub</a></nav>
  <button class="menu" type="button" aria-controls="side" aria-expanded="false">Menu</button>
</div></header>
<div class="docs-shell">
${sidebar}<main id="content" class="doc">
<div class="doc-grid${toc ? "" : " no-toc"}">
<article>
${body}
</article>
${toc}</div>
<footer>By <a rel="author" href="${AUTHOR.url}">${AUTHOR.name}</a> · Apache-2.0 · <a href="${REPO}/blob/main/NOTICE.md">NOTICE</a> · <a href="${REPO}">GitHub</a> · <a href="${NPM}">npm</a> · <a href="${asset("docs/changelog.html")}">Release notes</a> · <a href="${asset(FEED_REL)}">Atom feed</a> · <a href="${asset("llms.txt")}">llms.txt</a> · <a href="${asset("sitemap.xml")}">Sitemap</a></footer>
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function sidebarHtml(site, current, siteFile) {
  const item = (rel, label, isCurrent, extra = "") => `<li><a href="${linkTo(siteFile, rel)}"${isCurrent ? ' aria-current="page"' : ""}>${esc(label)}${extra}</a></li>`;
  const groups = site.sections.map((section) => {
    const open = section.pages.includes(current) || !COLLAPSED.has(section.title) ? " open" : "";
    const items = section.pages.map((page) => item(page.siteRel, page.label, page === current)).join("");
    return `<details${open}><summary>${esc(section.title)}</summary><ul>${items}</ul></details>`;
  });
  const releases = site.log.releases;
  if (releases.length) {
    const shown = releases.filter((release, index) => index < SIDEBAR_RELEASES || release === current);
    const tag = (release) => (release === site.latest ? ' <span class="tag">latest</span>' : release.yanked ? ' <span class="tag">yanked</span>' : "");
    const items = [item("docs/changelog.html", "All release notes", current === "changelog"), ...shown.map((release) => item(releaseRel(release), `v${release.version}`, release === current, tag(release)))];
    groups.push(`<details open class="side-releases"><summary>Release notes</summary><ul>${items.join("")}</ul></details>`);
  }
  const top = `<a class="side-home" href="${linkTo(siteFile, "docs/")}">Documentation home</a>${site.latest ? `<a class="side-home" href="${linkTo(siteFile, "docs/changelog.html")}">Release notes <span class="tag">v${site.latest.version}</span></a>` : ""}`;
  return `<aside class="side" id="side" aria-label="Documentation">${top}${groups.join("")}</aside>\n`;
}

// trail: [{ name, rel?, url? }]. rel makes a visible link; url goes into the BreadcrumbList data.
function breadcrumbs(trail, siteFile) {
  const html = `<nav class="crumbs" aria-label="Breadcrumb">${trail.map((item) => (item.rel !== undefined ? `<a href="${linkTo(siteFile, item.rel)}">${esc(item.name)}</a>` : `<span>${esc(item.name)}</span>`)).join(" › ")}</nav>`;
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.filter((item) => item.url).map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
  };
  return { html, data };
}

const HOME_CRUMBS = [
  { name: "Aletheia", rel: "", url: SITE_URL },
  { name: "Docs", rel: "docs/", url: `${SITE_URL}docs/` },
];

function tocHtml(items, minimum = 3) {
  if (items.length < minimum) return "";
  return `<nav class="toc" aria-label="On this page"><strong>On this page</strong><ul>${items.map((item) => `<li><a href="#${esc(item.id)}">${esc(item.text)}</a></li>`).join("")}</ul></nav>\n`;
}

function prevNext(site, page, siteFile) {
  const index = site.order.indexOf(page);
  const link = (target, label) => `<a class="${label.toLowerCase()}" href="${linkTo(siteFile, target.siteRel)}"><small>${label}</small><span>${esc(target.title)}</span></a>`;
  const before = site.order[index - 1];
  const after = site.order[index + 1];
  if (!before && !after) return "";
  return `<nav class="pager" aria-label="Previous and next">${before ? link(before, "Previous") : "<span></span>"}${after ? link(after, "Next") : "<span></span>"}</nav>`;
}

// A "Next steps" list whose items are all "[Label](link) - text" becomes a grid of cards.
function nextStepCards(html) {
  return html.replace(/(<h2 id="next-steps">[\s\S]*?<\/h2>\n)<ul>([\s\S]*?)<\/ul>/, (whole, heading, list) => {
    const items = list.split("</li>").filter((item) => item.trim());
    const cards = items.map((item) => /^<li><a href="([^"]+)">([\s\S]*?)<\/a>\s*(?:[-–—:]\s*)?([\s\S]*)$/.exec(item));
    if (!cards.length || cards.some((card) => !card)) return whole;
    return `${heading}<div class="cards">${cards.map(([, href, label, text]) => `<a class="card-link" href="${href}"><strong>${label}</strong>${text.trim() ? `<span>${text.trim()}</span>` : ""}</a>`).join("")}</div>`;
  });
}

function buildLlms(site) {
  const url = (page) => `${SITE_URL}${page.mdRel}`;
  const lines = [`# ${SITE_NAME}`, "", `> ${SITE_SUMMARY}`, "", "Aletheia is a small server, a command line tool and an MCP server over one local SQLite file. Hooks in each AI coding tool capture sessions, secrets are redacted before storing, and the next session gets the relevant context back. Rules are written once and synced into each tool's own instruction file. Every page below is plain Markdown. Real-tool verification is stated per tool; answer accuracy is not measured.", ""];
  for (const section of site.sections) {
    lines.push(`## ${section.title}`, "");
    for (const page of section.pages) lines.push(`- [${page.title}](${url(page)}): ${page.description}`);
    lines.push("");
  }
  if (site.log.releases.length) {
    lines.push("## Release notes", "");
    for (const release of site.log.releases) lines.push(`- [${releaseTitle(release)}](${SITE_URL}${releaseMdRel(release)}): ${releaseDescription(release)}`);
    lines.push("");
  }
  lines.push("## Optional", "", `- [README](${REPO}/blob/main/README.md): install, status and limits`, `- [Changelog](${SITE_URL}docs/changelog.html): release notes, generated from CHANGELOG.md`, `- [Release feed](${SITE_URL}${FEED_REL}): Atom feed of new releases`, `- [Full text of every page](${SITE_URL}llms-full.txt): all documentation in one file`, "");
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

const START_CARDS = ["start/introduction", "start/installation", "start/quickstart", "tools/overview", "guides/migrate-from-claude-mem", "reference/cli"];

function docsIndexBody(site, siteFile) {
  const latest = site.latest;
  const card = (href, title, text) => `<a class="card-link" href="${href}"><strong>${esc(title)}</strong><span>${esc(text)}</span></a>`;
  const cards = START_CARDS.map((rel) => site.order.find((page) => page.rel === rel))
    .filter(Boolean)
    .map((page) => card(linkTo(siteFile, page.siteRel), page.label, page.description));
  if (latest) cards.push(card(linkTo(siteFile, releaseRel(latest)), `Release notes: ${latest.version}`, `${latest.date}. ${countsText(latest.counts)}. Every release, newest first.`));
  const sections = site.sections
    .map((section) => {
      const items = section.pages
        .map((page) => {
          const search = [page.title, page.description, page.keywords.join(" "), headingsOf(page.markdown, 2).map((item) => item.text).join(" ")].join(" ").toLowerCase();
          return `<li data-search="${esc(search)}"><a href="${linkTo(siteFile, page.siteRel)}">${esc(page.title)}</a><span>${esc(page.description)}</span></li>`;
        })
        .join("");
      return `<section class="docsec"><h2>${esc(section.title)}</h2><ul class="doclist">${items}</ul></section>`;
    })
    .join("\n");
  const script = `<script>(function(){var q=document.getElementById("q");if(!q)return;var items=[].slice.call(document.querySelectorAll("[data-search]"));var secs=[].slice.call(document.querySelectorAll(".docsec"));q.addEventListener("input",function(){var terms=q.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);items.forEach(function(li){var t=li.getAttribute("data-search");li.hidden=!terms.every(function(w){return t.indexOf(w)>=0})});secs.forEach(function(s){s.hidden=!s.querySelector("[data-search]:not([hidden])")})})})();</script>`;
  return `<h1>Aletheia documentation</h1>
<p class="lead">Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools. These ${site.order.length} pages cover installing it, connecting Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode, how memory and rules work, the CLI, MCP and REST reference, and how it compares with claude-mem and other memory tools.</p>
<pre><code class="language-bash">npm install -g aletheia-mem
aletheia-server</code></pre>
<p>Then open <code>http://127.0.0.1:37790</code>. It needs <a href="https://bun.sh">Bun</a> 1.1 or newer and has no runtime dependencies.</p>
<h2 id="start-here">Start here<a class="anchor" href="#start-here" aria-hidden="true" tabindex="-1"></a></h2>
<div class="cards">${cards.join("")}</div>
<h2 id="all-pages">All pages<a class="anchor" href="#all-pages" aria-hidden="true" tabindex="-1"></a></h2>
<p class="docsearch"><label for="q">Filter the pages</label><input id="q" type="search" placeholder="for example: claude code memory, rules sync, mcp tools" autocomplete="off"></p>
${sections}
<p>AI tools can read <a href="${linkTo(siteFile, "llms.txt")}">llms.txt</a> or <a href="${linkTo(siteFile, "llms-full.txt")}">llms-full.txt</a>. Every page also has a plain Markdown copy at the same address ending in <code>.md</code>. The Markdown in <code>docs/</code> is canonical.</p>
${script}`;
}

function softwareData(site) {
  const latest = site.latest;
  return {
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: "aletheia-mem",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Linux, macOS, Windows",
    url: SITE_URL,
    ...(latest ? { softwareVersion: latest.version, releaseNotes: `${SITE_URL}${releaseRel(latest)}` } : {}),
    downloadUrl: NPM,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: AUTHOR,
  };
}

// The landing page is hand-written. The build fills only the marked release line and two JSON-LD fields.
function updateLanding(site) {
  const file = join(SITE, "index.html");
  const latest = site.latest;
  if (!existsSync(file) || !latest) return;
  const before = readFileSync(file, "utf8");
  const line = `<!-- release:begin --><p class="release-line">Latest release: <a href="${releaseRel(latest)}">Aletheia ${latest.version}</a>, ${latest.date} · <a href="docs/changelog.html">All release notes</a></p><!-- release:end -->`;
  const after = before
    .replace(/<!-- release:begin -->[\s\S]*?<!-- release:end -->/, line)
    .replace(/"softwareVersion":"[^"]*","releaseNotes":"[^"]*",/, "")
    .replace('"license":"https://www.apache.org/licenses/LICENSE-2.0","isAccessibleForFree"', `"softwareVersion":"${latest.version}","releaseNotes":"${SITE_URL}${releaseRel(latest)}","license":"https://www.apache.org/licenses/LICENSE-2.0","isAccessibleForFree"`);
  if (after !== before) writeFileSync(file, after);
}

function searchIndex(site) {
  const entries = site.order.map((page) => ({
    t: page.title,
    u: page.siteRel,
    s: page.section,
    d: page.description,
    k: page.keywords.join(" "),
    h: headingsOf(page.markdown, 2).map((item) => item.text).join(" · "),
  }));
  entries.push({ t: "Release notes", u: "docs/changelog.html", s: "Release notes", d: "Every Aletheia release, newest first.", k: "changelog releases versions what is new", h: site.log.releases.map((release) => release.version).join(" ") });
  for (const release of site.log.releases) {
    entries.push({ t: releaseTitle(release), u: releaseRel(release), s: "Release notes", d: releaseDescription(release), k: `${release.version} v${release.version} ${release.date} release changelog`, h: Object.keys(release.counts).join(" · ") });
  }
  return `${JSON.stringify(entries)}\n`;
}

function articleData({ headline, description, url, modified, published = null, keywords = [] }) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage: "en",
    ...(published ? { datePublished: published } : {}),
    dateModified: modified,
    ...(keywords.length ? { keywords: keywords.join(", ") } : {}),
    about: { "@type": "SoftwareApplication", name: SITE_NAME, alternateName: "aletheia-mem", url: SITE_URL },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    author: AUTHOR,
    publisher: AUTHOR,
    image: SOCIAL.url,
    license: "https://www.apache.org/licenses/LICENSE-2.0",
  };
}

function main() {
  const tracked = trackedFiles(ROOT);
  const site = loadPages(tracked);
  const { pages, order } = site;
  const changelogSource = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  site.log = parseChangelog(changelogSource);
  site.latest = site.log.releases[0] ?? null;

  mkdirSync(join(SITE, "docs"), { recursive: true });
  mkdirSync(join(SITE, "assets"), { recursive: true });
  rmSync(join(SITE, "docs", "releases"), { recursive: true, force: true });
  mkdirSync(join(SITE, "docs", "releases"), { recursive: true });
  for (const asset of readdirSync(join(DOCS, "assets"))) {
    if (asset.endsWith(".svg")) copyFileSync(join(DOCS, "assets", asset), join(SITE, "assets", asset));
  }

  for (const page of order) {
    const siteFile = join(SITE, page.siteRel);
    const canonical = `${SITE_URL}${page.siteRel}`;
    const ctx = { root: ROOT, siteDir: SITE, sourceFile: page.file, siteFile, pages };
    const crumbs = breadcrumbs([...HOME_CRUMBS, { name: page.section }, { name: page.label, url: canonical }], siteFile);
    const body = `${crumbs.html}\n${nextStepCards(renderMarkdown(page.markdown, ctx))}\n${prevNext(site, page, siteFile)}`;
    const toc = tocHtml(headingsOf(page.markdown, 2).filter((item) => !/^next steps$/i.test(item.text)));
    const modified = gitDate(relative(ROOT, page.file));
    const jsonLd = [articleData({ headline: page.title, description: page.description, url: canonical, modified, keywords: page.keywords }), crumbs.data];
    const questions = /^(faq|.*\/faq)$/.test(page.rel) ? faqOf(page.markdown) : [];
    if (questions.length) {
      jsonLd.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) });
    }
    mkdirSync(dirname(siteFile), { recursive: true });
    writeFileSync(
      siteFile,
      shell({ site, title: page.title, description: page.description, canonical, siteFile, body, jsonLd, keywords: page.keywords, sidebar: sidebarHtml(site, page, siteFile), toc, modified, markdownUrl: `${SITE_URL}${page.mdRel}` }),
    );
    // A plain Markdown copy beside each page, for people and AI tools that want text without markup.
    writeFileSync(join(SITE, page.mdRel), page.markdown);
  }

  const indexFile = join(SITE, "docs/index.html");
  writeFileSync(
    indexFile,
    shell({
      site,
      title: "Documentation",
      description: "Aletheia documentation: install, connect Claude Code, Codex, Cursor and Gemini CLI, memory and rules, CLI, MCP and REST reference, release notes.",
      canonical: `${SITE_URL}docs/`,
      siteFile: indexFile,
      ogType: "website",
      body: docsIndexBody(site, indexFile),
      keywords: ["claude code memory", "ai agent memory", "mcp memory server", "aletheia-mem documentation"],
      sidebar: sidebarHtml(site, null, indexFile),
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Aletheia documentation",
          url: `${SITE_URL}docs/`,
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
          about: softwareData(site),
          hasPart: order.map((page) => ({ "@type": "TechArticle", headline: page.title, url: `${SITE_URL}${page.siteRel}` })),
        },
        breadcrumbs(HOME_CRUMBS, indexFile).data,
      ],
    }),
  );

  // Release notes: an overview page at the old changelog address, one page per version and an Atom feed.
  const changelogFile = join(SITE, "docs/changelog.html");
  const changelogUrl = `${SITE_URL}docs/changelog.html`;
  const changelogModified = gitDate("CHANGELOG.md");
  const changelogDescription = "Aletheia (aletheia-mem) release notes: what each version added, changed and fixed, newest first, with a page and an Atom feed entry per release.";
  const changelogCrumbs = breadcrumbs([...HOME_CRUMBS, { name: "Release notes", url: changelogUrl }], changelogFile);
  writeFileSync(
    changelogFile,
    shell({
      site,
      title: "Release notes",
      description: changelogDescription,
      canonical: changelogUrl,
      siteFile: changelogFile,
      body: `${changelogCrumbs.html}\n${changelogBody(site, changelogFile)}`,
      keywords: ["aletheia-mem changelog", "aletheia release notes", "aletheia-mem releases"],
      sidebar: sidebarHtml(site, "changelog", changelogFile),
      toc: tocHtml(site.log.releases.slice(0, 15).map((release) => ({ id: `v${release.version}`, text: `${release.version} · ${release.date}` })), 1),
      modified: changelogModified,
      markdownUrl: `${SITE_URL}docs/changelog.md`,
      jsonLd: [
        { ...articleData({ headline: "Aletheia release notes", description: changelogDescription, url: changelogUrl, modified: changelogModified, keywords: ["changelog", "release notes"] }), about: softwareData(site) },
        changelogCrumbs.data,
      ],
    }),
  );
  writeFileSync(join(SITE, "docs/changelog.md"), changelogSource);

  for (const release of site.log.releases) {
    const siteFile = join(SITE, releaseRel(release));
    const canonical = `${SITE_URL}${releaseRel(release)}`;
    const description = releaseDescription(release);
    const crumbs = breadcrumbs([...HOME_CRUMBS, { name: "Release notes", rel: "docs/changelog.html", url: changelogUrl }, { name: release.version, url: canonical }], siteFile);
    const about = { "@type": "SoftwareApplication", name: SITE_NAME, alternateName: "aletheia-mem", url: SITE_URL, softwareVersion: release.version, releaseNotes: canonical };
    writeFileSync(
      siteFile,
      shell({
        site,
        title: releaseTitle(release),
        description,
        canonical,
        siteFile,
        body: `${crumbs.html}\n${releasePageBody(site, release, siteFile)}`,
        keywords: [`aletheia-mem ${release.version}`, `aletheia ${release.version} release notes`, "aletheia-mem changelog"],
        sidebar: sidebarHtml(site, release, siteFile),
        toc: tocHtml(headingsOf(release.markdown, 3), 2),
        modified: release.date,
        markdownUrl: `${SITE_URL}${releaseMdRel(release)}`,
        jsonLd: [{ ...articleData({ headline: releaseTitle(release), description, url: canonical, modified: release.date, published: release.date }), about }, crumbs.data],
      }),
    );
    writeFileSync(join(SITE, releaseMdRel(release)), releaseMarkdown(release));
  }
  writeFileSync(join(SITE, FEED_REL), buildFeed(site));
  writeFileSync(join(SITE, "docs/search.json"), searchIndex(site));
  updateLanding(site);

  const urls = [
    { loc: SITE_URL, lastmod: gitDate("site/index.html") },
    { loc: `${SITE_URL}docs/`, lastmod: order.map((page) => gitDate(relative(ROOT, page.file))).sort().at(-1) ?? gitDate("docs") },
    { loc: changelogUrl, lastmod: changelogModified },
    ...site.log.releases.map((release) => ({ loc: `${SITE_URL}${releaseRel(release)}`, lastmod: release.date })),
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
  writeFileSync(join(SITE, "llms-full.txt"), buildLlmsFull(site, [{ siteRel: "docs/changelog.html", markdown: changelogSource }]));
  console.log(`site built: ${pages.size} document pages + index + release notes (${site.log.releases.length} versions); sitemap has ${urls.length} URLs`);
}

if (import.meta.main) main();
