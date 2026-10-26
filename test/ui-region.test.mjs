// T-155: Region states, the paged list and its URL state, and optimistic actions. Fake DOM, fake location.
import { beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom } from "./support/fake-dom.mjs";

let dom;
let R;
let A;
let C;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { await tick(); await tick(); await tick(); };

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  R ??= await import("../public/ui-region.js");
  A ??= await import("../public/ui-actions.js");
  C.resetUi();
});

const text = (value) => { const el = dom.createElement("div"); el.append(String(value)); return el; };

function fakeEnv(start = "#/memory") {
  const env = { hash: start, history: [start], pops: [], getHash: () => env.hash,
    push(hash) { env.hash = hash; env.history.push(hash); },
    replace(hash) { env.hash = hash; env.history[env.history.length - 1] = hash; },
    onPop(fn) { env.pops.push(fn); return () => {}; },
    back() { env.history.pop(); env.hash = env.history.at(-1); for (const fn of env.pops) fn(); } };
  return env;
}

describe("T-155: Region", () => {
  test("loading shows the skeleton, then the content", async () => {
    let release;
    const r = R.region({ load: () => new Promise((resolve) => { release = resolve; }), render: (data) => text(data.items.join(",")), skeleton: () => C.skeleton({ kind: "card", count: 2 }) });
    expect(r.getAttribute("aria-busy")).toBe("true");
    expect(r.querySelectorAll(".ui-skel-item").length).toBe(2);
    release({ items: ["a", "b"] });
    await flush();
    expect(r.getAttribute("aria-busy")).toBe("false");
    expect(r.textContent).toContain("a,b");
    expect(r.querySelectorAll(".ui-skel-item").length).toBe(0);
    expect(r.dataset.state).toBe("success");
  });
  test("an empty result shows the empty state with its fix", async () => {
    const r = R.region({ load: async () => ({ items: [] }), render: () => text("x"), empty: () => C.emptyState({ title: "No memories", command: "aletheia install claude-code" }) });
    await flush();
    expect(r.dataset.state).toBe("empty");
    expect(r.textContent).toContain("No memories");
    expect(r.textContent).toContain("aletheia install claude-code");
  });
  test("an error shows Retry and Copy details, and Retry loads again", async () => {
    let calls = 0;
    const r = R.region({ load: async () => { calls += 1; if (calls === 1) throw Object.assign(new Error("boom"), { status: 500, path: "/api/x" }); return { items: [1] }; }, render: () => text("ok") });
    await flush();
    expect(r.dataset.state).toBe("error");
    expect(r.textContent).toContain("boom");
    const [retry, copy] = r.querySelectorAll("button");
    expect(retry.textContent).toBe("Retry");
    expect(copy.textContent).toBe("Copy details");
    retry.click();
    await flush();
    expect(calls).toBe(2);
    expect(r.dataset.state).toBe("success");
  });
  test("a soft reload keeps the content and a failed one shows a notice beside it", async () => {
    let fail = false;
    const r = R.region({ load: async () => { if (fail) throw new Error("offline"); return { items: ["kept"] }; }, render: (d) => text(d.items[0]) });
    await flush();
    fail = true;
    r.reload({ soft: true });
    expect(r.getAttribute("aria-busy")).toBe("true");
    expect(r.textContent).toContain("kept");
    await flush();
    expect(r.textContent).toContain("kept");
    expect(r.textContent).toContain("Could not refresh: offline");
    expect(r.dataset.state).toBe("success");
  });
  test("a late answer from an older request is ignored", async () => {
    const resolvers = [];
    const r = R.region({ load: () => new Promise((resolve) => resolvers.push(resolve)), render: (d) => text(d.items[0]) });
    r.reload();
    resolvers[1]({ items: ["new"] });
    await flush();
    resolvers[0]({ items: ["old"] });
    await flush();
    expect(r.textContent).toContain("new");
    expect(r.textContent).not.toContain("old");
  });
  test("the height is held while a new page loads, so nothing jumps", async () => {
    const r = R.region({ load: async () => ({ items: ["a"] }), render: (d) => text(d.items[0]) });
    await flush();
    r.reload();
    expect(r.style.props["min-height"]).toBeUndefined();
    expect(r.getAttribute("aria-busy")).toBe("true");
    await flush();
    expect(r.getAttribute("aria-busy")).toBe("false");
  });
  test("setData repaints without a request", async () => {
    const r = R.region({ load: async () => ({ items: ["a"] }), render: (d) => text(d.items.join()) });
    await flush();
    r.setData({ items: ["z"] });
    expect(r.textContent).toContain("z");
  });
});

