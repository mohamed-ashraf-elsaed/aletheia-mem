// The write controls of the team page: add or revoke a member, change a member's shares, post to the board, leave the
// team and read its audit. Each one is a thin call over `/api/hub/team/*`; the server decides who may write, so a
// refusal reaches the person as a toast with the server's own words.
import { t } from "../ui-i18n.js";
import { badge, button, confirmDialog, emptyState, field, modal, mono, timeEl, toast } from "../ui-components.js";
import { api, h } from "../ui-dom.js";

export const ROLES = ["viewer", "editor", "owner"];
export const splitList = (text) => String(text ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function textDialog({ title, controls, focus, confirmLabel, size = "sm", onSave }) {
  const layer = modal({ title, size, body: controls, initialFocus: () => focus, actions: [
    button({ label: t("team.cancel"), onClick: () => layer.close(false) }),
    button({ label: confirmLabel, variant: "primary", onClick: async () => { await onSave(); layer.close(true); } }),
  ] });
  return layer;
}

/** The raw token is shown here once and never again; the server keeps only a hash. */
function tokenDialog(name, token) {
  const layer = modal({ title: t("team.tokenTitle", { name }), size: "sm", body: [
    h("p", { class: "ui-layer-text" }, t("team.tokenText")),
    mono(token),
  ], actions: [button({ label: t("team.done"), variant: "primary", onClick: () => layer.close(true) })] });
}

export function addMemberDialog({ team, onDone }) {
  const name = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": t("team.memberName") });
  const role = h("select", { class: "ui-select", "aria-label": t("team.role") }, ...ROLES.map((value) => h("option", { value }, value)));
  role.value = "editor";
  const projects = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": t("team.projectsCsv"), value: team.projects.join(", ") });
  textDialog({
    title: t("team.addMember"), confirmLabel: t("team.addMemberConfirm"), size: "md",
    controls: [field({ label: t("team.colName"), control: name }), field({ label: t("team.role"), control: role, hint: t("team.roleHint") }), field({ label: t("team.projectsCsv"), control: projects, hint: t("team.projectsHint") })], focus: name,
    onSave: async () => {
      if (!name.value.trim()) throw new Error(t("team.typeName"));
      const out = await api("/api/hub/team/members", { method: "POST", body: { team_id: team.id, name: name.value.trim(), role: role.value, projects: splitList(projects.value) } });
      if (out.token) setTimeout(() => tokenDialog(name.value.trim(), out.token), 0);
      else toast(t("team.memberAdded"), { tone: "success" });
      onDone();
    },
  });
}

export async function revokeMember({ team, member, onDone }) {
  const ok = await confirmDialog({ title: t("team.revokeTitle", { name: member.name }), message: t("team.revokeMessage"), confirmLabel: t("team.revokeConfirm"), danger: true });
  if (!ok) return;
  await api("/api/hub/team/members/revoke", { method: "POST", body: { team_id: team.id, member_id: member.id } });
  toast(t("team.wasRevoked", { name: member.name }), { tone: "success" });
  onDone();
}

export function sharesDialog({ team, member, onDone }) {
  const projects = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": t("team.sharedCsv"), value: member.projects.join(", ") });
  textDialog({
    title: t("team.sharesTitle", { name: member.name }), confirmLabel: t("team.saveShares"),
    focus: projects,
    controls: [field({ label: t("team.sharedCsv"), control: projects, hint: t("team.sharesHint", { list: team.projects.join(", ") || t("team.noSharedYet") }) })],
    onSave: async () => {
      await api("/api/hub/team/shares", { method: "POST", body: { team_id: team.id, member_id: member.id, projects: splitList(projects.value) } });
      toast(t("team.sharesSaved"), { tone: "success" });
      onDone();
    },
  });
}

export function boardDialog({ team, project, kind, onDone }) {
  const pin = kind === "pin";
  const text = h("textarea", { class: "ui-input ui-textarea", rows: "4", dir: "auto", "aria-label": t("team.text") });
  textDialog({
    title: pin ? t("team.pinTitle", { project }) : t("team.decisionTitle", { project }), confirmLabel: pin ? t("team.pinConfirm") : t("team.decisionConfirm"), size: "md",
    focus: text,
    controls: [field({ label: t("team.text"), control: text, hint: pin ? t("team.pinHint") : t("team.decisionHint") })],
    onSave: async () => {
      if (!text.value.trim()) throw new Error(t("team.typeText"));
      await api("/api/hub/team/board", { method: "POST", body: { team_id: team.id, project, kind, text: text.value.trim() } });
      toast(pin ? t("team.notePinned") : t("team.decisionRecorded"), { tone: "success" });
      onDone();
    },
  });
}

export async function leaveTeam({ team, onDone }) {
  const ok = await confirmDialog({ title: t("team.leaveTitle", { name: team.name }), message: t("team.leaveMessage"), confirmLabel: t("team.leaveConfirm"), danger: true });
  if (!ok) return;
  await api("/api/hub/team/leave", { method: "POST", body: { team_id: team.id } });
  toast(t("team.youLeft"), { tone: "success" });
  onDone();
}

/** The audit is owner-only. The button fetches it on demand so a non-owner never sees a failing panel on load. */
export function auditPanel(team) {
  const out = h("div", { class: "ui-list-rows", role: "status" });
  const read = button({ label: t("team.readAudit"), icon: "refresh", onClick: async () => {
    const { audit } = await api(`/api/hub/team/audit?team_id=${encodeURIComponent(team.id)}&limit=50`);
    out.replaceChildren(...(audit.length
      ? audit.map((row) => h("article", { class: "ui-card ui-item", "data-kind": "audit" }, h("div", { class: "ui-item-head" }, h("code", { class: "ui-mono ui-item-title" }, row.action), row.token_id != null ? badge(t("team.tokenId", { id: row.token_id })) : null), h("div", { class: "ui-meta" }, timeEl(row.ts), row.detail ? h("code", { class: "ui-mono", dir: "ltr" }, JSON.stringify(row.detail)) : null)))
      : [emptyState({ title: t("team.noAudit"), compact: true, art: "review" })]));
  } });
  return h("div", {}, h("div", { class: "ui-section-head" }, h("h2", {}, t("team.audit")), read), out);
}
