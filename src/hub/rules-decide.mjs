// Rule decide flow: approve / edit-then-approve / reject a suggestion, toggle an active rule on/off, replace a rule
// (recording "replaced by <rule> on <date>"), count decisions, and record the last learning run. Every write is
// reversible where the underlying table allows it; nothing here deletes a suggestion or a rule.
import { evidenceFromSuggestion } from "./rule-evidence.mjs";

const LEARNING_RUN_KEY = "rules.last_learning_run";

export function decidedCounts(store) {
  const rows = store.db.prepare("SELECT status, COUNT(*) AS n FROM rule_suggestions GROUP BY status").all();
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  const pending = rows.find((row) => row.status === "pending")?.n ?? 0;
  return { total, decided: total - pending, pending };
}

export function recordLearningRun(store, { found = 0, proposed = 0, errors = 0, now = Date.now() } = {}) {
  const record = { at: new Date(now).toISOString(), atEpoch: now, found, proposed, errors };
  store.setSetting(LEARNING_RUN_KEY, record);
  store.audit("system", "rules.learn", { found, proposed, errors });
  return record;
}

export function learningRun(store) {
  return store.setting(LEARNING_RUN_KEY, null);
}

/** Approve a suggestion as-is, edit its text first (action `edit`), or reject it (`reject`). */
export function decideSuggestion(store, id, { action, text = null, actor = "ui", now = Date.now() } = {}) {
  const row = store.db.prepare("SELECT * FROM rule_suggestions WHERE id = ?").get(Number(id));
  if (!row) return null;
  let finalText = row.text;
  let ruleId = null;
  if (action === "approve" || action === "edit") {
    if (action === "edit") {
      const edited = String(text ?? "").trim();
      if (edited.length < 6 || edited.length > 800) throw new RangeError("The edited rule must be 6-800 characters.");
      store.db.prepare("UPDATE rule_suggestions SET text = ? WHERE id = ?").run(edited, row.id);
      finalText = edited;
    }
    const scopeTier = row.project && row.project !== "default" ? "project" : "everywhere";
    ruleId = store.rules.add({ then: finalText, when: row.when_text, scopeTier, scopeName: scopeTier === "project" ? row.project : "Everywhere", source: "suggested", evidence: evidenceFromSuggestion(store, row.id) }).id;
    store.db.prepare("UPDATE rule_suggestions SET status = 'accepted' WHERE id = ?").run(row.id);
  } else if (action === "reject") {
    store.db.prepare("UPDATE rule_suggestions SET status = 'dismissed' WHERE id = ?").run(row.id);
  } else {
    throw new RangeError("action must be approve, edit or reject.");
  }
  const pending = store.db.prepare("SELECT * FROM review_queue WHERE item_type = 'rule' AND item_id = ? AND status = 'pending'").get(row.id);
  if (pending) store.resolveReview(pending.id, { status: action === "reject" ? "rejected" : "accepted", actor });
  store.audit(actor, `rule_suggestion.${action}`, { id: row.id, ruleId });
  return { id: row.id, action, status: action === "reject" ? "dismissed" : "accepted", text: finalText, ruleId };
}

/** Turn an active rule on or off without deleting it. */
export function toggleRule(store, id, { enabled, actor = "ui" } = {}) {
  const updated = store.rules.update(id, { enabled: !!enabled });
  if (!updated) return null;
  store.audit(actor, updated.enabled ? "rule.on" : "rule.off", { id });
  return updated;
}

/** Replace one rule with a new one and record the replacement history on the old rule. */
export function replaceRule(store, id, { then, when = "", scopeTier, scopeName, actor = "ui", now = Date.now() } = {}) {
  const current = store.rules.get(id);
  if (!current) return null;
  const text = String(then ?? "").trim();
  if (!text) throw new RangeError("Write the replacement rule before saving it.");
  const tier = scopeTier ?? current.scopeTier;
  const name = tier === "everywhere" ? "Everywhere" : (scopeName ?? current.scopeName);
  const added = store.rules.add({ then: text, when: when || current.when, scopeTier: tier, scopeName: name, source: "you" });
  store.db.prepare("UPDATE rules SET replaced_by = ?, replaced_at_epoch = ? WHERE id = ?").run(added.id, now, id);
  store.audit(actor, "rule.replace", { id, replacedBy: added.id });
  return { replacedId: id, replacedBy: added.id, rule: store.rules.get(added.id) };
}
