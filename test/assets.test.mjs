// T-083: the owner's logo (PNG), the brain mark, favicons and a 1280x640 social card; no demo GIF is claimed.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const size = (path) => {
  const bytes = readFileSync(join(root, path));
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};
const files = ["docs/assets/logo.png", "docs/assets/mark.png", "docs/assets/social.png", "site/assets/mark.png", "site/assets/logo.png", "site/assets/social.png", "site/favicon.png", "site/favicon-32.png", "site/apple-touch-icon.png", "public/favicon.png"];

describe("visual assets", () => {
  test("every asset exists, is a real PNG and stays small enough for a README", () => {
    for (const file of files) {
      expect(existsSync(join(root, file))).toBe(true);
      size(file);
      expect(statSync(join(root, file)).size).toBeLessThan(600 * 1024);
    }
  });

  test("the social card is 1280x640 and the favicons are square", () => {
    expect(size("docs/assets/social.png")).toEqual({ width: 1280, height: 640 });
    expect(size("site/assets/social.png")).toEqual({ width: 1280, height: 640 });
    for (const file of ["docs/assets/mark.png", "site/assets/mark.png", "site/favicon.png", "site/favicon-32.png", "site/apple-touch-icon.png", "public/favicon.png"]) {
      const { width, height } = size(file);
      expect(width).toBe(height);
    }
    expect(size("site/favicon-32.png").width).toBe(32);
  });

  test("README, translations, site header and app pages point at the new files", () => {
    expect(read("README.md")).toContain("docs/assets/logo.png");
    expect(read("README.md")).not.toContain("logo.svg");
    expect(read("site/index.html")).toContain("assets/mark.png");
    expect(read("site/index.html")).toContain("assets/social.png");
    expect(read("site/index.html")).toContain("assets/logo.png");
    expect(read("site/index.html")).toContain('rel="icon"');
    expect(read("public/index.html")).toContain("/work-view/favicon.png");
    expect(read("public/work.html")).toContain("/work-view/favicon.png");
    expect(read("docs/i18n/README.fr.md")).toContain("../assets/logo.png");
  });

  test("no old SVG logo files remain", () => {
    for (const file of ["docs/assets/logo.svg", "docs/assets/logo-dark.svg", "docs/assets/social.svg", "site/assets/logo.svg", "site/favicon.svg", "public/favicon.svg"]) {
      expect(existsSync(join(root, file))).toBe(false);
    }
  });

  test("no demo GIF is referenced or claimed", () => {
    for (const file of ["README.md", "site/index.html", "docs/24-repo-parity-and-growth.md"].filter((name) => existsSync(join(root, name)))) {
      expect(read(file)).not.toMatch(/demo\.gif|\.gif\)/i);
    }
  });
});
