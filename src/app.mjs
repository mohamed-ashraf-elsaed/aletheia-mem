// WorkViewService: everything behind the HTTP routes. Composes the snapshot and implements the actions
// (review, rules, mark-finished, load rules into Claude Code). Port of WorkViewRoutes.ts (the class body).
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { abbreviateHome } from "./config.mjs";
import { HumanCopy, openAiCompatibleProvider } from "./humancopy.mjs";
import { sha256 } from "./lib/util.mjs";
import { projectKeyForPath } from "./readmodel/project.mjs";
import { stopEntryFields } from "./readmodel/lifecycle.mjs";
import { MY_RULES_LIST, ruleEntryFields, rulesMarkdown } from "./readmodel/rules.mjs";
import { AGENT_LIFECYCLE_LIST } from "./readmodel/work-state.mjs";
import { configureLedger } from "./ledger/commands.mjs";
import { readLedger } from "./ledger/read.mjs";
import { SourceReader } from "./source.mjs";
import { OverlayStore } from "./store/overlay.mjs";
import { ReviewStore, contentFingerprint } from "./store/reviews.mjs";

const COMPLETE_STATUSES = ["done", "completed", "complete", "shipped", "delivered", "needs-review", "review", "in-review", "awaiting-review", "ready-for-review"];

/** Idle onboarding scan state. The original scans agent transcripts to seed a cloud account; the clone has no cloud. */
const IDLE_SCAN = {
  improveProduct: true,
  agents: [
    ["claude-code", "Claude Code"], ["codex", "Codex"], ["gemini-cli", "Gemini CLI"], ["antigravity-cli", "Antigravity CLI"], ["opencode", "OpenCode"],
  ].map(([id, label]) => ({ id, label, detected: false, prompts: 0, fromMemory: 0, fromTranscripts: 0, canRunSetup: null, cannotRunReason: null })),
  percent: 0, phase: "idle", done: false, windowStart: null, startedAt: null, finishedAt: null, durationMs: null,
  added: 0, skippedSources: 0, error: null, usage: null, usageError: null, recentPrompts: [],
};

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** A request counts as reported complete (so it may be checked) when progress hit 100% after its lifecycle, or the lifecycle says so. */
export function isReportedComplete(request) {
  const { lifecycle, progress } = request;
  const progressCounts = !lifecycle?.explicit || !lifecycle.atEpoch || (Number.isFinite(Date.parse(progress?.checkedAt ?? "")) && Date.parse(progress.checkedAt) >= lifecycle.atEpoch);
  if (progress?.percent === 100 && progressCounts) return true;
  if (!lifecycle?.explicit) return false;
  const status = String(lifecycle.status ?? "").trim().toLowerCase().replace(/[_ ]/g, "-");
  return lifecycle.complete === true || COMPLETE_STATUSES.includes(status);
}

export class WorkViewService {
  constructor(config, { autoRefresh = null } = {}) {
    this.config = config;
    configureLedger({ overlayDb: config.overlayDb });
    this.overlay = new OverlayStore(config.overlayDb);
    this.reviews = new ReviewStore(config.reviewDb);
    this.source = new SourceReader({ databasePath: config.sourceDb, ledgerDir: config.ledgerDir, overlay: this.overlay, pollIntervalMs: config.pollIntervalMs, teamMode: config.teamMode, bugCompatible: config.bugCompatible });
    const provider = config.openai.apiKey && config.openai.model ? openAiCompatibleProvider({ url: config.openai.baseUrl, apiKey: config.openai.apiKey, model: config.openai.model }) : null;
    this.humanCopy = new HumanCopy({ provider, cachePath: config.humanCopyCache });
    this.humanCopy.load().then(() => this.humanCopy.start());
    this.autoRefresh = autoRefresh;
    this.homeProject = projectKeyForPath(config.home);
    this.clients = new Set();
    this.poll = null;
    this.heartbeat = null;
    this.signature = "";
    this.closed = false;
  }

  // ---- snapshot -----------------------------------------------------------------------------------------

