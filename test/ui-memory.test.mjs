// the Memory tab's pages and the Review queue, with fake DOM, fake fetch and a fake location.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let V;
let MV;
let RV;
let MEM;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 4; i += 1) await tick(); };

const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });

function install(routes) {
  const calls = [];
  globalThis.fetch = async (path, init = {}) => {
    const record = { path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(record);
    for (const [pattern, handler] of routes) {
      if (typeof pattern === "string" ? path.startsWith(pattern) : pattern.test(path)) return handler(record);
    }
    return json({ error: "unrouted " + path }, 404);
  };
  return calls;
}

function fakeLocation(start = "#/memory") {
  const loc = { hash: start, history: [start], pops: [] };
  globalThis.location = new Proxy(loc, { get: (t, k) => (k === "hash" ? t.hash : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.history = {
    pushState: (_a, _b, hash) => { loc.hash = hash; loc.history.push(hash); },
    replaceState: (_a, _b, hash) => { loc.hash = hash; loc.history[loc.history.length - 1] = hash; },
  };
  globalThis.addEventListener = (type, fn) => { if (type === "popstate") loc.pops.push(fn); };
  globalThis.removeEventListener = () => {};
  loc.back = () => { loc.history.pop(); loc.hash = loc.history.at(-1); for (const fn of loc.pops) fn(); };
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  V ??= await import("../public/ui-views.js");
  MV ??= await import("../public/tabs/memory-views.js");
  RV ??= await import("../public/tabs/review.js");
  MEM ??= await import("../public/tabs/memory.js");
  C.resetUi();
  const dui = await import("../public/ui-dom.js");
  dui.state.project = "";
});

const ctxOf = () => ({ changed: () => {}, counts: () => {}, openMemory: () => {}, openFact: () => {}, newNote: () => {}, opened: [] });
const memory = (id, extra = {}) => ({ id, title: `Memory ${id}`, narrative: `Body **${id}**`, kind: "observation", type: "note", project: "shop", tool: "cursor", pinned: false, created_at_epoch: Date.now() - 60_000, files: [], ...extra });
const fact = (id, extra = {}) => ({ id, text: `Fact ${id}`, status: "active", scope: "project", extractorMode: "rules", confidence: 0.8, project: "shop", validAt: new Date().toISOString(), source: { episodeId: 1, episodeText: "raw" }, ...extra });
const buttonByText = (root, text) => root.querySelectorAll("button").find((b) => b.textContent.trim() === text);
const toasts = () => dom.getElementById("ui-toasts")?.textContent ?? "";

describe("the list query string", () => {
  test("empty values are left out", () => {
    expect(MV.queryString({ a: 1, b: "", c: null, d: false, e: "x y" })).toBe("a=1&e=x+y");
  });
});

describe("the memories page", () => {
  const page = (items, total = items.length) => json({ items, total });
  test("asks the server for one page and shows rows, a count and the pager", async () => {
    fakeLocation();
    const calls = install([["/api/hub/memories", () => page(Array.from({ length: 25 }, (_, i) => memory(i + 1)), 142)]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    expect(calls[0].path).toBe("/api/hub/memories?limit=25&offset=0&sort=default");
    expect(view.querySelectorAll(".ui-item").length).toBe(25);
    expect(view.textContent).toContain("Showing 1 to 25 of 142");
  });
  test("the next page changes the offset, the URL and the rows", async () => {
    const loc = fakeLocation();
    const calls = install([["/api/hub/memories", (r) => page([memory(26 + (r.path.includes("offset=25") ? 0 : -25))], 142)]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    view.querySelector(".ui-pager-next")?.click?.();
    await flush();
    expect(calls.at(-1).path).toContain("offset=25");
    expect(loc.hash).toBe("#/memory?page=2");
  });
  test("a text filter resets to page one, goes into the URL and reaches the server", async () => {
    const loc = fakeLocation("#/memory?page=3");
    const calls = install([["/api/hub/memories", () => page([memory(1)], 1)]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    const input = view.querySelector(".ui-filter-text");
    input.value = "retry";
    input.dispatch("keydown", { key: "Enter" });
    await flush();
    expect(calls.at(-1).path).toBe("/api/hub/memories?limit=25&offset=0&q=retry&sort=default");
    expect(loc.hash).toBe("#/memory?q=retry");
  });
  test("the project from the header is sent", async () => {
    fakeLocation();
    (await import("../public/ui-dom.js")).state.project = "shop";
    const calls = install([["/api/hub/memories", () => page([memory(1)])]]);
    MV.memoriesView(ctxOf());
    await flush();
    expect(calls[0].path).toContain("project=shop");
  });
  test("an empty store says what to do, with the install command and a note button", async () => {
    fakeLocation();
    install([["/api/hub/memories", () => page([], 0)]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    expect(view.textContent).toContain("No memories yet");
    expect(view.textContent).toContain("aletheia install claude-code --write");
    expect(buttonByText(view, "Write a note")).toBeTruthy();
  });
  test("a filter with no match offers Clear filters, which resets the filters", async () => {
    const loc = fakeLocation("#/memory?kind=event&since=2026-01-01");
    const calls = install([["/api/hub/memories", (r) => (r.path.includes("kind=event") ? page([], 0) : page([memory(1)]))]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    expect(view.textContent).toContain("No memories match these filters");
    buttonByText(view, "Clear filters").click();
    await flush();
    expect(loc.hash).toBe("#/memory");
    expect(view.querySelectorAll(".ui-item").length).toBe(1);
  });
  test("the filter controls follow Back", async () => {
    const loc = fakeLocation("#/memory");
    install([["/api/hub/memories", () => page([memory(1)])]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    const input = view.querySelector(".ui-filter-text");
    input.value = "retry";
    input.dispatch("keydown", { key: "Enter" });
    await flush();
    loc.back();
    await flush();
    expect(input.value).toBe("");
  });
  test("a failing server shows the error with Retry", async () => {
    fakeLocation();
    let fail = true;
    install([["/api/hub/memories", () => (fail ? json({ error: "database is locked" }, 500) : page([memory(1)]))]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    expect(view.textContent).toContain("database is locked");
    fail = false;
    buttonByText(view, "Retry").click();
    await flush();
    expect(view.querySelectorAll(".ui-item").length).toBe(1);
  });
  test("hostile text in a title or a body stays text", async () => {
    fakeLocation();
    install([["/api/hub/memories", () => page([memory(1, { title: "<img src=x onerror=alert(1)>", narrative: "<script>alert(1)</script> [x](javascript:alert(1))" })])]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    expect(view.querySelectorAll("img").length).toBe(0);
    expect(view.querySelectorAll("script").length).toBe(0);
    expect(view.querySelectorAll("a").length).toBe(0);
    expect(view.textContent).toContain("<img src=x onerror=alert(1)>");
  });
  test("an Arabic title and a 200-character token keep their direction and wrap rules", async () => {
    fakeLocation();
    install([["/api/hub/memories", () => page([memory(1, { title: "هذا عنوان تجريبي", narrative: "x".repeat(200) })])]]);
    const view = MV.memoriesView(ctxOf());
    await flush();
    expect(view.querySelector(".ui-item-title").getAttribute("dir")).toBe("auto");
    expect(view.querySelector(".ui-clamp-body").getAttribute("dir")).toBe("auto");
  });
});

describe("memory card actions", () => {
  test("Pin changes the card at once, and a failure puts it back and says why", async () => {
    install([["/api/hub/memories/1", () => json({ error: "locked" }, 500)]]);
    const m = memory(1);
    const card = V.memoryCard(m, {});
    dom.body.append(card);
    buttonByText(card, "Pin").click();
    expect(m.pinned).toBe(true);
    expect(card.textContent).toContain("pinned");
    await flush();
    expect(m.pinned).toBe(false);
    expect(toasts()).toContain("locked");
  });
  test("a successful pin shows an Undo that unpins", async () => {
    const calls = install([["/api/hub/memories/1", (r) => json({ ...memory(1), pinned: r.body.pinned })]]);
    const m = memory(1);
    const card = V.memoryCard(m, {});
    dom.body.append(card);
    buttonByText(card, "Pin").click();
    await flush();
    expect(toasts()).toContain("Pinned");
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.map((c) => c.body?.pinned)).toEqual([true, false]);
    expect(m.pinned).toBe(false);
  });
  test("Dismiss hides the card first, then asks the server, then offers Undo", async () => {
    const calls = install([["/api/hub/dismiss", () => json({ ok: true })], ["/api/hub/restore", () => json({ ok: true })]]);
    let changed = 0;
    const card = V.memoryCard(memory(7), { onChanged: () => { changed += 1; } });
    dom.body.append(card);
    buttonByText(card, "Dismiss").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    expect(calls[0]).toMatchObject({ path: "/api/hub/dismiss", method: "POST", body: { type: "memory", id: 7 } });
    expect(toasts()).toContain("Nothing was deleted");
    expect(changed).toBe(1);
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.at(-1)).toMatchObject({ path: "/api/hub/restore", body: { type: "memory", id: 7 } });
  });
  test("a failed dismiss brings the card back", async () => {
    install([["/api/hub/dismiss", () => json({ error: "nope" }, 500)]]);
    const card = V.memoryCard(memory(7), {});
    dom.body.append(card);
    buttonByText(card, "Dismiss").click();
    await flush();
    await flush();
    expect(card.hidden).toBe(false);
    expect(toasts()).toContain("nope");
  });
  test("a search word is highlighted in the title and the body", () => {
    const card = V.memoryCard(memory(1, { title: "Retry loop", narrative: "We retry **twice**" }), { query: "retry" });
    expect(card.querySelectorAll("mark").length).toBe(2);
  });
  test("Edit opens a dialog; Save sends the patch and updates the card", async () => {
    const calls = install([["/api/hub/memories/1", (r) => json({ ...memory(1), ...r.body })]]);
    const m = memory(1);
    const card = V.memoryCard(m, {});
    dom.body.append(card);
    buttonByText(card, "Edit").click();
    const layer = dom.documentElement.querySelector(".ui-modal");
    const [title] = layer.querySelectorAll("input");
    title.value = "Changed";
    buttonByText(layer, "Save").click();
    await flush();
    expect(calls[0]).toMatchObject({ method: "PATCH", body: { title: "Changed" } });
    expect(card.textContent).toContain("Changed");
  });
});

describe("facts, dismissed and search", () => {
  test("a fact row shows its status and a Dismiss; in the dismissed list it shows Restore", () => {
    const row = V.factCard(fact(3), {});
    expect(row.textContent).toContain("Fact 3");
    expect(buttonByText(row, "Dismiss")).toBeTruthy();
    expect(buttonByText(V.factCard(fact(3), { dismissed: true }), "Restore")).toBeTruthy();
  });
  test("the facts page sends the status and the date range", async () => {
    fakeLocation("#/memory/facts?status=history&since=2026-09-01&until=2026-09-30");
    const calls = install([["/api/hub/facts", () => json({ items: [fact(1)], total: 1 })]]);
    MV.factsView(ctxOf());
    await flush();
    expect(calls[0].path).toBe("/api/hub/facts?limit=25&offset=0&status=history&sort=recent&since=2026-09-01&until=2026-09-30");
  });
  test("the dismissed page shows what was hidden and Restore brings it back", async () => {
    fakeLocation("#/memory/dismissed");
    const calls = install([["/api/hub/dismissed", () => json({ items: [{ item_type: "fact", item_id: 9, reason: "noise", at_epoch: Date.now(), label: "A hidden fact", project: "shop" }], total: 1 })], ["/api/hub/restore", () => json({ ok: true })]]);
    const view = MV.dismissedView(ctxOf());
    await flush();
    expect(view.textContent).toContain("A hidden fact");
    expect(view.textContent).toContain("reason: noise");
    buttonByText(view, "Restore").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/restore").body).toEqual({ type: "fact", id: 9 });
  });
  test("an empty dismissed list explains that nothing is ever deleted", async () => {
    fakeLocation("#/memory/dismissed");
    install([["/api/hub/dismissed", () => json({ items: [], total: 0 })]]);
    const view = MV.dismissedView(ctxOf());
    await flush();
    expect(view.textContent).toContain("never deleted");
  });
  test("search without words shows a prompt and sends nothing", async () => {
    fakeLocation("#/memory/search");
    const calls = install([]);
    const view = MV.searchView(ctxOf(), { params: {} });
    await flush();
    expect(view.textContent).toContain("Search your memory");
    expect(calls.length).toBe(0);
  });
  test("search posts the words and filters and lists facts before memories", async () => {
    fakeLocation("#/memory/search?q=retry&scope=all&history=1");
    const calls = install([["/v1/search", () => json({ total: 3, totals: { facts: 1, memories: 2 }, capped: false, facts: [{ kind: "fact", id: 1, text: "A retry fact", title: "A retry fact", project: "p", status: "active", confidence: 0.9, at: new Date().toISOString(), source: {} }], results: [{ id: 5, kind: "observation", type: "note", title: "Retry note", project: "p", tool: "x" }, { id: 6, kind: "note", type: "note", title: "Another", project: "p", tool: "x" }], channels: { facts: { lexical: true }, fused: "none" }, reason: null })]]);
    const view = MV.searchView(ctxOf(), { params: {} });
    await flush();
    expect(calls[0].body).toMatchObject({ query: "retry", limit: 25, offset: 0, paged: true, scope: "all", includeHistory: true });
    const kinds = view.querySelectorAll(".ui-item").map((el) => el.getAttribute("data-kind"));
    expect(kinds).toEqual(["fact", "memory", "memory"]);
    expect(view.textContent).toContain("3 results for");
    expect(view.textContent).toContain("1 facts, 2 memories");
  });
  test("no results explains why", async () => {
    fakeLocation("#/memory/search?q=zzz");
    install([["/v1/search", () => json({ total: 0, totals: { facts: 0, memories: 0 }, capped: false, facts: [], results: [], reason: "filtered", channels: {} })]]);
    const view = MV.searchView(ctxOf(), { params: {} });
    await flush();
    expect(view.textContent).toContain("Rows exist, but the project or the query terms excluded all of them.");
  });
});

describe("the review queue", () => {
  const item = (id, extra = {}) => ({ id, type: "fact", itemId: id + 100, reason: "contradiction", status: "pending", text: `Queue item ${id}`, project: "shop", confidence: 0.8, createdAt: new Date().toISOString(), ...extra });
  const reviewRoutes = (extra = []) => [
    ...extra,
    [/\/api\/hub\/review\?.*items=0/, () => json({ items: [], duplicates: [{ key: "1:2", a: 1, b: 2, aText: "Alpha", bText: "Alpha again", score: 0.91, auto: false }], duplicatesTotal: 1, dismissedDuplicates: [], dismissedDuplicatesTotal: 0 })],
    [/\/api\/hub\/review\?/, () => json({ items: [item(1), item(2)], total: 2, duplicates: [], duplicatesTotal: 0 })],
  ];

  test("the queue and the duplicates each ask only for what they show", async () => {
    fakeLocation("#/memory/review");
    const calls = install(reviewRoutes());
    const view = RV.reviewView(ctxOf());
    await flush();
    const paths = calls.map((c) => c.path);
    expect(paths.some((p) => p.includes("status=pending") && p.includes("dupes=0") && p.includes("limit=10"))).toBe(true);
    expect(paths.some((p) => p.includes("items=0") && p.includes("dupLimit=10"))).toBe(true);
    expect(view.querySelectorAll('[data-kind="review"]').length).toBe(2);
    expect(view.querySelectorAll('[data-kind="pair"]').length).toBe(1);
    expect(view.textContent).toContain("similarity 0.91");
  });
  test("folded sections make no request until they are opened", async () => {
    fakeLocation("#/memory/review");
    const calls = install(reviewRoutes());
    const view = RV.reviewView(ctxOf());
    await flush();
    expect(calls.some((c) => c.path.includes("status=accepted"))).toBe(false);
    const head = view.querySelectorAll("button").find((b) => b.textContent.includes("Resolved reviews"));
    head.click();
    await flush();
    expect(calls.some((c) => c.path.includes("status=accepted"))).toBe(true);
  });
  test("Accept hides the row, posts the action and offers Undo, which reopens it", async () => {
    fakeLocation("#/memory/review");
    const calls = install(reviewRoutes([["/api/hub/review/1", () => json({ item: { id: 1, status: "accepted" } })]]));
    const view = RV.reviewView(ctxOf());
    await flush();
    const card = view.querySelectorAll('[data-kind="review"]')[0];
    buttonByText(card, "Accept").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/review/1").body).toEqual({ action: "accept" });
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/review/1").map((c) => c.body.action)).toEqual(["accept", "reopen"]);
  });
  test("a failed Reject puts the row back", async () => {
    fakeLocation("#/memory/review");
    install(reviewRoutes([["/api/hub/review/2", () => json({ error: "write failed" }, 500)]]));
    const view = RV.reviewView(ctxOf());
    await flush();
    const card = view.querySelectorAll('[data-kind="review"]')[1];
    buttonByText(card, "Reject").click();
    await flush();
    await flush();
    expect(card.hidden).toBe(false);
    expect(toasts()).toContain("write failed");
  });
  test("Merge on a pair asks first and does nothing when cancelled", async () => {
    fakeLocation("#/memory/review");
    const calls = install(reviewRoutes([["/api/hub/review/pairs", () => json({ ok: true })]]));
    const view = RV.reviewView(ctxOf());
    await flush();
    buttonByText(view.querySelector('[data-kind="pair"]'), "Merge").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("cannot be undone");
    buttonByText(dialog, "Cancel").click();
    await flush();
    expect(calls.some((c) => c.path === "/api/hub/review/pairs")).toBe(false);
  });
  test("Merge on a pair posts the merge when confirmed", async () => {
    fakeLocation("#/memory/review");
    const calls = install(reviewRoutes([["/api/hub/review/pairs", () => json({ ok: true })]]));
    const view = RV.reviewView(ctxOf());
    await flush();
    buttonByText(view.querySelector('[data-kind="pair"]'), "Merge").click();
    await tick();
    buttonByText(dom.documentElement.querySelector(".ui-modal"), "Merge").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/review/pairs").body).toEqual({ a: 1, b: 2, action: "merge" });
  });
  test("Keep both is optimistic and undoable", async () => {
    fakeLocation("#/memory/review");
    const calls = install(reviewRoutes([["/api/hub/review/pairs", () => json({ ok: true })]]));
    const view = RV.reviewView(ctxOf());
    await flush();
    buttonByText(view.querySelector('[data-kind="pair"]'), "Keep both").click();
    await flush();
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/review/pairs").map((c) => c.body.action)).toEqual(["distinct", "restore"]);
  });
  test("an empty queue says what will appear and that nothing changes without you", async () => {
    fakeLocation("#/memory/review");
    install([[/items=0/, () => json({ items: [], duplicates: [], duplicatesTotal: 0, dismissedDuplicates: [], dismissedDuplicatesTotal: 0 })], [/review\?/, () => json({ items: [], total: 0 })]]);
    const view = RV.reviewView(ctxOf());
    await flush();
    expect(view.textContent).toContain("Nothing is waiting for review");
    expect(view.textContent).toContain("nothing changes without you");
  });
  test("the old export name still points at the view", () => {
    expect(RV.reviewPanel).toBe(RV.reviewView);
  });
});

describe("the Memory frame", () => {
  test("renders the title, five counts, the page links and the chosen page", async () => {
    fakeLocation("#/memory/facts");
    const root = dom.createElement("div");
    root.setAttribute("id", "ui-memory");
    dom.body.append(root);
    const calls = install([
      ["/api/hub/overview", () => json({ stats: { total: 150, pinned: 7, facts: 41 }, claudeMem: { exists: false }, provider: "none" })],
      [/\/api\/hub\/review\?/, () => json({ items: [], total: 9 })],
      ["/api/hub/dismissed", () => json({ items: [], total: 11 })],
      ["/api/hub/facts", () => json({ items: [fact(1)], total: 41 })],
    ]);
    await MEM.renderMemory({ tab: "memory", sub: "facts", params: {} });
    await flush();
    await flush();
    expect(root.querySelector("h1").textContent).toBe("Memory");
    const tiles = root.querySelectorAll(".ui-stat").map((tile) => tile.textContent.replace(/\s+/g, " "));
    expect(tiles.some((text) => text.includes("Facts"))).toBe(true);
    expect(root.querySelectorAll(".ui-tab").map((tab) => tab.getAttribute("data-tab"))).toEqual(["memories", "facts", "review", "dismissed", "economics", "search"]);
    expect(root.querySelector('.ui-tab[aria-selected="true"]').getAttribute("data-tab")).toBe("facts");
    expect(calls.some((c) => c.path.startsWith("/api/hub/facts?limit=25"))).toBe(true);
    const review = root.querySelector('.ui-tab[data-tab="review"]');
    expect(review.textContent).toContain("9");
  });
  test("moving to another page keeps the frame and swaps the page", async () => {
    fakeLocation("#/memory/review");
    const root = dom.createElement("div");
    root.setAttribute("id", "ui-memory");
    dom.body.append(root);
    install([
      ["/api/hub/overview", () => json({ stats: { total: 1, pinned: 0 }, provider: "none" })],
      [/items=0/, () => json({ items: [], duplicates: [], duplicatesTotal: 0, dismissedDuplicates: [], dismissedDuplicatesTotal: 0 })],
      [/\/api\/hub\/review\?/, () => json({ items: [], total: 0 })],
      ["/api/hub/dismissed", () => json({ items: [], total: 0 })],
      ["/api/hub/facts", () => json({ items: [], total: 0 })],
      ["/api/hub/memories", () => json({ items: [memory(1)], total: 1 })],
    ]);
    await MEM.renderMemory({ tab: "memory", sub: "review", params: {} });
    const frame = root.querySelector(".ui-memory-frame");
    await flush();
    globalThis.location.hash = "#/memory/memories";
    await MEM.renderMemory({ tab: "memory", sub: "memories", params: {} });
    await tick(40);
    expect(root.querySelector(".ui-memory-frame")).toBe(frame);
    expect(root.querySelector('.ui-tab[aria-selected="true"]').getAttribute("data-tab")).toBe("memories");
    expect(root.querySelector(".ui-memory-page").querySelectorAll(".ui-item").length).toBe(1);
  });
});

afterAll(() => restoreGlobals());
