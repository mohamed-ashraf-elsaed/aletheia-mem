import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { productFromToolUse } from "../src/readmodel/work-product.mjs";
import { isHumanActionRequest, requestText, titleFromRequest } from "../src/readmodel/text.mjs";
import { foldWorkState } from "../src/readmodel/work-state.mjs";
import { SourceReader } from "../src/source.mjs";
import { OverlayStore } from "../src/store/overlay.mjs";
import { contentFingerprint } from "../src/store/reviews.mjs";
import { makeFixture } from "./fixture.mjs";

function reader(fx, { bugCompatible = false } = {}) {
  return new SourceReader({ databasePath: fx.dbPath, ledgerDir: fx.makeDir("ledger"), overlay: new OverlayStore(":memory:"), bugCompatible });
}

describe("text rules", () => {
  test("a greeting is not a request, an ask is", () => {
    expect(isHumanActionRequest("thanks!")).toBe(false);
    expect(isHumanActionRequest("continue")).toBe(false);
    expect(isHumanActionRequest("Fix the checkout bug")).toBe(true);
    expect(isHumanActionRequest("<system-reminder>be terse</system-reminder>")).toBe(false);
    expect(isHumanActionRequest("GOAL: ship it")).toBe(true);
  });
  test("scaffolding is stripped from the request text", () => {
    expect(requestText("<system-reminder>x</system-reminder> add a button")).toBe("add a button");
    expect(requestText("# My request:\nadd a button")).toBe("add a button");
    expect(requestText("# Files mentioned by the user:\nfoo.txt")).toBeNull();
  });
  test("a title is the first sentence, at most 100 characters", () => {
    expect(titleFromRequest("Add a button. Then style it.")).toBe("Add a button.");
    expect(titleFromRequest("GOAL: ship the thing\nmore text")).toBe("ship the thing");
    expect(titleFromRequest("x ".repeat(80)).length).toBeLessThanOrEqual(100);
  });
});

describe("work state fold", () => {
  const entry = (id, fields, at = id) => ({ id, project: "P", list_name: "L", fields, created_at_epoch: at });
  test("task fields accumulate and null deletes", () => {
    const state = foldWorkState([entry(1, { task: "t", status: "doing", note: "a" }), entry(2, { task: "t", note: null })]);
    const task = state.lists[0].tasks[0];
    expect(task.fields).toEqual({ task: "t", status: "doing" });
    expect(task.isOpen).toBe(true);
    expect(state.events[0].changes).toEqual([{ field: "note", previous: "a", value: null, hadPrevious: true }]);
  });
  test("done closes a task and the list stops being open", () => {
    const state = foldWorkState([entry(1, { task: "t", status: "done" })]);
    expect(state.lists[0].isOpen).toBe(false);
    expect(state.summary).toMatchObject({ tasks: 1, done: 1, openTasks: 0 });
  });
  test("list state without a task lives on the list", () => {
    const state = foldWorkState([entry(1, { owner: "me" })]);
    expect(state.lists[0].fields).toEqual({ owner: "me" });
    expect(state.lists[0].stateUpdatedAtEpoch).toBe(1);
  });
});

describe("work product from recorded Bash calls", () => {
  const call = (command, response) => ({ id: 1, tool_name: "Bash", tool_input: JSON.stringify({ command }), tool_response: response, created_at_epoch: 5 });
  test("commit, branch and repo from commit then push output", () => {
    const commit = productFromToolUse(call('git commit -m "fix: thing"', "[main abc1234] fix: thing\n 1 file changed"));
    expect(commit.find((p) => p.kind === "commit")).toMatchObject({ sha: "abc1234", branch: "main", title: "abc1234 fix: thing" });
    const push = productFromToolUse(call("git push origin feat/x", "To https://github.com/acme/shop.git\n * [new branch]      feat/x -> feat/x"));
    expect(push.find((p) => p.kind === "branch")).toMatchObject({ branch: "feat/x", repo: "acme/shop", url: "https://github.com/acme/shop/tree/feat/x" });
  });
  test("gh pr create yields a pull request", () => {
    const [pr] = productFromToolUse(call('gh pr create --title "Add x" --body y', "https://github.com/acme/shop/pull/9"));
    expect(pr).toMatchObject({ kind: "pull-request", title: "Add x", url: "https://github.com/acme/shop/pull/9" });
  });
  test("git hides the user in ssh remotes, so the repo is unknown (same as the original)", () => {
    const push = productFromToolUse(call("git push origin feat/x", "To github.com:acme/shop.git\n * [new branch]      feat/x -> feat/x"));
    expect(push.find((p) => p.kind === "branch")).toMatchObject({ branch: "feat/x", repo: null });
    const withUser = productFromToolUse(call("git push origin feat/x", "To git@github.com:acme/shop.git\n * [new branch]      feat/x -> feat/x"));
    expect(withUser.find((p) => p.kind === "branch").repo).toBe("acme/shop");
  });
  test("a failed push produces no branch", () => {
    expect(productFromToolUse(call("git push origin x", "! [rejected] x -> x\nfatal: nope")).filter((p) => p.kind === "branch")).toEqual([]);
  });
});

