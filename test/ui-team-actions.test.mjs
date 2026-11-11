// The write controls on the Connections tab: team members, shares, the board, leave and the audit; the erasure
// report, apply and verify with a typed confirmation; and the project merge with its dry-run plan. Fake DOM, fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let TT;
let DATA;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 8; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });
const buttonByText = (root, text) => root.querySelectorAll("button").find((b) => b.textContent.trim() === text);
const toasts = () => dom.getElementById("ui-toasts")?.textContent ?? "";
const modalEl = () => dom.documentElement.querySelector(".ui-modal");
const control = (root, label) => root.querySelectorAll("input, select, textarea").find((el) => el.getAttribute("aria-label") === label);
const rowOf = (root, text) => root.querySelectorAll("tr").find((row) => row.textContent.includes(text));

function install(routes) {
  const calls = [];
  globalThis.fetch = async (path, init = {}) => {
    const record = { path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(record);
    for (const [pattern, handler] of routes) if (typeof pattern === "string" ? path.startsWith(pattern) : pattern.test(path)) return handler(record);
    return json({ error: `unrouted ${path}` }, 404);
  };
  return calls;
}
function fakeLocation(start) {
  const loc = { hash: start, history: [start] };
  globalThis.location = loc;
  globalThis.history = { pushState: (_a, _b, hash) => { loc.hash = hash; }, replaceState: (_a, _b, hash) => { loc.hash = hash; } };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  TT ??= await import("../public/tabs/tools-team.js");
  DATA ??= await import("../public/tabs/tools-data.js");
  C.resetUi();
});
afterAll(() => restoreGlobals());

const MEMBERS = [
  { id: 7, name: "Sam", role: "editor", projects: ["shop"], revoked: false },
  { id: 8, name: "Lee", role: "viewer", projects: [], revoked: true },
];
const teamRoutes = (role = "owner", extra = []) => [
  ...extra,
  [/^\/api\/hub\/team\/members\/revoke/, () => json({ id: 7, revoked: true })],
  [/^\/api\/hub\/team\/members/, (r) => (r.method === "POST" ? json({ member: { id: 9, name: "Ana", role: "editor" }, token: "tok_ONLY_SHOWN_ONCE" }, 201) : json({ members: MEMBERS }))],
  [/^\/api\/hub\/team\/shares/, () => json({ ok: true })],
  [/^\/api\/hub\/team\/board/, (r) => (r.method === "POST" ? json({ id: 1 }, 201) : json({ entries: [] }))],
  [/^\/api\/hub\/team\/brief/, () => json({ text: "Brief" })],
  [/^\/api\/hub\/team\/leave/, () => json({ left: true, tombstones: 2 })],
  [/^\/api\/hub\/team\/audit/, () => json({ audit: [{ id: 2, action: "member.revoke", ts: Date.now(), detail: { memberId: 8 } }, { id: 1, action: "team.create", ts: Date.now(), detail: null }] })],
  [/^\/api\/hub\/team$/, () => json({ teams: [{ id: "t1", name: "Core team", role, projects: ["shop", "blog"] }] })],
];
const openTeamView = async (role = "owner", extra = []) => {
  fakeLocation("#/tools/team?team=t1&project=shop");
  const calls = install(teamRoutes(role, extra));
  const view = TT.teamView();
  await flush();
  return { view, calls };
};
const last = (calls, pattern, method) => calls.filter((c) => pattern.test(c.path) && (!method || c.method === method)).at(-1);

