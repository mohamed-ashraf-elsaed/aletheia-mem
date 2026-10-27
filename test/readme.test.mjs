// T-079: the README may show only badges that read a real endpoint, and no count typed by hand.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBadges, findTypedCounts, renderClaims } from "../scripts/check-claims.mjs";

const root = join(import.meta.dir, "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

describe("README claims", () => {
  test("every badge is an allowed real endpoint in this repository", () => {
    const result = checkBadges(readme, root);
    expect(result.problems).toEqual([]);
    expect(result.badges.length).toBeGreaterThanOrEqual(5);
    expect(readme).not.toMatch(/shields\.io\/npm\/(?!v\/aletheia-mem\))/);
    expect(readme).not.toMatch(/shields\.io\/.*coverage/);
    expect(readme).not.toMatch(/shields\.io\/.*downloads/);
  });

  test("no test, star or download count is typed by hand", () => {
    expect(findTypedCounts(readme)).toEqual([]);
  });

  test("the generated test count is the same with or without maintainer-only files", () => {
    const fullCheckout = renderClaims({ ran: 1286, passed: 1286, failed: 0 });
    const freshClone = renderClaims({ ran: 1286, passed: 1267, failed: 0 });
    expect(fullCheckout).toBe(freshClone);
    expect(fullCheckout).toContain("1,286 tests");
    expect(fullCheckout).toContain("0 failures");
    expect(fullCheckout).not.toMatch(/pass/);
  });

  test("no host is claimed as working without a real-install test", () => {
    expect(readme).not.toMatch(/works with (Cursor|Claude|Codex|Gemini|Windsurf|OpenCode|Command Code)/i);
    expect(readme).toContain("config written from docs, not tested on a real install");
    expect(readme).toContain("none has been run inside the tool");
  });

  test("relative documentation links resolve", async () => {
    const proc = Bun.spawn([process.execPath, "scripts/check-docs-links.mjs"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain("links ok:");
  });
});
