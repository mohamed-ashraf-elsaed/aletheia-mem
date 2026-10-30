// Secrets and <private> blocks are removed on every write path, not only in hooks: the store redacts in add() and update(),
// so REST, the dashboard, imports and edits are covered too.
import { describe, expect, test } from "bun:test";
import { redact } from "../src/hub/redact.mjs";
import { HubStore } from "../src/hub/store.mjs";

describe("redact: names with prefixes, JSON keys and open tags", () => {
  test("a quoted JSON key keeps valid JSON", () => {
    const out = redact('{"password":"hunter2hunter2","name":"bob"}');
    expect(JSON.parse(out)).toEqual({ password: "[redacted]", name: "bob" });
  });
  test("prefixed names are redacted", () => {
    for (const line of ["MY_API_KEY=abcdef123456", "export DB_PASSWORD=supersecret1", "AUTH_TOKEN: abcdefghij", "client_secret = abcdef123456"]) {
      expect(redact(line)).toContain("[redacted]");
      expect(redact(line)).not.toMatch(/abcdef123456|supersecret1|abcdefghij/);
    }
  });
  test("ordinary numbers named like tokens are left alone", () => {
    expect(redact("max_tokens: 4096")).toBe("max_tokens: 4096");
    expect(redact("tokens: 1234567")).toBe("tokens: 1234567");
  });
  test("an unclosed <private> tag drops the rest of the text", () => {
    expect(redact("before <private>keep out")).toBe("before [private]");
    expect(redact("a <private>x</private> b <private>y")).toBe("a [private] b [private]");
  });
});

describe("HubStore redacts on every write", () => {
  const key = "sk-ant-" + "a".repeat(30);
  test("add() redacts title, narrative and facts, so a REST or dashboard note is clean", () => {
    const store = new HubStore(":memory:");
    const { id } = store.add({ project: "p", title: `note ${key}`, narrative: 'config {"password":"hunter2hunter2"} <private>secret plan</private>', facts: [`key is ${key}`] });
    const row = store.get(id);
    const all = JSON.stringify(row);
    expect(all).not.toContain(key);
    expect(all).not.toContain("hunter2hunter2");
    expect(all).not.toContain("secret plan");
    expect(row.narrative).toContain("[private]");
  });
  test("update() redacts an edit", () => {
    const store = new HubStore(":memory:");
    const { id } = store.add({ project: "p", title: "t", narrative: "n" });
    const row = store.update(id, { narrative: `now with ${key}` });
    expect(row.narrative).not.toContain(key);
  });
  test("importing a bundle redacts what it brings in", () => {
    const store = new HubStore(":memory:");
    const bundle = [JSON.stringify({ type: "manifest", format: "aletheia-bundle", version: 1 }), JSON.stringify({ type: "memory", kind: "note", project: "p", title: "t", narrative: `leak ${key}` })].join("\n");
    store.importBundle(bundle);
    expect(JSON.stringify(store.list?.({ project: "p" }) ?? store.search?.("leak") ?? [])).not.toContain(key);
    const rows = store.db.prepare("SELECT narrative FROM memories").all();
    expect(JSON.stringify(rows)).not.toContain(key);
  });
});

describe("scrubStored", () => {
  const key = "sk-ant-" + "b".repeat(30);
  test("reports rows written before redaction, redacts them on apply, and the secret is gone from search", () => {
    const store = new HubStore(":memory:");
    const { id } = store.add({ project: "p", title: "t", narrative: "placeholder text about deploys" });
    store.db.prepare("UPDATE memories SET narrative = ? WHERE id = ?").run(`deploys use ${key} and {"password":"hunter2hunter2"}`, id);
    store.add({ project: "p", title: "clean", narrative: "nothing secret here" });
    const dry = store.scrubStored();
    expect(dry).toMatchObject({ scanned: 2, changed: 1, applied: false, sampleIds: [id] });
    expect(store.get(id).narrative).toContain(key);
    const done = store.scrubStored({ apply: true });
    expect(done).toMatchObject({ changed: 1, applied: true });
    const row = store.get(id);
    expect(JSON.stringify(row)).not.toContain(key);
    expect(JSON.stringify(row)).not.toContain("hunter2hunter2");
    expect(store.scrubStored().changed).toBe(0);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM memories_fts WHERE memories_fts MATCH ?").get("hunter2hunter2").n).toBe(0);
  });
});