describe("team members", () => {
  test("Add a member needs a name, then posts name, role and projects and shows the token once", async () => {
    const { view, calls } = await openTeamView();
    buttonByText(view, "Add a member").click();
    await tick();
    const dialog = modalEl();
    buttonByText(dialog, "Add member").click();
    await flush();
    expect(toasts()).toContain("Type a name first.");
    control(dialog, "Member name").value = "Ana";
    control(dialog, "Role").value = "editor";
    control(dialog, "Projects (comma separated)").value = "shop, blog";
    buttonByText(dialog, "Add member").click();
    await flush();
    expect(last(calls, /team\/members$/, "POST").body).toEqual({ team_id: "t1", name: "Ana", role: "editor", projects: ["shop", "blog"] });
    expect(modalEl().textContent).toContain("tok_ONLY_SHOWN_ONCE");
    expect(modalEl().textContent).toContain("shown once");
  });
  test("Revoke asks first; cancel sends nothing, confirm posts the member id; a revoked row has no Revoke", async () => {
    const { view, calls } = await openTeamView();
    expect(buttonByText(rowOf(view, "Lee"), "Revoke")).toBeUndefined();
    buttonByText(rowOf(view, "Sam"), "Revoke").click();
    await tick();
    expect(modalEl().textContent).toContain("sync token");
    buttonByText(modalEl(), "Cancel").click();
    await flush();
    expect(calls.some((c) => c.path.includes("/members/revoke"))).toBe(false);
    buttonByText(rowOf(view, "Sam"), "Revoke").click();
    await tick();
    buttonByText(modalEl(), "Revoke member").click();
    await flush();
    expect(last(calls, /members\/revoke/).body).toEqual({ team_id: "t1", member_id: 7 });
  });
  test("Change shares posts the member's new project list", async () => {
    const { view, calls } = await openTeamView();
    buttonByText(rowOf(view, "Sam"), "Change shares").click();
    await tick();
    const input = control(modalEl(), "Shared projects (comma separated)");
    expect(input.value).toBe("shop");
    input.value = "shop, blog";
    buttonByText(modalEl(), "Save shares").click();
    await flush();
    expect(last(calls, /team\/shares/).body).toEqual({ team_id: "t1", member_id: 7, projects: ["shop", "blog"] });
  });
  test("a viewer sees the write controls disabled but can still leave", async () => {
    const { view } = await openTeamView("viewer");
    expect(buttonByText(view, "Add a member").disabled).toBe(true);
    expect(buttonByText(view, "Pin a note").disabled).toBe(true);
    expect(buttonByText(view, "Record a decision").disabled).toBe(true);
    expect(buttonByText(view, "Leave this team").disabled).toBeFalsy();
  });
});

describe("team board, leave and audit", () => {
  test("Pin a note and Record a decision post the kind, the project and the text", async () => {
    const { view, calls } = await openTeamView();
    buttonByText(view, "Pin a note").click();
    await tick();
    buttonByText(modalEl(), "Pin note").click();
    await flush();
    expect(toasts()).toContain("Type the text first.");
    control(modalEl(), "Text").value = "Deploys freeze on Friday";
    buttonByText(modalEl(), "Pin note").click();
    await flush();
    expect(last(calls, /team\/board$/, "POST").body).toEqual({ team_id: "t1", project: "shop", kind: "pin", text: "Deploys freeze on Friday" });
    buttonByText(view, "Record a decision").click();
    await tick();
    control(modalEl(), "Text").value = "Use Postgres";
    buttonByText(modalEl(), "Record decision").click();
    await flush();
    expect(last(calls, /team\/board$/, "POST").body).toEqual({ team_id: "t1", project: "shop", kind: "decision", text: "Use Postgres" });
  });
  test("Leave this team says what happens, then posts", async () => {
    const { view, calls } = await openTeamView();
    buttonByText(view, "Leave this team").click();
    await tick();
    expect(modalEl().textContent).toContain("shared entries");
    buttonByText(modalEl(), "Cancel").click();
    await flush();
    expect(calls.some((c) => c.path.includes("/leave"))).toBe(false);
    buttonByText(view, "Leave this team").click();
    await tick();
    buttonByText(modalEl(), "Leave team").click();
    await flush();
    expect(last(calls, /team\/leave/).body).toEqual({ team_id: "t1" });
    expect(toasts()).toContain("You left the team");
  });
  test("Read the audit lists the actions, newest first", async () => {
    const { view, calls } = await openTeamView();
    buttonByText(view, "Read the audit").click();
    await flush();
    expect(last(calls, /team\/audit/).path).toBe("/api/hub/team/audit?team_id=t1&limit=50");
    expect(view.textContent).toContain("member.revoke");
    expect(view.textContent.indexOf("member.revoke")).toBeLessThan(view.textContent.indexOf("team.create"));
  });
  test("an audit the server refuses says so", async () => {
    const { view } = await openTeamView("editor", [[/^\/api\/hub\/team\/audit/, () => json({ error: "Only an owner can read the audit." }, 403)]]);
    buttonByText(view, "Read the audit").click();
    await flush();
    expect(toasts()).toContain("Only an owner can read the audit.");
  });
});

