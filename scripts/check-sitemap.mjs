#!/usr/bin/env bun
// Check that site/sitemap.xml lists exactly the pages the site build produced.
//   bun scripts/check-sitemap.mjs
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.env.SITE_ROOT ? process.env.SITE_ROOT : join(import.meta.dir, "..");
const SITE = join(ROOT, "site");
const BASE = "https://mohamed-ashraf-elsaed.github.io/aletheia-mem/";

const locs = [...readFileSync(join(SITE, "sitemap.xml"), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expected = [
  { loc: BASE, file: "index.html" },
  { loc: `${BASE}docs/`, file: "docs/index.html" },
  ...readdirSync(join(SITE, "docs"))
    .filter((name) => name.endsWith(".html") && name !== "index.html")
    .sort()
    .map((name) => ({ loc: `${BASE}docs/${name}`, file: `docs/${name}` })),
];

const problems = [];
const seen = new Set();
for (const loc of locs) {
  if (seen.has(loc)) problems.push(`duplicate URL: ${loc}`);
  seen.add(loc);
}
for (const page of expected) {
  if (!existsSync(join(SITE, page.file))) problems.push(`missing generated file: ${page.file}`);
  if (!seen.has(page.loc)) problems.push(`missing sitemap URL: ${page.loc}`);
}
for (const loc of locs) {
  if (!expected.some((page) => page.loc === loc)) problems.push(`sitemap URL has no page: ${loc}`);
}
if (locs.length !== expected.length) problems.push(`sitemap has ${locs.length} URLs, site has ${expected.length} pages`);
const robots = readFileSync(join(SITE, "robots.txt"), "utf8");
if (!robots.includes(`${BASE}sitemap.xml`)) problems.push("robots.txt does not point at the sitemap");

if (problems.length) {
  for (const problem of problems) console.error(`sitemap: ${problem}`);
  process.exit(1);
}
console.log(`sitemap matches pages: ${expected.length} (${relative(ROOT, SITE)}/docs)`);
