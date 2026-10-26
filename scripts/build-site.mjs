#!/usr/bin/env bun
// Build the static documentation site from the top-level Markdown files in docs/.
// Plain HTML, no framework, no CDN, relative links. Writes site/docs/*.html, site/sitemap.xml and site/robots.txt.
// The landing page site/index.html is hand-written and is not overwritten.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.env.SITE_ROOT ? resolve(process.env.SITE_ROOT) : join(import.meta.dir, "..");
const SITE = join(ROOT, "site");
const DOCS = join(ROOT, "docs");
const SITE_URL = "https://mohamed-ashraf-elsaed.github.io/aletheia-mem/";
const REPO = "https://github.com/mohamed-ashraf-elsaed/aletheia-mem";

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
    if (line.startsWith("```") || line.startsWith("|") || line.startsWith(">") || /^\s*([-*+]|\d+\.)\s+/.test(line)) continue;
    started = true;
    text.push(line.trim());
  }
  const plain = text.join(" ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "");
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
}

function gitDate(path) {
  try {
    const output = execFileSync("git", ["log", "-1", "--format=%cs", "--", path], { cwd: ROOT, encoding: "utf8" }).trim();
    if (output) return output;
  } catch { /* fall through */ }
  try {
    return statSync(join(ROOT, path)).mtime.toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shell({ title, description, canonical, siteFile, body, jsonLd }) {
  const from = dirname(siteFile);
  const asset = (path) => relative(from, join(SITE, path)).split(sep).join("/");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Aletheia docs</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/svg+xml" href="${asset("favicon.svg")}">
<link rel="stylesheet" href="${asset("style.css")}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="top"><div class="wrap">
  <a class="brand" href="${asset("index.html")}"><img src="${asset("assets/logo.svg")}" alt="" width="26" height="26">Aletheia</a>
  <nav aria-label="Main"><a href="${asset("index.html")}">Home</a><a href="${asset("docs/index.html")}">Docs</a><a href="${REPO}">GitHub</a></nav>
</div></header>
<main class="wrap doc">
<article>
${body}
</article>
<footer>Apache-2.0 · <a href="${REPO}/blob/main/NOTICE.md">NOTICE</a> · <a href="${REPO}">GitHub</a></footer>
</main>
</body>
</html>
`;
}

function main() {
  const docsDir = DOCS;
  const files = readdirSync(docsDir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
    .sort()
    .map((name) => join(docsDir, name));
  if (!files.length) throw new Error("no Markdown documents found in docs/");

  const pages = new Map();
  for (const file of files) {
    pages.set(`docs/${basename(file, ".md")}.html`, { file, title: firstHeading(readFileSync(file, "utf8")) ?? basename(file, ".md"), description: descriptionOf(readFileSync(file, "utf8")) });
  }

  mkdirSync(join(SITE, "docs"), { recursive: true });
  mkdirSync(join(SITE, "assets"), { recursive: true });
  for (const asset of readdirSync(join(DOCS, "assets"))) {
    if (asset.endsWith(".svg")) copyFileSync(join(DOCS, "assets", asset), join(SITE, "assets", asset));
  }

  for (const [siteRel, page] of pages) {
    const siteFile = join(SITE, siteRel);
    const sourceFile = page.file;
    const markdown = readFileSync(sourceFile, "utf8");
    const canonical = `${SITE_URL}${siteRel}`;
    const ctx = { root: ROOT, siteDir: SITE, sourceFile, siteFile, pages };
    const body = renderMarkdown(markdown, ctx);
    const html = shell({
      title: page.title,
      description: page.description,
      canonical,
      siteFile,
      body,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: page.title,
        description: page.description,
        url: canonical,
        isPartOf: { "@type": "WebSite", name: "Aletheia", url: SITE_URL },
        author: { "@type": "Person", name: "Mohamed Ashraf Elsaed" },
        license: "https://www.apache.org/licenses/LICENSE-2.0",
      },
    });
    mkdirSync(dirname(siteFile), { recursive: true });
    writeFileSync(siteFile, html);
  }

  const list = [...pages.entries()].sort(([a], [b]) => a.localeCompare(b));
  const groups = [
    ["Core", list.filter(([name]) => /^docs\/0[1-9]|^docs\/10-/.test(name))],
    ["Product and research", list.filter(([name]) => /^docs\/1[1-8]-/.test(name))],
    ["Comparison and operations", list.filter(([name]) => /^docs\/2[0-9]-|^docs\/30-/.test(name))],
    ["Guides", list.filter(([name]) => !/^docs\/(?:0[1-9]|1[0-8]|2[0-9]|30)-/.test(name))],
  ];
  const sections = groups
    .filter(([, entries]) => entries.length)
    .map(([heading, entries]) => `<h2>${heading}</h2><ul>${entries.map(([siteRel, page]) => `<li><a href="${basename(siteRel)}">${esc(page.title)}</a> — ${esc(page.description)}</li>`).join("")}</ul>`)
    .join("\n");

  const indexFile = join(SITE, "docs/index.html");
  writeFileSync(
    indexFile,
    shell({
      title: "Documentation",
      description: "Every Aletheia document: architecture, installers, benchmarks, sync, remote MCP and the task system.",
      canonical: `${SITE_URL}docs/`,
      siteFile: indexFile,
      body: `<h1>Documentation</h1><p>${pages.size} documents, generated from the Markdown in <code>docs/</code>. The Markdown is canonical.</p>${sections}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Aletheia documentation",
        url: `${SITE_URL}docs/`,
        isPartOf: { "@type": "WebSite", name: "Aletheia", url: SITE_URL },
      },
    }),
  );

  const urls = [
    { loc: SITE_URL, lastmod: gitDate("site/index.html") },
    { loc: `${SITE_URL}docs/`, lastmod: files.map((file) => gitDate(relative(ROOT, file))).sort().at(-1) ?? gitDate("docs") },
    ...[...pages.entries()].map(([siteRel, page]) => ({ loc: `${SITE_URL}${siteRel}`, lastmod: gitDate(relative(ROOT, page.file)) })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${url.loc}</loc><lastmod>${url.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  writeFileSync(join(SITE, "sitemap.xml"), sitemap);
  writeFileSync(join(SITE, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
  console.log(`site built: ${pages.size} document pages + index; sitemap has ${urls.length} URLs`);
}

if (import.meta.main) main();
