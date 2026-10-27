// Settings (T-078): a read/write form over GET/PUT /api/hub/settings. Values live in the hub settings table and
// survive a restart. The API key is a password field: masked on read, replaced only when a non-empty value is sent.
import { badge, button, emptyState, skeleton, toast } from "../ui-components.js";
import { api, h } from "../ui-dom.js";
import { region } from "../ui-region.js";

function settingField(spec) {
  const id = `ui-setting-${spec.key.replace(/[^a-zA-Z0-9]/g, "-")}`;
  let control;
  if (spec.kind === "boolean") control = h("input", { type: "checkbox", id, "aria-label": spec.label, checked: !!spec.value });
  else if (spec.kind === "int") control = h("input", { type: "number", id, "aria-label": spec.label, value: String(spec.value ?? "") });
  else if (spec.kind === "list") control = h("input", { type: "text", id, "aria-label": spec.label, value: (spec.value ?? []).join(", ") });
  else if (spec.secret) control = h("input", { type: "password", id, "aria-label": spec.label, placeholder: spec.set ? "unchanged" : "set a value" });
  else control = h("input", { type: "text", id, "aria-label": spec.label, value: String(spec.value ?? "") });
  const row = h("div", { class: "ui-setting-row" },
    h("label", { for: id, class: "ui-setting-label" }, spec.label),
    control,
    spec.secret ? h("span", { class: "ui-meta" }, spec.set ? badge("set", "success") : badge("not set")) : null);
  return { row, control };
}

export function settingsView() {
  const controls = new Map();
  const reg = region({
    load: async () => (await api("/api/hub/settings")).settings ?? [],
    skeleton: () => skeleton({ kind: "card", count: 3 }),
    isEmpty: (settings) => !settings.length,
    empty: () => emptyState({ title: "No settings", text: "No editable settings are defined.", compact: true }),
    errorTitle: "Could not load settings",
    render: (settings) => {
      controls.clear();
      const save = button({ label: "Save", variant: "primary", icon: "check", onClick: async () => {
        const patch = {};
        for (const spec of settings) {
          const control = controls.get(spec.key);
          if (!control) continue;
          if (spec.kind === "boolean") patch[spec.key] = control.checked;
          else if (spec.kind === "int") { if (control.value !== "") patch[spec.key] = Number(control.value); }
          else if (spec.kind === "list") patch[spec.key] = control.value.split(",").map((item) => item.trim()).filter(Boolean);
          else if (spec.secret) { if (control.value !== "") patch[spec.key] = control.value; }
          else patch[spec.key] = control.value;
        }
        try {
          await api("/api/hub/settings", { method: "PUT", body: patch });
          toast("Settings saved.", { tone: "success" });
          reg.reload({ soft: true });
        } catch (error) {
          toast(error.message ?? "Could not save settings.", { tone: "danger" });
        }
      } });
      const rows = settings.map((spec) => {
        const field = settingField(spec);
        controls.set(spec.key, field.control);
        return field.row;
      });
      return h("div", {},
        h("p", { class: "ui-meta" }, "Values are saved in the hub and survive a restart. Leave the API key blank to keep the current value."),
        h("div", { class: "ui-settings-form" }, ...rows),
        h("div", { class: "ui-acts" }, save));
    },
  });
  return reg;
}
