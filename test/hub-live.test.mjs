// T-077: the live feed (a frame reaches the status controller without a reload), the session page (episodes and
// facts), and the context preview (the exact block POST /v1/context returns). Retargeted to the public/ SPA.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";
import { createStatusController } from "../public/ui-status.js";
import { sessionDetailView } from "../public/work-view.js";

let dom;
let CV;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 5; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });

function install(routes) {
  globalThis.fetch = async (path, init = {}) => {
    for (const [pattern, handler] of routes) if (path.startsWith(pattern)) return handler(init);
    return json({ error: `unrouted ${path}` }, 404);
  };
}

beforeEach(() => { dom = installFakeDom(); });
afterAll(() => restoreGlobals());

describe("T-077: live feed, session page and context preview", () => {
  test("a session page lists its episodes and facts", () => {
    const detail = sessionDetailView({
      id: "s1", project: "shop", firstAt: 1000, lastAt: 2000, tool: "claude-code", promptCount: 2, toolCount: 1,
      summary: { text: "built the thing", at: 1500 },
      timeline: [{ id: 1, kind: "prompt", text: "build the thing", at: 1000 }, { id: 2, kind: "tool", text: "ran the tests", at: 1100 }],
      facts: [{ id: 7, text: "uses bcrypt" }],
    });
    expect(detail.title).toContain("s1");
    expect(detail.timeline.map((item) => item.text)).toEqual(["build the thing", "ran the tests"]);
    expect(detail.facts.map((fact) => fact.text)).toEqual(["uses bcrypt"]);
    expect(detail.promptLabel).toBe("2 prompts");
    expect(detail.toolLabel).toBe("1 tool event");
  });

  test("a live frame reaches the status controller without a reload", async () => {
    const frames = [];
    const sockets = [];
    const controller = createStatusController({
      fetchJson: async () => ({ ok: true, status: 200, data: {} }),
      now: () => 0, isHidden: () => false, project: () => "",
      openSocket: () => { const socket = { close() {} }; sockets.push(socket); return socket; },
      timers: { set: () => 1, clear: () => {} },
      onChange() {}, onConnection() {}, onFrame: (kind) => frames.push(kind),
    });
    await controller.start();
    const socket = sockets.at(-1);
    socket.onmessage({ data: '{"kind":"fact","id":1}' });
    socket.onmessage({ data: '{"kind":"nope"}' });
    socket.onmessage({ data: "not json" });
    socket.onmessage({ data: '{"kind":"review","id":2}' });
    expect(frames).toEqual(["fact", "review"]);
    controller.stop();
  });

  test("the context preview renders the exact block the context route returns", async () => {
    CV ??= await import("../public/ui-context.js");
    install([["/v1/context", () => json({ context: "<aletheia-memory>remember the retry policy</aletheia-memory>" })]]);
    const view = CV.contextView();
    await flush();
    expect(view.textContent).toContain("remember the retry policy");
    expect(view.textContent).toContain("session-start hook reads");
  });
});