describe("T-155: list state in the URL", () => {
  const defaults = { limit: 25, q: "", kind: "" };
  test("read: defaults, values, bad numbers, unknown limits", () => {
    expect(R.readListState("#/memory", defaults)).toEqual({ limit: 25, q: "", kind: "", page: 1 });
    expect(R.readListState("#/memory?page=3&limit=50&q=retry&kind=note", defaults)).toEqual({ limit: 50, q: "retry", kind: "note", page: 3 });
    expect(R.readListState("#/memory?page=-4&limit=7", defaults).page).toBe(1);
    expect(R.readListState("#/memory?limit=7", defaults).limit).toBe(25);
    expect(R.readListState("#/memory?page=abc", defaults).page).toBe(1);
  });
  test("write: defaults are left out, other keys stay, the path stays", () => {
    expect(R.writeListState("#/memory/facts", { limit: 25, q: "", kind: "", page: 1 }, defaults)).toBe("#/memory/facts");
    expect(R.writeListState("#/memory?project=shop", { limit: 50, q: "a b", kind: "", page: 2 }, defaults)).toBe("#/memory?limit=50&page=2&project=shop&q=a+b");
  });
  test("a prefix keeps two lists apart", () => {
    const hash = R.writeListState("#/review", { limit: 10, page: 4 }, { limit: 25 }, "d");
    expect(hash).toBe("#/review?dlimit=10&dpage=4");
    expect(R.readListState(hash, { limit: 25 }, "d")).toEqual({ limit: 10, page: 4 });
    expect(R.readListState(hash, { limit: 25 }, "")).toEqual({ limit: 25, page: 1 });
  });
  test("round trip", () => {
    const state = { limit: 100, q: "x y", kind: "note", page: 7 };
    expect(R.readListState(R.writeListState("#/memory", state, defaults), defaults)).toEqual(state);
  });
});

describe("T-155: paged list", () => {
  const rowsOf = (total) => Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  const makeList = (env, total = 312, extra = {}) => {
    const calls = [];
    const list = R.pagedList({
      defaults: { limit: 25, q: "" },
      env,
      fetchPage: async (params) => { calls.push(params); return { total, items: rowsOf(total).slice(params.offset, params.offset + params.limit) }; },
      renderItem: (item) => text(`row ${item.id}`),
      empty: () => C.emptyState({ title: "Empty" }),
      emptyFiltered: () => C.emptyState({ title: "No match" }),
      skeleton: () => C.skeleton({ kind: "row", count: 3 }),
      ...extra,
    });
    return { list, calls };
  };

  test("the first page loads with an offset of zero and shows the pager", async () => {
    const env = fakeEnv();
    const { list, calls } = makeList(env);
    await flush();
    expect(calls[0]).toMatchObject({ offset: 0, limit: 25, page: 1 });
    expect(list.textContent).toContain("row 1");
    expect(list.textContent).toContain("Showing 1 to 25 of 312");
  });
  test("next page pushes the URL, loads the next slice and Back returns", async () => {
    const env = fakeEnv();
    const { list, calls } = makeList(env);
    await flush();
    list.querySelector(".ui-pager-next").click();
    await flush();
    expect(env.hash).toBe("#/memory?page=2");
    expect(calls.at(-1)).toMatchObject({ offset: 25 });
    expect(list.textContent).toContain("row 26");
    expect(list.textContent).toContain("Showing 26 to 50 of 312");
    env.back();
    await flush();
    expect(list.textContent).toContain("row 1");
    expect(list.state().page).toBe(1);
  });
  test("a reload with the page in the URL starts on that page and size", async () => {
    const env = fakeEnv("#/memory?limit=50&page=3");
    const { calls } = makeList(env);
    await flush();
    expect(calls[0]).toMatchObject({ offset: 100, limit: 50 });
  });
  test("changing the page size goes back to page one", async () => {
    const env = fakeEnv("#/memory?page=4");
    const { list, calls } = makeList(env);
    await flush();
    list.querySelector("select").dispatch("change", { target: { value: "100" } });
    await flush();
    expect(calls.at(-1)).toMatchObject({ offset: 0, limit: 100 });
    expect(env.hash).toBe("#/memory?limit=100");
  });
  test("a filter change resets to page one and an unmatched filter says so", async () => {
    const env = fakeEnv("#/memory?page=3");
    let items = rowsOf(60);
    const list = R.pagedList({
      defaults: { limit: 25, q: "" }, env,
      fetchPage: async (p) => ({ total: p.q ? 0 : 60, items: p.q ? [] : items.slice(p.offset, p.offset + p.limit) }),
      renderItem: (item) => text(`row ${item.id}`), empty: () => C.emptyState({ title: "Empty" }), emptyFiltered: () => C.emptyState({ title: "No match" }),
      skeleton: () => C.skeleton({ kind: "row", count: 1 }),
    });
    await flush();
    list.set({ q: "zzz" });
    await flush();
    expect(env.hash).toBe("#/memory?q=zzz");
    expect(list.textContent).toContain("No match");
  });
  test("a page past the end jumps to the last page", async () => {
    const env = fakeEnv("#/memory?page=99");
    const { list } = makeList(env, 60);
    await flush();
    await flush();
    expect(list.state().page).toBe(3);
    expect(list.textContent).toContain("row 51");
  });
  test("a small list shows no pager", async () => {
    const env = fakeEnv();
    const { list } = makeList(env, 7);
    await flush();
    expect(list.querySelector(".ui-pager")).toBeNull();
  });
  test("an empty store shows the plain empty state", async () => {
    const env = fakeEnv();
    const { list } = makeList(env, 0);
    await flush();
    expect(list.textContent).toContain("Empty");
  });
  test("the search text reaches the row renderer for highlighting", async () => {
    const env = fakeEnv("#/memory?q=retry");
    const seen = [];
    R.pagedList({ defaults: { limit: 25, q: "" }, env, fetchPage: async () => ({ total: 1, items: [{ id: 1 }] }), renderItem: (item, ctx) => { seen.push(ctx.query); return text("x"); }, empty: () => text("e"), skeleton: () => text("s") });
    await flush();
    expect(seen).toEqual(["retry"]);
  });
  test("a failing page shows the error and Retry works", async () => {
    const env = fakeEnv();
    let fail = true;
    const list = R.pagedList({ defaults: { limit: 25 }, env, fetchPage: async () => { if (fail) throw new Error("db locked"); return { total: 1, items: [{ id: 1 }] }; }, renderItem: () => text("row"), empty: () => text("e"), skeleton: () => text("s") });
    await flush();
    expect(list.textContent).toContain("db locked");
    fail = false;
    list.querySelector("button").click();
    await flush();
    expect(list.textContent).toContain("row");
  });
});