describe("projection on the fixture database", () => {
  const fx = makeFixture();
  const snapshot = reader(fx).read();
  const view = snapshot.agentView;

  test("connected and read-only", () => {
    expect(snapshot.source.connected).toBe(true);
    expect(snapshot.source.mode).toBe("read-only-sqlite");
  });
  test("one card per human request, newest first", () => {
    const titles = view.humanRequests.map((r) => r.title);
    expect(titles).toContain("Build a retry button on the checkout page so failed payments can be retried");
    expect(titles).toContain("Rewrite the onboarding guide so a new hire can finish setup alone");
    expect(view.humanRequests.map((r) => r.updatedAtEpoch)).toEqual([...view.humanRequests.map((r) => r.updatedAtEpoch)].sort((a, b) => b - a));
  });
  test("later asks in a session are scope updates, not new cards", () => {
    const card = view.humanRequests.find((r) => r.original.text.startsWith("Build a retry button"));
    expect(card.scopeUpdates.map((u) => u.text)).toContain("also make sure the button is disabled while a retry is in flight");
  });
  test("commit, branch and PR attach to the request of their session", () => {
    const card = view.humanRequests.find((r) => r.original.text.startsWith("Build a retry button"));
    const kinds = card.workProduct.map((p) => p.kind).sort();
    expect(kinds).toEqual(["branch", "commit", "pull-request"]);
    expect(card.workProduct.find((p) => p.kind === "pull-request").url).toBe("https://github.com/acme/shop/pull/42");
  });
  test("a subagent is its own agent with its launch as the request", () => {
    const sub = view.agents.find((a) => a.isSubagent);
    expect(sub).toBeTruthy();
    expect(sub.agentId).toBe("agent-1");
    expect(sub.launch.description).toBe("Write RetryButton tests");
    expect(sub.canMarkFinished).toBe(true);
    expect(sub.work[0].request.text).toBe("Write RetryButton tests");
  });
  test("explicit request ids group work-state items under one request", () => {
    const card = view.humanRequests.find((r) => r.explicitRequestId === "REQ-7");
    expect(card).toBeTruthy();
    expect(card.items.length).toBe(1);
    expect(card.lifecycle).toBeNull();
    expect(card.afterShip.resources[0].url).toBe("https://example.com/docs/onboarding");
  });
  test("goals come from the owner-goals list", () => {
    expect(view.goals.summary).toBe("Ship checkout reliability.");
    expect(view.goals.priorities.map((g) => g.title)).toEqual(["Reliable checkout"]);
    expect(view.goals.priorities[0].evidence).toEqual([{ at: "2026-10-25 09:00", quote: "make checkout reliable" }]);
  });
  test("observations are read even though the table has no content_session_id", () => {
    expect(view.coverage.observations).toBeGreaterThan(0);
  });
  test("bug-compatible mode reproduces the original's empty observation half", () => {
    const compat = reader(fx, { bugCompatible: true }).read().agentView;
    expect(compat.coverage.observations).toBe(0);
    expect(compat.agents.every((a) => a.work.every((w) => w.kind === "work-state"))).toBe(true);
  });
  test("the content fingerprint is stable and changes with the source work", () => {
    const card = view.humanRequests[0];
    expect(contentFingerprint(card)).toMatch(/^[a-f0-9]{64}$/);
    expect(contentFingerprint(card)).toBe(contentFingerprint(structuredClone(card)));
    expect(contentFingerprint({ ...card, title: "different" })).not.toBe(contentFingerprint(card));
  });
  test("evidence URLs resolve to recorded rows", () => {
    const card = view.humanRequests.find((r) => r.original.text.startsWith("Build a retry button"));
    const m = /^\/api\/work-view\/evidence\/(prompt|session)\/(\d+)$/.exec(card.original.url);
    expect(m).toBeTruthy();
    expect(reader(fx).evidence(m[1], Number(m[2]))).toMatchObject({ kind: m[1] });
  });
  test("joins by conversation: a sibling ask in the same project is a separate card until the ledger groups it", () => {
    expect(view.humanRequests.filter((r) => r.projects.includes("shop")).length).toBe(2);
  });
  void join;
});