  snapshot() {
    const view = this.source.read().agentView;
    for (const request of view.humanRequests) {
      request.contentFingerprint = contentFingerprint(request);
      request.review = this.reviews.read(request.id, request.contentFingerprint);
    }
    const reviewDigest = sha256(JSON.stringify(view.humanRequests.map((r) => [r.id, r.contentFingerprint, r.review]))).slice(0, 16);
    const withCopy = this.humanCopy.observe(view);
    return {
      ...withCopy,
      rulesFile: this.rulesFileStatus(view),
      setup: this.setupView(withCopy),
      revision: `${view.revision}:${reviewDigest}:${this.humanCopy.revision ?? 0}`,
    };
  }

  setupView(view) {
    const status = this.autoRefresh?.status() ?? null;
    const step = status?.state !== "running" ? null : view.goals ? (view.story?.groups ? "rules" : "work") : "goals";
    return {
      scan: IDLE_SCAN,
      work: this.setupWork(),
      extraction: status
        ? { state: status.state, reason: status.reason ?? null, step, agent: status.agent ?? null, startedAt: status.startedAt ?? null, finishedAt: status.finishedAt ?? null, error: status.error ?? null }
        : null,
    };
  }

  /** The five most recently active request groups, for the onboarding "your work" list. */
  setupWork() {
    if (!this.config.ledgerDir) return null;
    let ledger;
    try { ledger = readLedger(this.config.ledgerDir); } catch { return null; }
    const ids = Object.keys(ledger.groups.groups);
    if (!ids.length) return null;
    const sessionsOf = new Map();
    for (const [key, groupId] of Object.entries(ledger.groups.conversations)) {
      const [, platform, session] = JSON.parse(key);
      if (!sessionsOf.has(groupId)) sessionsOf.set(groupId, []);
      sessionsOf.get(groupId).push([platform, session]);
    }
    let db = null;
    try { db = this.source.openDatabase(); } catch {}
    const lastPrompt = db?.prepare(`SELECT MAX(up.created_at_epoch) AS at FROM user_prompts up JOIN sdk_sessions s ON s.id = up.session_db_id WHERE s.platform_source = ? AND s.content_session_id = ?`);
    return ids
      .map((groupId) => {
        const group = ledger.groups.groups[groupId];
        const last = Math.max(0, ...(sessionsOf.get(groupId) ?? []).map(([p, s]) => Number(lastPrompt?.get(p, s)?.at ?? 0)), group.anchorAsk?.atEpoch ?? 0);
        const progress = ledger.progress[groupId];
        let platform = null;
        try { platform = JSON.parse(group.anchor)[1] ?? null; } catch {}
        return {
          groupId, title: String(group.title), platform,
          lastActiveAt: last ? new Date(last).toISOString() : null,
          progressPercent: progress && progress.state !== "unknown" && Number.isFinite(progress.percent) ? progress.percent : null,
        };
      })
      .sort((a, b) => String(b.lastActiveAt ?? "").localeCompare(String(a.lastActiveAt ?? "")))
      .slice(0, 5);
  }

  // ---- rules file ---------------------------------------------------------------------------------------

  viewerUrl() {
    return `http://localhost:${this.config.port}`;
  }