describe("T-155: optimistic actions", () => {
  const toastText = () => dom.getElementById("ui-toasts")?.textContent ?? "";
  test("apply first, then the request, then an Undo toast", async () => {
    const order = [];
    const ok = await A.optimistic({ apply: () => order.push("apply"), request: async () => { order.push("request"); }, rollback: () => order.push("rollback"), done: "Hidden", undo: async () => order.push("undo") });
    expect(ok).toBe(true);
    expect(order).toEqual(["apply", "request"]);
    expect(toastText()).toContain("Hidden");
    dom.getElementById("ui-toasts").querySelectorAll("button").find((b) => b.textContent.includes("Undo")).click();
    await flush();
    expect(order).toEqual(["apply", "request", "undo", "rollback"]);
  });
  test("a failed request rolls back and says why", async () => {
    const order = [];
    const ok = await A.optimistic({ apply: () => order.push("apply"), request: async () => { throw new Error("locked"); }, rollback: () => order.push("rollback"), done: "Hidden", undo: async () => {} });
    expect(ok).toBe(false);
    expect(order).toEqual(["apply", "rollback"]);
    expect(toastText()).toContain("locked");
    expect(toastText()).not.toContain("Hidden");
  });
  test("a failed undo is reported and the screen is left alone", async () => {
    const order = [];
    await A.optimistic({ apply: () => {}, request: async () => {}, rollback: () => order.push("rollback"), done: "Done", undo: async () => { throw new Error("gone"); } });
    dom.getElementById("ui-toasts").querySelectorAll("button").find((b) => b.textContent.includes("Undo")).click();
    await flush();
    expect(order).toEqual([]);
    expect(toastText()).toContain("Could not undo");
  });
  test("the undo toast lasts eight seconds", () => {
    expect(A.UNDO_MS).toBe(8000);
  });
  test("reapply replaces rollback after a successful undo", async () => {
    const order = [];
    await A.optimistic({ apply: () => {}, request: async () => {}, rollback: () => order.push("rollback"), reapply: () => order.push("reload"), done: "Done", undo: async () => {} });
    dom.getElementById("ui-toasts").querySelectorAll("button").find((b) => b.textContent.includes("Undo")).click();
    await flush();
    expect(order).toEqual(["reload"]);
  });
  test("a long task shows an indeterminate bar, then the counts", async () => {
    const holder = dom.createElement("div");
    let release;
    const pending = A.withProgress(holder, { label: "Importing", task: () => new Promise((resolve) => { release = resolve; }), summarize: (r) => `${r.added} added` });
    expect(holder.querySelector(".ui-progress").classList.contains("is-indeterminate")).toBe(true);
    release({ added: 12 });
    await pending;
    expect(holder.textContent).toContain("12 added");
    expect(holder.querySelector(".ui-progress").getAttribute("aria-valuenow")).toBe("1");
  });
  test("a failing long task shows the failure and rethrows", async () => {
    const holder = dom.createElement("div");
    await expect(A.withProgress(holder, { label: "Export", task: async () => { throw new Error("disk full"); } })).rejects.toThrow("disk full");
    expect(holder.textContent).toContain("Failed: disk full");
  });
});