describe("erasure", () => {
  const PLAN = { scope: { project: "demo-blog", ids: [], before: null }, counts: { memories: 3, observations: 2, episodes: 1, facts: 4, summaries: 1, ruleSuggestions: 0 }, ids: { memories: [1, 2, 3], observations: [], episodes: [], facts: [], summaries: [], ruleSuggestions: [] } };
  const RECEIPT = { id: "er-1", signature: "abc", counts: PLAN.counts };
  const routes = (extra = []) => [
    ...extra,
    [/^\/api\/hub\/erasure\/report/, () => json({ plan: PLAN })],
    [/^\/api\/hub\/erasure\/apply/, () => json({ erased: true, plan: PLAN, exportPath: "/data/exports/erase-1.jsonl", receiptPath: "/data/receipts/er-1.json", receipt: RECEIPT })],
    [/^\/api\/hub\/erasure\/verify/, () => json({ ok: true })],
    [/^\/api\/hub\/projects$/, () => json({ projects: [{ name: "demo-shop", memories: 5 }, { name: "demo-blog", memories: 3 }] })],
  ];
  const mount = async (extra = []) => { fakeLocation("#/tools/data"); const calls = install(routes(extra)); const view = DATA.dataView(); await flush(); return { view, calls }; };

  test("a report needs a selector; it posts only what was filled and shows the counts without deleting", async () => {
    const { view, calls } = await mount();
    buttonByText(view, "Preview erasure").click();
    await flush();
    expect(toasts()).toContain("Choose a project, some ids or a date");
    control(view, "Erase: project").value = "demo-blog";
    buttonByText(view, "Preview erasure").click();
    await flush();
    expect(last(calls, /erasure\/report/).body).toEqual({ project: "demo-blog" });
    expect(view.textContent).toContain("Memories");
    expect(view.textContent).toContain("Nothing was deleted");
    expect(calls.some((c) => c.path.includes("/erasure/apply"))).toBe(false);
  });
  test("Erase is locked until a preview found something", async () => {
    const { view } = await mount();
    expect(buttonByText(view, "Erase these rows…").disabled).toBe(true);
    control(view, "Erase: project").value = "demo-blog";
    buttonByText(view, "Preview erasure").click();
    await flush();
    expect(buttonByText(view, "Erase these rows…").disabled).toBeFalsy();
  });
  test("apply needs the word ERASE typed; then it posts the same selector and shows the receipt", async () => {
    const { view, calls } = await mount();
    control(view, "Erase: project").value = "demo-blog";
    buttonByText(view, "Preview erasure").click();
    await flush();
    buttonByText(view, "Erase these rows…").click();
    await tick();
    const dialog = modalEl();
    expect(dialog.textContent).toContain("cannot be undone");
    expect(dialog.textContent).toContain("pre-erase export");
    buttonByText(dialog, "Erase permanently").click();
    await flush();
    expect(calls.some((c) => c.path.includes("/erasure/apply"))).toBe(false);
    expect(toasts()).toContain("Type ERASE");
    control(dialog, "Type ERASE to confirm").value = "erase";
    buttonByText(dialog, "Erase permanently").click();
    await flush();
    expect(calls.some((c) => c.path.includes("/erasure/apply"))).toBe(false);
    control(dialog, "Type ERASE to confirm").value = "ERASE";
    buttonByText(dialog, "Erase permanently").click();
    await flush();
    expect(last(calls, /erasure\/apply/).body).toEqual({ project: "demo-blog" });
    expect(view.textContent).toContain("/data/exports/erase-1.jsonl");
    expect(view.textContent).toContain("/data/receipts/er-1.json");
    expect(toasts()).toContain("Erased");
  });
  test("selectors: ids are split, a date becomes an epoch", async () => {
    const { view, calls } = await mount();
    control(view, "Erase: ids (comma separated)").value = "memory:12, fact:3";
    control(view, "Erase: before (date)").value = "2026-01-01";
    buttonByText(view, "Preview erasure").click();
    await flush();
    expect(last(calls, /erasure\/report/).body).toEqual({ ids: ["memory:12", "fact:3"], before: Date.parse("2026-01-01") });
  });
  test("Nothing matched keeps Erase locked and says so", async () => {
    const empty = { ...PLAN, counts: { memories: 0, observations: 0, episodes: 0, facts: 0, summaries: 0, ruleSuggestions: 0 } };
    const { view } = await mount([[/^\/api\/hub\/erasure\/report/, () => json({ plan: empty })]]);
    control(view, "Erase: project").value = "ghost";
    buttonByText(view, "Preview erasure").click();
    await flush();
    expect(view.textContent).toContain("Nothing matches");
    expect(buttonByText(view, "Erase these rows…").disabled).toBe(true);
  });
  test("Verify takes pasted receipt JSON, rejects bad JSON, and reports ok or the reason", async () => {
    const { view, calls } = await mount();
    buttonByText(view, "Verify receipt").click();
    await flush();
    expect(toasts()).toContain("Paste the receipt JSON first.");
    control(view, "Receipt JSON").value = "{not json";
    buttonByText(view, "Verify receipt").click();
    await flush();
    expect(toasts()).toContain("is not valid JSON");
    control(view, "Receipt JSON").value = JSON.stringify(RECEIPT);
    buttonByText(view, "Verify receipt").click();
    await flush();
    expect(last(calls, /erasure\/verify/).body).toEqual({ receipt: RECEIPT });
    expect(view.textContent).toContain("The receipt is genuine");
    install(routes([[/^\/api\/hub\/erasure\/verify/, () => json({ ok: false, reason: "signature mismatch" }, 400)]]));
    buttonByText(view, "Verify receipt").click();
    await flush();
    expect(view.textContent).toContain("signature mismatch");
  });
});

