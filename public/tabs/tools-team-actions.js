// The write controls of the team page: add or revoke a member, change a member's shares, post to the board, leave the
// team and read its audit. Each one is a thin call over `/api/hub/team/*`; the server decides who may write, so a
// refusal reaches the person as a toast with the server's own words.
import { badge, button, confirmDialog, emptyState, field, modal, mono, timeEl, toast } from "../ui-components.js";
import { api, h } from "../ui-dom.js";

export const ROLES = ["viewer", "editor", "owner"];
export const splitList = (text) => String(text ?? "").split(",").map((item) => item.trim()).filter(Boolean);

function textDialog({ title, controls, focus, confirmLabel, size = "sm", onSave }) {
  const layer = modal({ title, size, body: controls, initialFocus: () => focus, actions: [
    button({ label: "Cancel", onClick: () => layer.close(false) }),
    button({ label: confirmLabel, variant: "primary", onClick: async () => { await onSave(); layer.close(true); } }),
  ] });
  return layer;
}

/** The raw token is shown here once and never again; the server keeps only a hash. */
function tokenDialog(name, token) {
  const layer = modal({ title: `Token for ${name}`, size: "sm", body: [
    h("p", { class: "ui-layer-text" }, "This token is shown once. Copy it now and hand it to the member; it cannot be read again."),
    mono(token),
  ], actions: [button({ label: "Done", variant: "primary", onClick: () => layer.close(true) })] });
}

export function addMemberDialog({ team, onDone }) {
  const name = h("input", { type: "text", class: "ui-input", dir: "auto", "aria-label": "Member name" });
  const role = h("select", { class: "ui-select", "aria-label": "Role" }, ...ROLES.map((value) => h("option", { value }, value)));
  role.value = "editor";
  const projects = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": "Projects (comma separated)", value: team.projects.join(", ") });
  textDialog({
    title: "Add a member", confirmLabel: "Add member", size: "md",
    controls: [field({ label: "Name", control: name }), field({ label: "Role", control: role, hint: "A viewer reads, an editor also writes, an owner also manages members." }), field({ label: "Projects (comma separated)", control: projects, hint: "Only these shared projects are visible to the member." })], focus: name,
    onSave: async () => {
      if (!name.value.trim()) throw new Error("Type a name first.");
      const out = await api("/api/hub/team/members", { method: "POST", body: { team_id: team.id, name: name.value.trim(), role: role.value, projects: splitList(projects.value) } });
      toast("Member added.", { tone: "success" });
      if (out.token) setTimeout(() => tokenDialog(name.value.trim(), out.token), 0);
      onDone();
    },
  });
}

export async function revokeMember({ team, member, onDone }) {
  const ok = await confirmDialog({ title: `Revoke ${member.name}?`, message: "The member loses access at once and their sync token stops working on every device. Rows they shared stay with the team. This cannot be undone; add them again to restore access.", confirmLabel: "Revoke member", danger: true });
  if (!ok) return;
  await api("/api/hub/team/members/revoke", { method: "POST", body: { team_id: team.id, member_id: member.id } });
  toast(`${member.name} was revoked.`, { tone: "success" });
  onDone();
}

export function sharesDialog({ team, member, onDone }) {
  const projects = h("input", { type: "text", class: "ui-input", dir: "ltr", "aria-label": "Shared projects (comma separated)", value: member.projects.join(", ") });
  textDialog({
    title: `Shares for ${member.name}`, confirmLabel: "Save shares",
    focus: projects,
    controls: [field({ label: "Shared projects (comma separated)", control: projects, hint: `Replaces the list. Pick from: ${team.projects.join(", ") || "no shared project yet"}.` })],
    onSave: async () => {
      await api("/api/hub/team/shares", { method: "POST", body: { team_id: team.id, member_id: member.id, projects: splitList(projects.value) } });
      toast("Shares saved.", { tone: "success" });
      onDone();
    },
  });
}

export function boardDialog({ team, project, kind, onDone }) {
  const pin = kind === "pin";
  const text = h("textarea", { class: "ui-input ui-textarea", rows: "4", dir: "auto", "aria-label": "Text" });
  textDialog({
    title: pin ? `Pin a note to ${project}` : `Record a decision for ${project}`, confirmLabel: pin ? "Pin note" : "Record decision", size: "md",
    focus: text,
    controls: [field({ label: "Text", control: text, hint: pin ? "Everyone who shares this project sees the note on the board." : "A decision stays on the board and in the brief." })],
    onSave: async () => {
      if (!text.value.trim()) throw new Error("Type the text first.");
      await api("/api/hub/team/board", { method: "POST", body: { team_id: team.id, project, kind, text: text.value.trim() } });
      toast(pin ? "Note pinned." : "Decision recorded.", { tone: "success" });
      onDone();
    },
  });
}

export async function leaveTeam({ team, onDone }) {
  const ok = await confirmDialog({ title: `Leave ${team.name}?`, message: "Your shared entries are withdrawn from the team, your project shares are removed and your sync token is revoked. This cannot be undone; an owner has to add you again.", confirmLabel: "Leave team", danger: true });
  if (!ok) return;
  await api("/api/hub/team/leave", { method: "POST", body: { team_id: team.id } });
  toast("You left the team.", { tone: "success" });
  onDone();
}

/** The audit is owner-only. The button fetches it on demand so a non-owner never sees a failing panel on load. */
export function auditPanel(team) {
  const out = h("div", { class: "ui-list-rows", role: "status" });
  const read = button({ label: "Read the audit", icon: "refresh", onClick: async () => {
    const { audit } = await api(`/api/hub/team/audit?team_id=${encodeURIComponent(team.id)}&limit=50`);
    out.replaceChildren(...(audit.length
      ? audit.map((row) => h("article", { class: "ui-card ui-item", "data-kind": "audit" }, h("div", { class: "ui-item-head" }, h("code", { class: "ui-mono ui-item-title" }, row.action), row.token_id != null ? badge(`token ${row.token_id}`) : null), h("div", { class: "ui-meta" }, timeEl(row.ts), row.detail ? h("code", { class: "ui-mono", dir: "ltr" }, JSON.stringify(row.detail)) : null)))
      : [emptyState({ title: "No audit entries", compact: true, art: "review" })]));
  } });
  return h("div", {}, h("div", { class: "ui-section-head" }, h("h2", {}, "Audit"), read), out);
}
