// The regression gate compares a measured result against bench/baseline.json. The pure evaluate() function
// is tested with fake numbers, and the CLI is spawned once to prove a missing baseline fails with a clear message.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { evaluate } from "../bench/gate.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");

afterAll(() => cleanupTempDirs());

function baseline(overrides = {}) {
  return { recall5: 1, p95_ms: 10, ...overrides };
}

describe("gate evaluate", () => {
  test("an equal result passes", () => {
    const verdict = evaluate(baseline(), { recall5: 1, p95_ms: 10 });
    expect(verdict.pass).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  test("a fake worse recall result fails the gate", () => {
    const verdict = evaluate(baseline(), { recall5: 0.97, p95_ms: 10 });
    expect(verdict.pass).toBe(false);
    expect(verdict.recallDelta).toBeCloseTo(-0.03, 5);
    expect(verdict.reasons.join(" ")).toContain("Recall@5");
  });

  test("a seeded two-point recall regression fails", () => {
    const verdict = evaluate(baseline({ recall5: 0.9 }), { recall5: 0.88, p95_ms: 10 });
    expect(verdict.pass).toBe(false);
    expect(verdict.recallDelta).toBeCloseTo(-0.02, 5);
  });

  test("a seeded 10% latency regression passes", () => {
    const verdict = evaluate(baseline({ p95_ms: 10 }), { recall5: 1, p95_ms: 11 });
    expect(verdict.pass).toBe(true);
    expect(verdict.latencyPass).toBe(true);
  });

  test("a latency rise above 20% fails when the baseline is at or above the floor", () => {
    const verdict = evaluate(baseline({ p95_ms: 10 }), { recall5: 1, p95_ms: 12.5 });
    expect(verdict.pass).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("p95 latency");
  });

  test("latency below the 5 ms floor is reported, not enforced", () => {
    const verdict = evaluate(baseline({ p95_ms: 3 }), { recall5: 1, p95_ms: 8 });
    expect(verdict.latencyEnforced).toBe(false);
    expect(verdict.pass).toBe(true);
  });
});

describe("gate CLI", () => {
  test("a missing baseline fails with a clear message", async () => {
    const dir = tempDir("aletheia-gate-");
    const missing = join(dir, "missing.json");
    const proc = Bun.spawn([process.execPath, join(root, "bench", "gate.mjs"), "--baseline", missing], {
      cwd: root, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("No baseline");
    expect(stderr).toContain(missing);
  });
});