describe("project merge", () => {
  const PLAN = { from: "demo-blog", into: "demo-shop", moved: 5, dropped: 2, tables: { memories: { moved: 3, dropped: 1 }, facts: { moved: 2, dropped: 1 } } };
  const routes = (extra = []) => [
    ...extra,
    [/^\/api\/hub\/projects\/merge-plan/, () => json(PLAN)],
    [/^\/api\/hub\/projects\/merge$/, () => json(PLAN)],
    [/^\/api\/hub\/projects$/, () => json({ projects: [{ name: "demo-shop", memories: 5 }, { name: "demo-blog", memories: 3 }] })],
  ];
  const mount = async (extra = []) => { fakeLocation("#/tools/data"); const calls = install(routes(extra)); const view = DATA.dataView(); await flush(); return { view, calls }; };

  test("the project lists come from the server", async () => {
    const { view } = await mount();
    expect(control(view, "Merge from").querySelectorAll("option").map((o) => o.value)).toEqual(["demo-shop", "demo-blog"]);
    expect(control(view, "Merge into").querySelectorAll("option").length).toBe(2);
  });
  test("two different projects are required before a plan is asked for", async () => {
    const { view, calls } = await mount();
    control(view, "Merge from").value = "demo-shop";
    control(view, "Merge into").value = "demo-shop";
    buttonByText(view, "Preview merge").click();
    await flush();
    expect(toasts()).toContain("Pick two different projects.");
    expect(calls.some((c) => c.path.includes("merge-plan"))).toBe(false);
  });
  test("the dry-run plan shows per-table counts, writes nothing, and Merge stays locked until then", async () => {
    const { view, calls } = await mount();
    expect(buttonByText(view, "Merge these projects…").disabled).toBe(true);
    control(view, "Merge from").value = "demo-blog";
    control(view, "Merge into").value = "demo-shop";
    buttonByText(view, "Preview merge").click();
    await flush();
    expect(last(calls, /merge-plan/).path).toBe("/api/hub/projects/merge-plan?from=demo-blog&into=demo-shop");
    expect(view.textContent).toContain("5 rows move");
    expect(view.textContent).toContain("2 duplicates are dropped");
    expect(rowOf(view, "memories").textContent).toContain("3");
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/merge"))).toBe(false);
    expect(buttonByText(view, "Merge these projects…").disabled).toBeFalsy();
  });
  test("changing a project after the preview locks Merge again", async () => {
    const { view } = await mount();
    control(view, "Merge from").value = "demo-blog";
    control(view, "Merge into").value = "demo-shop";
    buttonByText(view, "Preview merge").click();
    await flush();
    control(view, "Merge into").dispatch("change");
    expect(buttonByText(view, "Merge these projects…").disabled).toBe(true);
  });
  test("merging needs the source project's name typed, then posts and reloads the lists", async () => {
    const { view, calls } = await mount();
    control(view, "Merge from").value = "demo-blog";
    control(view, "Merge into").value = "demo-shop";
    buttonByText(view, "Preview merge").click();
    await flush();
    buttonByText(view, "Merge these projects…").click();
    await tick();
    const dialog = modalEl();
    expect(dialog.textContent).toContain("cannot be undone");
    control(dialog, "Type the source project name to confirm").value = "wrong";
    buttonByText(dialog, "Merge projects").click();
    await flush();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/merge"))).toBe(false);
    expect(toasts()).toContain("Type demo-blog");
    control(dialog, "Type the source project name to confirm").value = "demo-blog";
    buttonByText(dialog, "Merge projects").click();
    await flush();
    expect(last(calls, /projects\/merge$/, "POST").body).toEqual({ from: "demo-blog", into: "demo-shop" });
    expect(toasts()).toContain("Merged demo-blog into demo-shop");
    expect(calls.filter((c) => c.path === "/api/hub/projects").length).toBeGreaterThan(1);
  });
});
