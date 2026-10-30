// the top of the README is the npm package page. It must render from the tarball alone.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { imageRefs, relativeLinks, README_TOP_LINES } from "../scripts/release.mjs";

const root = join(import.meta.dir, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const top = readme.split("\n").slice(0, README_TOP_LINES).join("\n");
const RAW = "https://raw.githubusercontent.com/mohamed-ashraf-elsaed/aletheia-mem/main/";

describe("README top block", () => {
  test("every image in the top lines is a raw GitHub URL for a file that exists here", () => {
    const refs = imageRefs(top).filter((r) => !/img\.shields\.io|badge\.svg|glama\.ai\/mcp\/servers\/mohamed-ashraf-elsaed\/aletheia-mem\/badges\/score\.svg|badge\.socket\.dev\/npm\/package\/aletheia-mem|opensourcealternatives\.to\/badge-osa\.svg/.test(r.url));
    expect(refs.length).toBeGreaterThanOrEqual(3);
    for (const { url } of refs) {
      expect(url.startsWith(RAW)).toBe(true);
      const path = url.slice(RAW.length);
      expect(path).toMatch(/^docs\/(assets|screenshots)\//);
      expect(existsSync(join(root, path))).toBe(true);
    }
  });

  test("the logo and both screenshots have alt text, and the screenshots are small", () => {
    const refs = imageRefs(top).filter((r) => r.url.startsWith(RAW));
    expect(refs.map((r) => r.url.slice(RAW.length))).toEqual(["docs/assets/logo.png", "docs/screenshots/memory-dark.webp", "docs/screenshots/work-dark.webp"]);
    expect(top).not.toMatch(/alt=""/);
    for (const { url } of refs.slice(1)) expect(statSync(join(root, url.slice(RAW.length))).size).toBeLessThan(100_000);
  });

  test("no image anywhere is relative, and no link in the top lines is relative", () => {
    for (const ref of imageRefs(readme)) expect(ref.url).toMatch(/^https:\/\//);
    expect(relativeLinks(readme)).toEqual([]);
  });

  test("the badge row has the npm version badge and real endpoints only", () => {
    expect(top).toContain("https://img.shields.io/npm/v/aletheia-mem");
    expect(top).toContain("https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/aletheia-mem/badges/score.svg");
    expect(top).toContain("https://badge.socket.dev/npm/package/aletheia-mem)");
    expect(top).toContain("actions/workflows/test.yml/badge.svg");
    expect(top).toContain("img.shields.io/github/license/");
    expect(top).toContain("img.shields.io/badge/bun-%3E%3D1.1-black");
    expect(top).not.toMatch(/shields\.io\/(npm\/d|.*downloads)/);
  });

  test("the install block names the package, the server and the loopback URL, and says Bun is required", () => {
    expect(top).toContain("npm install -g aletheia-mem");
    expect(top).toContain("aletheia-server");
    expect(top).toContain("http://127.0.0.1:37790");
    expect(top).toMatch(/Bun 1\.1 or newer is required/);
  });

  test("the link row points at the docs site from package.json, the frontend guide, the changelog and issues", () => {
    expect(top).toContain(`href="${pkg.homepage}"`);
    expect(top).toContain("blob/main/docs/06-frontend.md");
    expect(top).toContain("blob/main/CHANGELOG.md");
    expect(top).toContain(pkg.bugs.url);
    expect(existsSync(join(root, "docs/06-frontend.md"))).toBe(true);
  });
});

describe("package.json metadata for the npm page", () => {
  test("has the fields npm shows, and no dependencies", () => {
    expect(pkg.description.length).toBeGreaterThan(40);
    expect(pkg.keywords.length).toBeGreaterThanOrEqual(8);
    expect(pkg.homepage).toMatch(/^https:\/\//);
    expect(pkg.bugs.url).toMatch(/\/issues$/);
    expect(pkg.repository.url).toContain("mohamed-ashraf-elsaed/aletheia-mem");
    expect(pkg.engines.bun).toBeTruthy();
    expect(pkg.bin["aletheia-server"]).toBe("bin/aletheia-server.mjs");
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.funding).toBeUndefined();
  });

  test("files ship the changelog and licence files; images load from absolute GitHub URLs, so docs stays out", () => {
    for (const f of ["README.md", "CHANGELOG.md", "LICENSE", "NOTICE.md", "docs/dependencies.md"]) expect(pkg.files).toContain(f);
  });
});
