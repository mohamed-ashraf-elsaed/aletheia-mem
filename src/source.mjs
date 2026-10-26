// SourceReader: opens the claude-mem database read-only, folds work state, rebuilds the agent view when
// anything changed, and answers evidence/file lookups. Port of the original RB class (data-source.mjs).
import { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import { sha256, safeAll } from "./lib/util.mjs";
import { buildAgentView, readActivityRows } from "./readmodel/agent-view.mjs";
import { evidenceRow } from "./readmodel/evidence.mjs";
import { foldWorkState } from "./readmodel/work-state.mjs";
import { resolveProductFile } from "./readmodel/work-product.mjs";
import { OVERLAY_ID_BASE } from "./store/overlay.mjs";
import { ledgerSignature, readLedger } from "./ledger/read.mjs";

/** Cheap fingerprint of "has the recorded activity changed": max id and count of each table. */
function activitySignature(db) {
  const parts = ["observations", "session_summaries", "tool_uses", "user_prompts"].map((table) => {
    const row = safeAll(db, `SELECT MAX(id) AS id, COUNT(*) AS count FROM ${table}`)[0];
    return `${table}:${row?.id ?? 0}:${row?.count ?? 0}`;
  });
  const s = safeAll(db, "SELECT MAX(id) AS id, COUNT(*) AS count, MAX(completed_at_epoch) AS completed, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active FROM sdk_sessions")[0];
  parts.push(`sessions:${s?.id ?? 0}:${s?.count ?? 0}:${s?.completed ?? 0}:${s?.active ?? 0}`);
  parts.push(`data:${safeAll(db, "PRAGMA data_version")[0]?.data_version ?? 0}`);
  return parts.join("|");
}

/** Goals in `goalKeys` that the saved alignment has never seen. */
export const goalsMissingFromAlignment = (alignment, goalKeys) => {
  const known = new Set(alignment?.goals ?? goalKeys);
  return goalKeys.filter((g) => !known.has(g));
};

export class SourceReader {
  constructor({ databasePath, ledgerDir, overlay, pollIntervalMs = 1000, localDeviceId = "", teamMode = false, bugCompatible = false }) {
    Object.assign(this, { databasePath, ledgerDir, overlay, pollIntervalMs, localDeviceId, teamMode, bugCompatible });
    this.database = null;
    this.databaseIdentity = null;
    this.columns = new Set();
    this.ledger = null;
    this.ledgerSig = null;
    this.workStateSig = null;
    this.activitySig = null;
    this.agentRevision = 0;
    this.cachedState = foldWorkState([], { currentProject: "", currentProjectScope: [] });
    this.agentView = { ...buildAgentView(this.cachedState, {}), revision: 0 };
    this.source = { kind: "claude-mem-work-state", mode: "read-only-sqlite", connected: false, pollIntervalMs, lastCheckedAt: null, lastUpdatedAt: null, error: null };
  }

  openDatabase() {
    const stat = statSync(this.databasePath);
    const identity = `${stat.dev}:${stat.ino}`;
    if (!this.database || identity !== this.databaseIdentity) {
      this.close();
      this.database = new Database(this.databasePath, { readonly: true, create: false });
      this.database.exec("PRAGMA query_only = ON");
      this.database.exec("PRAGMA busy_timeout = 1500");
      this.columns = new Set(this.database.prepare("PRAGMA table_info(work_state_entries)").all().map((c) => c.name));
      this.databaseIdentity = identity;
      this.workStateSig = null;
      this.activitySig = null;
    }
    return this.database;
  }

  readLedgerIfChanged() {
    const sig = this.ledgerDir ? ledgerSignature(this.ledgerDir) : "disabled";
    if (sig !== this.ledgerSig) {
      try {
        this.ledger = this.ledgerDir ? readLedger(this.ledgerDir) : null;
      } catch {
        this.ledger = null;
      }
      this.ledgerSig = sig;
    }
    return sig;
  }

  /** Re-read whatever changed and return the current snapshot (cheap when nothing changed). */
  read() {
    this.source.lastCheckedAt = new Date().toISOString();
    try {
      const db = this.openDatabase();
      const head = db
        .prepare(`SELECT COUNT(*) AS count, MAX(id) AS id${this.columns.has("sync_rev") ? ", SUM(CAST(sync_rev AS INTEGER)) AS synced_revision" : ""} FROM work_state_entries`)
        .get();
      const workStateSig = `${head.count}:${head.id ?? 0}:${head.synced_revision ?? 0}:${this.localDeviceId}:overlay:${this.overlay.signature()}`;
      const ledgerSig = this.readLedgerIfChanged();
      const activitySig = `${activitySignature(db)}|ledger:${ledgerSig}|overlay:${this.overlay.signature()}`;
      if (workStateSig !== this.workStateSig || activitySig !== this.activitySig || !this.source.connected) {
        db.exec("BEGIN");
        try {
          if (workStateSig !== this.workStateSig || !this.source.connected) {
            const extra = ["origin_device_id", "origin_local_id"].filter((c) => this.columns.has(c));
            const rows = db.prepare(`SELECT id, project, list_name, fields, created_at_epoch${extra.length ? `, ${extra.join(", ")}` : ""} FROM work_state_entries`).all();
            this.cachedState = foldWorkState([...rows, ...this.overlay.entries()], { currentProject: "", currentProjectScope: [], localDeviceId: this.localDeviceId });
          }
          this.agentRevision++;
          const rows = readActivityRows(db, { workState: this.cachedState, ledger: this.ledger, bugCompatible: this.bugCompatible });
          this.agentView = { ...buildAgentView(this.cachedState, rows, { titleCache: {}, ledger: this.ledger }), revision: this.agentRevision };
          this.hashEvidence(db);
          this.workStateSig = workStateSig;
          this.activitySig = activitySig;
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
      this.source.connected = true;
      this.source.error = null;
      this.source.lastUpdatedAt = this.cachedState.lastUpdatedAt;
    } catch (error) {
      this.source.connected = false;
      this.source.error = /ENOENT/.test(String(error.code)) ? "Local work-state database is unavailable." : "Local work-state database could not be read. Retrying.";
      this.lastError = error;
      this.close();
    }
    return this.snapshot();
  }

  /** Attach sha256 hashes of every raw row a request cites, so editing any of them changes its fingerprint. */
  hashEvidence(db) {
    const hashes = new Map();
    for (const request of this.agentView.humanRequests) {
      const refs = new Map();
      const add = (ref) => {
        if (ref && ["work-state", "observation", "prompt", "summary", "session"].includes(ref.kind) && Number.isSafeInteger(ref.id) && ref.id > 0) refs.set(`${ref.kind}:${ref.id}`, ref);
      };
      const addUrl = (url) => {
        const m = /^\/api\/work-view\/evidence\/([\w-]+)\/(\d+)$/.exec(url ?? "");
        if (m) add({ kind: m[1], id: Number(m[2]) });
      };
      addUrl(request.original?.url);
      for (const u of request.scopeUpdates) addUrl(u.url);
      for (const item of request.items) {
        addUrl(item.url);
        addUrl(item.request?.url);
        addUrl(item.request?.original?.url);
        for (const part of [item.nextStep, item.outcome]) if (part?.source === "session-summary") add({ kind: "summary", id: part.sourceId });
        for (const ref of item.sourceRefs ?? []) add(ref);
      }
      for (const a of [...request.activity, ...request.workstreams.flatMap((w) => w.activity)]) add(a.sourceRef);
      request.sourceContentHashes = [...refs]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, ref]) => {
          if (!hashes.has(key)) hashes.set(key, sha256(JSON.stringify(evidenceRow(db, this.overlay, ref.kind, ref.id))));
          return { ...ref, hash: hashes.get(key) };
        });
    }
  }

  snapshot() {
    return {
      ...this.cachedState,
      generatedAt: new Date().toISOString(),
      agentView: this.agentsSnapshot(),
      source: { ...this.source, stale: !this.source.connected && this.cachedState.entryCount > 0 },
    };
  }

  agentsSnapshot() {
    const now = Date.now();
    return {
      ...this.agentView,
      ...this.goalLinks(),
      teamMode: this.teamMode,
      story: this.ledger ? { reviews: Object.values(this.ledger.progress), story: this.ledger.story, groups: Object.keys(this.ledger.groups.groups).length } : null,
      refresh: this.ledger?.refresh ?? null,
      agents: this.agentView.agents.map((agent) => ({
        ...agent,
        presence: {
          ...agent.presence,
          status: agent.presence.status === "finished" ? "finished" : agent.presence.lastActivityAt ? (now - Date.parse(agent.presence.lastActivityAt) <= 900_000 ? "recent" : "quiet") : "unknown",
        },
      })),
      source: {
        ...this.source,
        kind: "claude-mem-recorded-agent-activity",
        lastUpdatedAt: this.agentView.agents[0]?.presence.lastActivityAt ?? null,
        stale: !this.source.connected && this.agentView.agents.length > 0,
      },
    };
  }

  /** Attach, to each request, the goals the alignment step linked it to. */
  goalLinks() {
    const alignment = this.ledger?.alignment;
    const goals = this.agentView.goals;
    if (!alignment || !goals) return {};
    const byTask = new Map([...goals.priorities, ...goals.openAsks].map((g) => [g.task, g]));
    const unaligned = new Set(goalsMissingFromAlignment(alignment, [...byTask.keys()]).length ? [] : (alignment.unaligned ?? []));
    return {
      humanRequests: (this.agentView.humanRequests ?? []).map((request) => {
        if (!request.groupId) return request;
        const links = (alignment.links?.[request.groupId] ?? [])
          .filter((l) => byTask.has(l.goal))
          .map((l) => {
            const g = byTask.get(l.goal);
            return { goalId: g.id, goal: l.goal, title: g.title, kind: g.kind, evidence: l.evidence };
          });
        return links.length ? { ...request, goals: links } : unaligned.has(request.groupId) ? { ...request, goals: [] } : request;
      }),
      goals: { ...goals, alignedAt: alignment.alignedAt ?? null },
    };
  }

  evidence(kind, id) {
    try {
      return evidenceRow(this.openDatabase(), this.overlay, kind, id);
    } catch {
      return null;
    }
  }

  file(kind, id, index) {
    try {
      const db = this.openDatabase();
      // Entries this server wrote live in the overlay store, under ids above OVERLAY_ID_BASE.
      const all = (sql, params) => (sql.includes("FROM work_state_entries") && params[0] >= OVERLAY_ID_BASE ? [this.overlay.get(params[0])].filter(Boolean) : safeAll(db, sql, params));
      return resolveProductFile(all, kind, id, index);
    } catch {
      return null;
    }
  }

  close() {
    this.database?.close();
    this.database = null;
    this.databaseIdentity = null;
  }
}
