// T-167: commits, PRs and branches in stored tool events become "what came out of it" on a request.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { cameOutOfIt, detectArtifacts } from "../src/hub/artifacts.mjs";
import { proposeRequests } from "../src/hub/requests.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;

describe("T-167: what came out of it", () => {
  test("detectArtifacts finds a PR URL, a bracketed commit+branch, a push branch and a PR number", () => {
    const pr = detectArtifacts("https://github.com/acme/shop/pull/42");
    expect(pr).toEqual([{ kind: "pull", value: "#42", number: 42, url: "https://github.com/acme/shop/pull/42" }]);

    const bracketed = detectArtifacts("[feat/retry-button abc1234] feat(checkout): add retry button");
    expect(bracketed.some((a) => a.kind === "commit" && a.sha === "abc1234")).toBe(true);
    expect(bracketed.some((a) => a.kind === "branch" && a.name === "feat/retry-button")).toBe(true);

    const push = detectArtifacts("git push -u origin feat/retry-button");
    expect(push.some((a) => a.kind === "branch" && a.name === "feat/retry-button")).toBe(true);

    const number = detectArtifacts("pull request #7");
    expect(number.some((a) => a.kind === "pull" && a.number === 7)).toBe(true);
  });

  test("a request carries its commit, PR and branch evidence ids", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "prompt", type: "note", title: "Build a retry button", narrative: "Build a retry button", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(300) });
      store.add({ project: "shop", kind: "event", type: "event", title: "git commit", narrative: "[feat/retry-button abc1234] feat(checkout): add retry button", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(290) });
      store.add({ project: "shop", kind: "event", type: "event", title: "git push", narrative: "git push -u origin feat/retry-button", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(289) });
      store.add({ project: "shop", kind: "event", type: "event", title: "gh pr", narrative: "https://github.com/acme/shop/pull/42", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(288) });

      const request = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests[0];
      expect(request.cameOutOfIt.some((a) => a.kind === "commit" && a.sha === "abc1234")).toBe(true);
      expect(request.cameOutOfIt.some((a) => a.kind === "branch" && a.name === "feat/retry-button")).toBe(true);
      expect(request.cameOutOfIt.some((a) => a.kind === "pull" && a.number === 42)).toBe(true);
      expect(request.outcome.commits).toBe(1);
      expect(request.outcome.pulls).toBe(1);
      expect(request.outcome.branches).toBe(1);
      for (const artifact of request.cameOutOfIt) {
        expect(artifact.evidenceId).toBeGreaterThan(0);
        expect(artifact.sessionId).toBe("s1");
        expect(artifact.at).toContain("T");
      }
    } finally {
      store.close();
    }
  });

  test("cameOutOfIt scans only the named sessions", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "event", type: "event", title: "git commit", narrative: "[feat/x deadbeef1]", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(10) });
      store.add({ project: "shop", kind: "event", type: "event", title: "git commit", narrative: "[feat/y cafe0123]", sessionId: "s2", tool: "claude-code", createdAtEpoch: at(9) });
      const onlyS1 = cameOutOfIt(store, { project: "shop", sessionIds: ["s1"] });
      expect(onlyS1.some((a) => a.sha === "deadbeef1")).toBe(true);
      expect(onlyS1.some((a) => a.sha === "cafe0123")).toBe(false);
      expect(cameOutOfIt(store, { project: "shop", sessionIds: [] })).toEqual([]);
    } finally {
      store.close();
    }
  });
});
