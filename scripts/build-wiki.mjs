#!/usr/bin/env bun
// Build the GitHub wiki from the same Markdown and navigation as the docs site.
//   bun scripts/build-wiki.mjs [--out wiki-out]
// The Markdown in docs/ stays canonical. The wiki is a generated copy: links between documents become wiki links,
// links to other repository files become GitHub links, and the private keyword comments are removed.
// Publishing is a separate step: copy the output into a clone of <repo>.wiki.git, commit and push.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { loadPages } from "./build-site.mjs";
import { trackedFiles } from "./tracked.mjs";

const ROOT = join(import.meta.dir, "..");
const REPO = "https://github.com/mohamed-ashraf-elsaed/aletheia-mem";
const SITE_URL = "https://aletheia.mohamedashrafelsaed.com/";

const argOut = process.argv.indexOf("--out");
const OUT = resolve(argOut > 0 ? process.argv[argOut + 1] : join(ROOT, "wiki-out"));

/** A wiki page name from a title: the part before a colon, words joined with hyphens. */
export function wikiName(title) {
  return String(title)
    .replace(/^\d+[.)]?\s+/, "")
    .replace(/\s*:.*$/, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** Rewrite the links and images of one page's Markdown for the wiki. */
export function toWikiMarkdown(markdown, page, names) {
  const fence = /^\s*```/;
  let fenced = false;
  const lines = markdown.split("\n").filter((line) => !/^<!--.*-->\s*$/.test(line));
  const resolveTarget = (target) => {
    if (/^(https?:|mailto:|#)/i.test(target)) return target;
    const [path, anchor] = target.split("#");
    const abs = resolve(dirname(page.file), path);
    const rel = relative(ROOT, abs).split(sep).join("/");
    if (rel.startsWith("..")) return target;
    const docsRel = rel.startsWith("docs/") ? rel.slice("docs/".length).replace(/\.md$/, "") : null;
    if (docsRel && names.has(docsRel)) return `${names.get(docsRel)}${anchor ? `#${anchor}` : ""}`;
    if (/\.(png|webp|jpg|jpeg|gif|svg)$/i.test(rel)) return `https://raw.githubusercontent.com/mohamed-ashraf-elsaed/aletheia-mem/main/${rel}`;
    return `${REPO}/blob/main/${rel}${anchor ? `#${anchor}` : ""}`;
  };
  const rewritten = lines.map((line) => {
    if (fence.test(line)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    return line.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (_all, bang, label, target, title) => `${bang}[${label}](${resolveTarget(target)}${title})`);
  });
  return `${rewritten.join("\n").trim()}\n\n---\n\nThis page is generated from [\`docs/${page.rel}.md\`](${REPO}/blob/main/docs/${page.rel}.md). Edit the Markdown in the repository, not the wiki. Site version: ${SITE_URL}${page.siteRel}\n`;
}

function main() {
  const site = loadPages(trackedFiles(ROOT));
  const names = new Map();
  const taken = new Set();
  for (const page of site.order) {
    const name = wikiName(page.title);
    if (!name || ["Home", "_Sidebar", "_Footer"].includes(name)) throw new Error(`wiki: bad page name for ${page.rel}`);
    if (taken.has(name.toLowerCase())) throw new Error(`wiki: two pages would be named ${name} (${page.rel})`);
    taken.add(name.toLowerCase());
    names.set(page.rel, name);
  }
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(OUT)) if (file.endsWith(".md")) rmSync(join(OUT, file));

  for (const page of site.order) writeFileSync(join(OUT, `${names.get(page.rel)}.md`), toWikiMarkdown(page.markdown, page, names));

  const list = (section) => section.pages.map((page) => `- [[${page.title.replace(/\s*:.*$/, "")}|${names.get(page.rel)}]]`).join("\n");
  const homeSections = site.sections
    .map((section) => `### ${section.title}\n\n${section.pages.map((page) => `- [${page.title.replace(/\s*:.*$/, "")}](${names.get(page.rel)}): ${page.description}`).join("\n")}`)
    .join("\n\n");
  writeFileSync(
    join(OUT, "Home.md"),
    `# Aletheia wiki\n\nAletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools such as Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode. One SQLite store is read over MCP, REST or CLI. Apache-2.0, no account, no telemetry. Status: alpha.\n\nStart with the [Introduction](${names.get("start/introduction")}) and the [Quickstart](${names.get("start/quickstart")}). This wiki is generated from the Markdown in [\`docs/\`](${REPO}/tree/main/docs); the same pages are on the [documentation site](${SITE_URL}docs/).\n\n${homeSections}\n\n---\n\n[Repository](${REPO}) · [npm](https://www.npmjs.com/package/aletheia-mem) · [llms.txt](${SITE_URL}llms.txt) · [Changelog](${REPO}/blob/main/CHANGELOG.md)\n`,
  );
  writeFileSync(join(OUT, "_Sidebar.md"), `**[Home](Home)**\n\n${site.sections.map((section) => `**${section.title}**\n\n${list(section)}`).join("\n\n")}\n`);
  writeFileSync(join(OUT, "_Footer.md"), `Apache-2.0 · [Repository](${REPO}) · [npm](https://www.npmjs.com/package/aletheia-mem) · [Docs site](${SITE_URL}docs/) · Generated from \`docs/\`; edit the Markdown in the repository.\n`);
  console.log(`wiki built: ${site.order.length} pages + Home, _Sidebar, _Footer in ${relative(ROOT, OUT) || "."}`);
}

if (import.meta.main) main();
