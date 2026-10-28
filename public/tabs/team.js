// the Team tab. Plain list, create and read views over `/api/hub/team/*`. The one-UI shell wires
// `renderTeam` into its tab list; this module touches no other file.
import { api, chip, errorCard, errorText, h, run, swap, toast } from "../ui-dom.js";

export async function renderTeam() {
  const root = document.getElementById("ui-team");
  const result = await Promise.allSettled([api("/api/hub/team")]);
  const data = result[0].status === "fulfilled" ? result[0].value : null;
  if (!data) {
    swap(root, h("h1", {}, "Team"), errorCard(errorText(result[0], "Team")));
    return;
  }
  const state = { teamId: data.teams[0]?.id ?? null, project: data.teams[0]?.projects[0] ?? "" };
  const detail = h("div", {});
  const list = h("div", {});

  const refresh = async () => {
    const next = await api("/api/hub/team");
    swap(list, ...(next.teams.length
      ? next.teams.map((team) => h("div", { class: "ui-card" },
        h("div", { class: "ui-row" }, h("b", {}, team.name), chip(team.role ?? "member", team.role === "viewer" ? "warn" : "ok")),
        h("div", { class: "ui-meta" }, `projects: ${team.projects.join(", ") || "none"}`),
        h("div", { class: "ui-acts" }, h("button", {
          onclick: () => {
            state.teamId = team.id;
            state.project = team.projects[0] ?? "";
            loadDetail();
          },
        }, "Open"))))
      : [h("div", { class: "ui-empty" }, "No team yet. Create one below.")]));
    return next;
  };

  const loadDetail = async () => {
    if (!state.teamId) return;
    const [members, board, brief] = await Promise.allSettled([
      api(`/api/hub/team/members?team_id=${state.teamId}`),
      api(`/api/hub/team/board?team_id=${state.teamId}${state.project ? `&project=${encodeURIComponent(state.project)}` : ""}`),
      state.project ? api(`/api/hub/team/brief?team_id=${state.teamId}&project=${encodeURIComponent(state.project)}`) : Promise.resolve(null),
    ]);
    const memberRows = members.status === "fulfilled" ? members.value.members : [];
    const boardRows = board.status === "fulfilled" ? board.value.entries : [];
    swap(detail,
      h("div", { class: "ui-card" },
        h("h2", {}, "Members"),
        memberRows.length ? h("table", { class: "ui-table" },
          h("thead", {}, h("tr", {}, ...["Name", "Role", "Projects", "State"].map((label) => h("th", {}, label)))),
          h("tbody", {}, ...memberRows.map((member) => h("tr", {},
            h("td", {}, member.name),
            h("td", {}, member.role),
            h("td", {}, member.projects.join(", ") || "none"),
            h("td", {}, member.revoked ? chip("revoked", "bad") : chip("active", "ok"))))))
          : h("div", { class: "ui-empty" }, "No members."),
        h("div", { class: "ui-meta" }, "Add members from the CLI: aletheia team add-member <team> --name n --role editor --projects a,b")),
      h("div", { class: "ui-card" },
        h("h2", {}, "Board"),
        boardRows.length ? h("div", {}, ...boardRows.map((entry) => h("div", { class: "ui-row" },
          chip(entry.kind, entry.kind === "decision" ? "ok" : ""),
          h("span", {}, entry.text),
          h("span", { class: "ui-meta" }, `${entry.author.name} · ${entry.at.slice(0, 16).replace("T", " ")}`)))) : h("div", { class: "ui-empty" }, "Nothing pinned or decided.")),
      state.project && brief.status === "fulfilled" && brief.value
        ? h("div", { class: "ui-card" }, h("h2", {}, "Brief"), h("pre", { class: "ui-pre" }, brief.value.text))
        : null);
  };

  const create = h("div", { class: "ui-row" },
    h("input", { placeholder: "Team name", id: "team-new-name" }),
    h("button", { class: "primary", onclick: () => run(async () => {
      const name = document.getElementById("team-new-name").value.trim();
      if (!name) return toast("Name the team first.");
      await api("/api/hub/team", { method: "POST", body: { name } });
      await refresh();
      toast("Team created");
    }) }, "Create team"));

  const project = h("div", { class: "ui-row" },
    h("input", { placeholder: "Project name", id: "team-new-project" }),
    h("button", { onclick: () => run(async () => {
      const value = document.getElementById("team-new-project").value.trim();
      if (!state.teamId || !value) return toast("Pick a team and name a project.");
      await api("/api/hub/team/projects", { method: "POST", body: { team_id: state.teamId, project: value } });
      state.project = value;
      await refresh();
      await loadDetail();
      toast("Project added");
    }) }, "Add project"));

  const search = h("div", { class: "ui-row" },
    h("input", { placeholder: "Search shared memory", id: "team-search" }),
    h("button", { onclick: () => run(async () => {
      const query = document.getElementById("team-search").value.trim();
      if (!state.teamId || !query) return toast("Pick a team and type a query.");
      const found = await api("/api/hub/team/search", { method: "POST", body: { team_id: state.teamId, query } });
      swap(detail, h("div", { class: "ui-card" }, h("h2", {}, "Search"),
        found.results.length ? h("div", {}, ...found.results.map((entry) => h("div", { class: "ui-row" }, chip(entry.project, ""), h("span", {}, entry.text), h("span", { class: "ui-meta" }, entry.source)))) : h("div", { class: "ui-empty" }, "No match.")));
    }) }, "Search"));

  await refresh();
  swap(root,
    h("h1", {}, "Team"),
    h("p", { class: "ui-meta" }, "Shared projects, a board of pins and decisions, a rule-based brief and ACL-scoped search. A viewer can read but not write."),
    create,
    list,
    project,
    search,
    detail);
  await loadDetail();
}