  rulesFileStatus(view) {
    const rules = view.rules ?? [];
    let instructions = "";
    try { instructions = readFileSync(this.config.claudeInstructionsFile, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
    return {
      path: abbreviateHome(this.config.rulesFile),
      instructionsPath: abbreviateHome(this.config.claudeInstructionsFile),
      approvedCount: rulesMarkdown(rules, Date.now(), { viewerUrl: this.viewerUrl() }).approvedCount,
      loadedInClaudeCode: instructions.split("\n").some((line) => line.trim() === `@${abbreviateHome(this.config.rulesFile)}`),
    };
  }

  writeRulesFile(rules) {
    mkdirSync(dirname(this.config.rulesFile), { recursive: true });
    const tmp = join(dirname(this.config.rulesFile), `.MY-RULES.md.${process.pid}.tmp`);
    writeFileSync(tmp, rulesMarkdown(rules, Date.now(), { viewerUrl: this.viewerUrl() }).markdown, { mode: 0o644 });
    renameSync(tmp, this.config.rulesFile);
  }

  // ---- actions ------------------------------------------------------------------------------------------

  requireConnected(message) {
    const snap = this.snapshot();
    if (!snap.source.connected) throw new HttpError(503, message);
    return snap;
  }

  review({ requestId, expectedFingerprint, checked }) {
    const snap = this.requireConnected("Local work is unavailable. Reconnect before reviewing.");
    const request = snap.humanRequests.find((r) => r.id === requestId);
    if (!request) throw new HttpError(404, "Request is outside the loaded work.");
    if (request.review?.available === false) throw new HttpError(503, "Local review storage is unavailable. Your source work is unchanged.");
    if (request.contentFingerprint !== expectedFingerprint) throw new HttpError(409, "This work changed. Read the latest result before checking it.", { snapshot: snap });
    if (checked && !isReportedComplete(request)) throw new HttpError(409, "This request has not been reported complete.", { snapshot: snap });
    this.reviews.set(requestId, expectedFingerprint, checked);
    return this.publishAndReturn();
  }

  saveRule({ action, ruleId, rule }) {
    const snap = this.requireConnected("Local work is unavailable. Reconnect before changing rules.");
    const rules = snap.rules ?? [];
    const current = ruleId ? rules.find((r) => r.ruleId === ruleId) : undefined;
    if (action !== "add" && !current) throw new HttpError(404, "That rule is not in your rules.");
    if (["edit", "add", "replace"].includes(action) && !rule) throw new HttpError(400, "Write the rule before saving it.");
    if (rule && rule.scopeTier !== "everywhere" && !rule.scopeName.trim()) throw new HttpError(400, "Name the project or situation this rule is for.");
    const edits = rule
      ? { scopeTier: rule.scopeTier, scopeName: rule.scopeTier === "everywhere" ? "Everywhere" : rule.scopeName.trim(), when: rule.when.trim(), then: rule.then.trim() }
      : {};
    const now = new Date().toISOString();
    const fresh = () => ({
      ruleId: `own_${randomBytes(6).toString("hex")}`, scopeId: "", scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "", ...edits,
      setBy: "owner", status: "on", kind: "directive", source: "you", timesSeen: 1, latestAt: now, quotes: [], replacedBy: null, replacedAt: null, savedAt: null,
    });
    const writes = [];
    if (action === "add") writes.push(ruleEntryFields(fresh()));
    else if (action === "replace") {
      const next = fresh();
      writes.push(ruleEntryFields(next), ruleEntryFields({ ...current, status: "replaced", replacedBy: next.ruleId, replacedAt: now }));
    } else if (action === "approve") writes.push(ruleEntryFields({ ...current, ...edits, setBy: current.setBy === "learned" ? "approved" : current.setBy, status: "on" }));
    else if (action === "edit") writes.push(ruleEntryFields({ ...current, ...edits }));
    else if (action === "turn-on" || action === "turn-off") {
      if (current.status !== "on" && current.status !== "off") throw new HttpError(409, "Only a rule you set or approved can be turned on or off.", { snapshot: snap });
      writes.push(ruleEntryFields({ ...current, status: action === "turn-on" ? "on" : "off" }));
    } else if (action === "dismiss") writes.push(ruleEntryFields({ ...current, status: "dismissed" }));
    else {
      // restore-suggestion: blank every saved field so the learned suggestion shows through again.
      if (!current.ruleId.startsWith("pref_")) throw new HttpError(409, "Only a learned rule can go back to being a suggestion.", { snapshot: snap });
      writes.push({ task: `Rule: ${current.ruleId}`, rule_id: current.ruleId, scope_tier: null, scope_name: null, when: null, then: null, set_by: null, status: null, source: null, replaced_by: null, replaced_at: null, quotes: null, times_seen: null, latest_at: null });
    }
    for (const fields of writes) this.overlay.append({ project: this.homeProject, listName: MY_RULES_LIST, fields });
    const next = this.snapshot();
    this.writeRulesFile(next.rules ?? []);
    this.publish(next);
    return next;
  }

  markAgentFinished({ agentGroupId }) {
    const snap = this.requireConnected("Local work is unavailable. Reconnect before changing an agent.");
    const agent = snap.agents.find((a) => a.id === agentGroupId);
    if (!agent) throw new HttpError(404, "That agent is not in the loaded work.");
    if (!agent.isSubagent || !agent.agentId || !agent.contentSessionId) throw new HttpError(409, "Only a subagent can be marked finished.", { snapshot: snap });
    if (!agent.canMarkFinished) throw new HttpError(409, "This agent is already recorded as finished.", { snapshot: snap });
    this.overlay.append({
      project: agent.project,
      listName: AGENT_LIFECYCLE_LIST,
      fields: stopEntryFields({ platformSource: agent.platformSource, contentSessionId: agent.contentSessionId, agentId: agent.agentId, agentType: agent.agentType, stoppedAtEpoch: Date.now(), stopSource: "owner-marked-finished" }),
    });
    return this.publishAndReturn();
  }

  /** Write MY-RULES.md and add an `@<path>` line to the Claude Code instructions file (idempotent). */
  loadRulesInClaudeCode() {
    const snap = this.requireConnected("Local work is unavailable. Reconnect before loading rules.");
    this.writeRulesFile(snap.rules ?? []);
    if (!snap.rulesFile.loadedInClaudeCode) {
      let text = "";
      try { text = readFileSync(this.config.claudeInstructionsFile, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
      const lead = text === "" || text.endsWith("\n") ? "" : "\n";
      mkdirSync(dirname(this.config.claudeInstructionsFile), { recursive: true });
      appendFileSync(this.config.claudeInstructionsFile, `${lead}@${abbreviateHome(this.config.rulesFile)}\n`);
    }
    return this.snapshot();
  }

  /** Called by POST /api/work-state/entries (the refresh's goal-saving script uses it). Returns the text reply. */
  appendWorkState({ cwd, list, fields }) {
    if (list === MY_RULES_LIST) throw new HttpError(403, `Not saved: "${list}" is written only from My Rules in the viewer.`);
    const project = projectKeyForPath(cwd);
    this.overlay.append({ project, listName: list, fields });
    this.publish();
    return `Saved to "${list}" in ${project}.`;
  }

  publishAndReturn() {
    const next = this.snapshot();
    this.publish(next);
    return next;
  }

  // ---- server-sent events -------------------------------------------------------------------------------

  send(controller, event, data) {
    try {
      controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      return true;
    } catch {
      this.clients.delete(controller);
      return false;
    }
  }

  broadcast(event, data) {
    if (!this.closed) for (const c of this.clients) this.send(c, event, data);
  }

  publish(snap = this.snapshot()) {
    if (this.closed) return;
    const sig = JSON.stringify([snap.revision, snap.source.connected, snap.source.error, snap.setup]);
    if (sig !== this.signature) {
      this.signature = sig;
      this.broadcast("work-view", snap);
    }
  }

  /** A Response that streams SSE: retry hint, an initial snapshot, then changes and a 15s heartbeat. */
  eventStream(signal) {
    let controller;
    const stream = new ReadableStream({
      start: (c) => {
        controller = c;
        c.enqueue(new TextEncoder().encode("retry: 1000\n\n"));
        this.clients.add(c);
        this.send(c, "work-view", this.snapshot());
        if (!this.poll) { this.poll = setInterval(() => this.publish(), this.config.pollIntervalMs); this.poll.unref?.(); }
        if (!this.heartbeat) {
          this.heartbeat = setInterval(() => { const s = this.snapshot(); this.broadcast("heartbeat", { at: new Date().toISOString(), source: s.source }); }, 15_000);
          this.heartbeat.unref?.();
        }
      },
      cancel: () => this.drop(controller),
    });
    signal?.addEventListener("abort", () => this.drop(controller));
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  }

  drop(controller) {
    this.clients.delete(controller);
    try { controller?.close(); } catch {}
    if (!this.clients.size) this.stopTimers();
  }

  stopTimers() {
    clearInterval(this.poll);
    clearInterval(this.heartbeat);
    this.poll = null;
    this.heartbeat = null;
  }

  close() {
    this.closed = true;
    this.stopTimers();
    for (const c of this.clients) { try { c.close(); } catch {} }
    this.clients.clear();
    this.source.close();
    this.reviews.close();
    this.humanCopy.close();
    this.autoRefresh?.close();
    this.overlay.close();
  }
}
