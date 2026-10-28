// a large file that already has observations is gated; a targeted read still passes and a file with no
// history is not gated. Synthetic 32 KB text; no model, no network.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { DEFAULT_GATE_BYTES, outlineOf, readLines, smartFileRead } from "../src/hub/smart-file.mjs";

function bigFile() {
  const lines = [];
  for (let i = 0; i < 800; i++) {
    lines.push(`## Section ${i}`);
    lines.push(`export function handler${i}() { return ${i}; }`);
    lines.push(`This is a filler line for section ${i} to reach a realistic file size.`);
  }
  const text = lines.join("\n");
  return { text, bytes: Buffer.byteLength(text) };
}

describe("file-read gate", () => {
  test("a 32 KB file with history is gated and returns an outline and timeline", () => {
    const store = new HubStore(":memory:");
    const file = "/proj/big.mjs";
    store.add({ project: "p", kind: "note", type: "gotcha", title: "big.mjs gotcha", narrative: "careful here", files: [file] }, { actor: "import" });
    const { text, bytes } = bigFile();
    expect(bytes).toBeGreaterThanOrEqual(DEFAULT_GATE_BYTES);

    const gated = smartFileRead(store, { project: "p", file, text, enabled: true });
    expect(gated.gated).toBe(true);
    expect(gated.text).toBeNull();
    expect(gated.outline.length).toBeGreaterThan(0);
    expect(gated.history.length).toBe(1);
    store.close();
  });

  test("a targeted read passes even when gated", () => {
    const store = new HubStore(":memory:");
    const file = "/proj/big.mjs";
    store.add({ project: "p", kind: "note", type: "note", title: "seen", narrative: "seen", files: [file] }, { actor: "import" });
    const { text } = bigFile();

    const slice = smartFileRead(store, { project: "p", file, text, enabled: true, offset: 10, limit: 5 });
    expect(slice.gated).toBe(true);
    expect(slice.text).toBe(text.split("\n").slice(10, 15).join("\n"));
    store.close();
  });

  test("a file with no history is not gated and the gate is off by default", () => {
    const store = new HubStore(":memory:");
    const { text } = bigFile();

    const noHistory = smartFileRead(store, { project: "p", file: "/proj/big.mjs", text, enabled: true });
    expect(noHistory.gated).toBe(false);
    expect(noHistory.text).toBe(text);

    store.add({ project: "p", kind: "note", type: "note", title: "seen", narrative: "seen", files: ["/proj/big.mjs"] }, { actor: "import" });
    const defaultOff = smartFileRead(store, { project: "p", file: "/proj/big.mjs", text });
    expect(defaultOff.gated).toBe(false);
    expect(defaultOff.text).toBe(text);
    store.close();
  });

  test("outlineOf and readLines stay deterministic and bounded", () => {
    const text = "# Title\n\nexport function run() {}\n\n## Section\n\nconst x = 1;\n";
    expect(outlineOf(text).map((entry) => entry.text)).toContain("Title");
    expect(outlineOf(text).map((entry) => entry.text)).toContain("run");
    expect(readLines(text, { offset: 1, limit: 2 })).toBe("\nexport function run() {}");
  });
});
