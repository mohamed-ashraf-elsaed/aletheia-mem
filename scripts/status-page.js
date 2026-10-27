(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("status-data").textContent);
  var STATUSES = ["validated", "implemented", "doing", "failed", "todo"];
  var TABS = ["Overview", "Tasks", "Features", "Docs", "Verification", "Next", "Git"];
  var byId = {};
  D.tasks.forEach(function (t) { byId[t.id] = t; });
  var state = { tab: "Overview", sortKey: "id", sortDir: 1, status: "", phase: "", q: "", open: {}, featStatus: "" };

  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "on") Object.keys(v).forEach(function (ev) { el.addEventListener(ev, v[ev]); });
      else el.setAttribute(k, v === true ? "" : String(v));
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid === undefined || kid === null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach(function (k) { add(el, k); });
    else el.appendChild(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
  }
  function pill(text, kind) { return h("span", { class: "pill " + (kind || text), text: text }); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function when(s) { return s ? s.replace("T", " ").replace(/\.\d+Z$/, " UTC") : "n/a"; }

  function taskLink(id) {
    return h("button", { class: "link mono", type: "button", text: id, "aria-label": "Open task " + id, on: { click: function () { state.q = id; state.open = {}; state.open[id] = true; state.status = ""; state.phase = ""; go("Tasks"); } } });
  }
  function docLink(file, text) { return h("a", { href: "../" + file.replace(/^docs\//, ""), text: text || file }); }
  function copyButton(text) {
    var b = h("button", { class: "btn", type: "button", text: "Copy" });
    b.addEventListener("click", function () {
      function done(ok) { b.textContent = ok ? "Copied" : "Copy failed"; setTimeout(function () { b.textContent = "Copy"; }, 1500); }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); }); return; }
      } catch (e) { /* fall through */ }
      fallback();
      function fallback() {
        var ta = h("textarea", { "aria-hidden": "true" });
        ta.value = text; document.body.appendChild(ta); ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(ta); done(ok);
      }
    });
    return b;
  }
  function cmdBlock(cmd) { return h("div", { class: "cmd" }, h("pre", { text: cmd }), h("div", { class: "filters" }, copyButton(cmd))); }
  function bar(parts, total) {
    var el = h("div", { class: "bar", role: "img", "aria-label": parts.map(function (p) { return p[1] + " " + p[0]; }).join(", ") });
    parts.forEach(function (p) {
      if (!p[1]) return;
      var s = h("span", { class: "s-" + p[0], title: p[0] + ": " + p[1] });
      s.style.width = (total ? (100 * p[1]) / total : 0) + "%";
      el.appendChild(s);
    });
    return el;
  }
  function table(headers, rows) {
    return h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, headers.map(function (x) { return h("th", { scope: "col", text: x }); }))), h("tbody", {}, rows)));
  }
  function tr(cells) { return h("tr", {}, cells.map(function (c) { return h("td", {}, c); })); }

  // ---- all red-list items (computed fields plus stale) ----

  // ---- Overview ----
  function overview() {
    var root = h("div");
    var c = D.taskCounts;
    root.appendChild(h("div", { class: "cards" }, [["validated", "validated"], ["implemented", "implemented"], ["doing", "doing"], ["failed", "failed"], ["todo", "todo"]].map(function (p) {
      return h("div", { class: "card" }, h("div", { class: "n", text: c[p[0]] || 0 }), h("div", { class: "l", text: p[1] }));
    }), h("div", { class: "card" }, h("div", { class: "n", text: D.taskTotal }), h("div", { class: "l", text: "tasks in total" }))));
    var bad = D.inconsistencies;
    root.appendChild(h("h2", { text: bad.length ? "Inconsistent (" + bad.length + ")" : "Inconsistent: none" }));
    if (bad.length) root.appendChild(h("ul", { class: "plain red" }, bad.map(function (r) { return h("li", { text: r.text }); })));
    else root.appendChild(h("p", { class: "muted", text: "No table/file mismatch and no validated task with empty Evidence." }));
    var re = D.stale;
    root.appendChild(h("h2", { text: "Re-check suggested (" + re.length + ")" }));
    root.appendChild(h("p", { class: "muted small", text: "A file listed in the task was changed by a later commit. The task may still be fine; re-run its validation command to be sure." }));
    if (re.length) root.appendChild(h("ul", { class: "plain amber" }, re.slice(0, 15).map(function (r) { return h("li", { text: r.text }); })));
    if (re.length > 15) root.appendChild(h("p", { class: "muted small", text: "and " + (re.length - 15) + " more in the Tasks tab and status.json" }));
    if (D.notes.length) {
      root.appendChild(h("h3", { text: "Notes (" + D.notes.length + ")" }));
      root.appendChild(h("ul", { class: "plain amber" }, D.notes.slice(0, 12).map(function (r) { return h("li", { text: r.text }); })));
      if (D.notes.length > 12) root.appendChild(h("p", { class: "muted small", text: "and " + (D.notes.length - 12) + " more in status.json" }));
    }
    var two = h("div", { class: "two" });
    var phases = h("div", { class: "panel" }, h("h3", { text: "Progress by phase" }));
    Object.keys(D.phases).sort().forEach(function (p) {
      var x = D.phases[p];
      phases.appendChild(h("div", { class: "row" }, h("strong", { text: p }), bar(STATUSES.map(function (s) { return [s, x[s]]; }), x.total), h("span", { class: "pct", text: Math.round((100 * x.validated) / x.total) + "% (" + x.validated + "/" + x.total + ")" })));
    });
    phases.appendChild(h("p", { class: "muted small", text: "Green is validated. The legend is the status list above." }));
    two.appendChild(phases);
    var defs = h("div", { class: "panel" }, h("h3", { text: "Verified and validated" }),
      h("p", {}, h("strong", { text: "Validated: " }), "the task's own validation command ran and passed, and its real output is in the task file."),
      h("p", {}, h("strong", { text: "Verified: " }), "a person or a real install confirmed it. This is rarer, and the Verification tab lists what is still open."));
    two.appendChild(defs);
    root.appendChild(two);
    root.appendChild(h("h2", { text: "Next 5 eligible tasks" }));
    var r5 = D.next.ranked.slice(0, 5);
    root.appendChild(r5.length ? h("ol", {}, r5.map(function (r) { return h("li", {}, taskLink(r.id), " " + r.title + " ", pill(r.phase, "info")); })) : h("p", { class: "muted", text: "No todo task has all dependencies validated." }));
    var s = D.source.dirs;
    root.appendChild(h("h2", { text: "Source inventory" }));
    root.appendChild(table(["Directory", "Files", "Lines (text files)"], Object.keys(s).map(function (k) { return tr([k + "/", String(s[k].files), String(s[k].lines)]); })));
    return root;
  }

  // ---- Tasks ----
  function taskDetail(t) {
    var d = h("div");
    d.appendChild(h("dl", { class: "dl" },
      h("dt", { text: "Dependencies" }), h("dd", {}, t.deps.length ? t.deps.map(function (x) { return [taskLink(x.id), " ", pill(x.status), " "]; }) : "none"),
      h("dt", { text: "Blocked by" }), h("dd", { text: t.blockedBy.length ? t.blockedBy.join(", ") : "nothing" }),
      h("dt", { text: "Unblocks" }), h("dd", {}, t.dependents.length ? t.dependents.map(function (x) { return [taskLink(x), " "]; }) : "nothing"),
      h("dt", { text: "Evidence" }), h("dd", { text: t.evidenceNonEmpty ? "present (" + t.evidenceChars + " characters)" : "empty" }),
      h("dt", { text: "Acceptance" }), h("dd", { text: t.acceptanceTicked + " of " + t.acceptanceTotal + " ticked" }),
      h("dt", { text: "Files to touch" }), h("dd", { text: t.files.length ? t.files.join(", ") : "none listed" }),
      h("dt", { text: "Last history" }), h("dd", { text: t.lastHistory || "none" })));
    if (t.acceptance.length) d.appendChild(h("ul", { class: "plain" }, t.acceptance.map(function (a) { return h("li", { text: (a.done ? "[x] " : "[ ] ") + a.text }); })));
    d.appendChild(h("h3", { text: "Validation command" }));
    d.appendChild(t.validation ? cmdBlock(t.validation) : h("p", { class: "bad", text: "none" }));
    d.appendChild(h("p", {}, h("a", { href: "../tasks/" + t.id + ".md", text: "Open " + t.id + ".md" })));
    return d;
  }
  function tasksTab() {
    var root = h("div");
    var search = h("input", { type: "search", placeholder: "Search id, title, text", "aria-label": "Search tasks", value: state.q });
    var selS = h("select", { "aria-label": "Filter by status" }, h("option", { value: "", text: "All statuses" }), STATUSES.map(function (s) { return h("option", { value: s, text: s }); }));
    var phases = Object.keys(D.phases).sort();
    var selP = h("select", { "aria-label": "Filter by phase" }, h("option", { value: "", text: "All phases" }), phases.map(function (s) { return h("option", { value: s, text: s }); }));
    selS.value = state.status; selP.value = state.phase;
    var count = h("span", { class: "muted small", "aria-live": "polite" });
    var holder = h("div");
    root.appendChild(h("div", { class: "filters" }, search, selS, selP, count));
    root.appendChild(holder);
    function draw() {
      var q = state.q.toLowerCase();
      var list = D.tasks.filter(function (t) {
        return (!state.status || t.status === state.status) && (!state.phase || t.phase === state.phase) &&
          (!q || (t.id + " " + t.title + " " + t.lastHistory + " " + t.depsRaw).toLowerCase().indexOf(q) >= 0);
      });
      var k = state.sortKey;
      list.sort(function (a, b) {
        var x = k === "deps" ? a.deps.length : k === "acceptance" ? a.acceptanceTicked / (a.acceptanceTotal || 1) : a[k];
        var y = k === "deps" ? b.deps.length : k === "acceptance" ? b.acceptanceTicked / (b.acceptanceTotal || 1) : b[k];
        return (x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1) * state.sortDir;
      });
      count.textContent = list.length + " of " + D.tasks.length;
      var cols = [["id", "ID"], ["title", "Title"], ["phase", "Phase"], ["status", "Status"], ["deps", "Deps"], ["validatedOn", "Validated"], ["acceptance", "Accept."]];
      var head = h("tr", {}, cols.map(function (c) {
        return h("th", { scope: "col", "aria-sort": state.sortKey === c[0] ? (state.sortDir > 0 ? "ascending" : "descending") : "none" },
          h("button", { type: "button", text: c[1] + (state.sortKey === c[0] ? (state.sortDir > 0 ? " ▲" : " ▼") : ""), on: { click: function () { if (state.sortKey === c[0]) state.sortDir *= -1; else { state.sortKey = c[0]; state.sortDir = 1; } draw(); } } }));
      }));
      var body = h("tbody");
      list.forEach(function (t) {
        var open = !!state.open[t.id];
        var row = h("tr", { class: "main", tabindex: "0", "aria-expanded": open ? "true" : "false" },
          h("td", { class: "mono", text: t.id }), h("td", { text: t.title }), h("td", { text: t.phase }), h("td", {}, pill(t.status)),
          h("td", { text: t.deps.length ? t.deps.length + (t.blockedBy.length ? " (" + t.blockedBy.length + " open)" : "") : "0" }),
          h("td", { text: t.validatedOn || "-" }), h("td", { text: t.acceptanceTotal ? t.acceptanceTicked + "/" + t.acceptanceTotal : "-" }));
        function toggle() { state.open[t.id] = !state.open[t.id]; draw(); var again = holder.querySelector('tr.main[data-id="' + t.id + '"]'); if (again) again.focus(); }
        row.setAttribute("data-id", t.id);
        row.addEventListener("click", toggle);
        row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
        body.appendChild(row);
        if (open) body.appendChild(h("tr", { class: "detail" }, h("td", { colspan: "7" }, taskDetail(t))));
      });
      holder.textContent = "";
      holder.appendChild(h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, head), body)));
    }
    search.addEventListener("input", function () { state.q = search.value; draw(); });
    selS.addEventListener("change", function () { state.status = selS.value; draw(); });
    selP.addEventListener("change", function () { state.phase = selP.value; draw(); });
    draw();
    return root;
  }

  // ---- Features ----
  function featuresTab() {
    var root = h("div");
    var t = D.features.total;
    root.appendChild(h("p", {}, "Rows with a known status: ", pill(t.done + " done", "done"), " ", pill(t.partial + " partial", "partial"), " ", pill(t.missing + " missing", "missing"), " ", t.other ? pill(t.other + " other", "info") : ""));
    root.appendChild(h("p", { class: "muted small", text: "done = parity or better in the matrix, or every linked task validated. Click a task id to open it in the Tasks tab." }));
    var sel = h("select", { "aria-label": "Filter features by status" }, h("option", { value: "", text: "All rows" }), ["done", "partial", "missing", "other"].map(function (s) { return h("option", { value: s, text: s }); }));
    sel.value = state.featStatus;
    sel.addEventListener("change", function () { state.featStatus = sel.value; render(); });
    root.appendChild(h("div", { class: "filters" }, sel));
    D.features.sources.forEach(function (src) {
      root.appendChild(h("h2", {}, src.title, " ", h("span", { class: "muted small" }, docLink(src.doc))));
      src.sections.forEach(function (sec) {
        var rows = sec.rows.filter(function (r) {
          var k = ["done", "partial", "missing"].indexOf(r.status) >= 0 ? r.status : "other";
          return !state.featStatus || state.featStatus === k;
        });
        if (!rows.length) return;
        var c = sec.counts;
        var det = h("details", state.featStatus || sec.rows.length < 8 ? { open: true } : {});
        det.appendChild(h("summary", {}, h("strong", { text: sec.name }), "  ", pill(c.done + " done", "done"), " ", pill(c.partial + " partial", "partial"), " ", pill(c.missing + " missing", "missing"), c.other ? [" ", pill(c.other + " other", "info")] : ""));
        det.appendChild(bar([["done", c.done], ["partial", c.partial], ["missing", c.missing], ["other", c.other]], sec.rows.length));
        det.appendChild(table(["ID", "Feature", "Status", "Tasks"], rows.map(function (r) {
          return tr([r.id, r.name, [pill(["done", "partial", "missing"].indexOf(r.status) >= 0 ? r.status : "info", ["done", "partial", "missing"].indexOf(r.status) >= 0 ? r.status : "info"), r.rawStatus && r.rawStatus !== r.status ? h("span", { class: "muted small", text: " " + r.rawStatus }) : ""],
            r.taskStates.length ? r.taskStates.map(function (x) { return [taskLink(x.id), h("span", { class: "muted small", text: " " + x.status + " " }) ]; }) : "none"]);
        })));
        root.appendChild(det);
      });
    });
    function render() { var p = root.parentNode; var n = featuresTab(); if (p) p.replaceChild(n, root); }
    return root;
  }

  // ---- Docs ----
  function docsTab() {
    var root = h("div");
    var orphans = D.docs.filter(function (d) { return d.orphan; });
    root.appendChild(h("p", {}, plural(D.docs.length, "document"), " in docs/. ", plural(orphans.length, "is not") + " linked from the README or a docs index. ", D.links.local + " local links and " + D.links.external + " external links counted (external links are never fetched)."));
    root.appendChild(h("h2", { text: D.links.broken.length ? "Broken links (" + D.links.broken.length + ")" : "Broken links: none" }));
    if (D.links.broken.length) root.appendChild(h("ul", { class: "plain red" }, D.links.broken.map(function (b) { return h("li", { class: "mono", text: b }); })));
    var onlyOrphans = h("input", { type: "checkbox", id: "orph" });
    var holder = h("div");
    root.appendChild(h("div", { class: "filters" }, onlyOrphans, h("label", { for: "orph", text: "Show only documents not linked from the README or a docs index" })));
    root.appendChild(holder);
    function draw() {
      var list = D.docs.filter(function (d) { return !onlyOrphans.checked || d.orphan; });
      holder.textContent = "";
      holder.appendChild(table(["File", "Title", "Size", "Last commit", "README", "Other docs"], list.map(function (d) {
        return tr([docLink(d.file), d.title, (d.bytes / 1024).toFixed(1) + " KB", d.lastCommit, d.linkedFromReadme ? "linked" : (d.linkedFromIndex ? "index" : "not linked"), String(d.linkedFromOtherDocs)]);
      })));
    }
    onlyOrphans.addEventListener("change", draw);
    draw();
    return root;
  }

  // ---- Verification ----
  function verificationTab() {
    var root = h("div");
    var run = D.checks.lastRecordedRun;
    root.appendChild(h("h2", { text: "Last recorded run" }));
    if (run) {
      root.appendChild(h("div", { class: "panel" }, h("dl", { class: "dl" },
        h("dt", { text: "Source" }), h("dd", {}, docLink("docs/tasks/run-report.md", run.source)),
        h("dt", { text: "Date" }), h("dd", { text: run.date || "not stated" }),
        h("dt", { text: "Tests" }), h("dd", { text: run.pass === null ? "not found" : run.pass + " pass, " + (run.fail === null ? "?" : run.fail) + " fail" + (run.tests ? ", " + run.tests + " tests in " + run.files + " files" : "") }),
        h("dt", { text: "check-tasks" }), h("dd", { text: run.checkTasks || "not found" }),
        h("dt", { text: "Links" }), h("dd", { text: run.links || "not found" }))));
      root.appendChild(h("p", { class: "muted small", text: "This is text recorded in a file, not a fresh run. Compare it with the static count below." }));
    } else root.appendChild(h("p", { class: "muted", text: "docs/tasks/run-report.md not found." }));
    root.appendChild(h("p", {}, "Counted now, without running anything: ", h("strong", { text: D.checks.staticTestFiles + " test files" }), " and ", h("strong", { text: D.checks.staticTestCalls + " test( calls" }), "."));
    root.appendChild(h("h2", { text: "Commands to re-run each check" }));
    D.checks.commands.forEach(function (c) { root.appendChild(h("div", { class: "panel" }, h("strong", { text: c.label }), cmdBlock(c.cmd))); });
    root.appendChild(h("h2", { text: "CI (declared, not run)" }));
    D.ci.forEach(function (w) {
      root.appendChild(h("div", { class: "panel" }, h("strong", { text: w.name }), " ", h("span", { class: "mono muted", text: w.file }), " ", pill("declared, not run", "warn"),
        h("p", { class: "small", text: "Triggers: " + (w.triggers.join(" ") || "n/a") }),
        w.jobs.map(function (j) {
          return h("div", {}, h("h3", { text: "Job " + j.id + " on " + (j.runsOn || "n/a") }), j.matrix.length ? h("p", { class: "small mono", text: j.matrix.join("; ") }) : "", h("ul", { class: "plain" }, j.runs.map(function (r) { return h("li", { class: "mono small", text: r }); })));
        })));
    });
    var v = D.verification;
    root.appendChild(h("h2", { text: "UNVERIFIED items (" + v.unverifiedCount + ")" }));
    v.unverified.forEach(function (sec) {
      var det = h("details");
      det.appendChild(h("summary", {}, h("strong", { text: sec.section }), " (" + sec.items.length + ")"));
      det.appendChild(table(["#", "Item", "What would verify it"], sec.items.map(function (i) { return tr([i.n, i.item, i.verify]); })));
      root.appendChild(det);
    });
    root.appendChild(h("h2", { text: "Research log: lines marked UNVERIFIED (" + v.researchLogUnverified.total + ")" }));
    root.appendChild(h("ul", { class: "plain" }, v.researchLogUnverified.bySection.map(function (s) { return h("li", { text: s.section + ": " + s.count }); })));
    root.appendChild(h("h2", { text: "Not run by the author (docs/manual-test.md): " + v.manual.length }));
    root.appendChild(h("ul", { class: "plain amber" }, v.manual.map(function (m) { return h("li", {}, h("strong", { text: m.heading + ": " }), m.text, h("span", { class: "muted small", text: " (line " + m.line + ")" })); })));
    var claims = [];
    v.unverified.forEach(function (s) { s.items.forEach(function (i) { if (i.claim) claims.push(i); }); });
    root.appendChild(h("h2", { text: "Claims that need a real install (" + claims.length + ")" }));
    root.appendChild(h("ul", { class: "plain amber" }, claims.map(function (c) { return h("li", {}, h("strong", { text: "#" + c.n + " " }), c.item, h("div", { class: "muted small", text: "Would verify: " + c.verify })); })));
    return root;
  }

  // ---- Next ----
  function nextTab() {
    var root = h("div");
    root.appendChild(h("p", { class: "muted", text: "Eligible means todo with every dependency validated. Order: unblocks the most open tasks, then phase (P0 first), then fewest files to touch." }));
    root.appendChild(h("h2", { text: "Eligible tasks (" + D.next.eligible + ")" }));
    root.appendChild(table(["#", "Task", "Title", "Phase", "Why this rank"], D.next.ranked.map(function (r) { return tr([String(r.rank), taskLink(r.id), r.title, r.phase, r.reason]); })));
    root.appendChild(h("h2", { text: "Blocked todo tasks (" + D.next.blocked.length + ")" }));
    root.appendChild(h("ul", { class: "plain" }, D.next.blocked.map(function (b) { return h("li", {}, taskLink(b.id), " waits for ", b.blockedBy.map(function (x) { return [taskLink(x), " "]; })); })));
    root.appendChild(h("h2", { text: "Steps only the owner can do (found by text search in task files)" }));
    root.appendChild(D.next.ownerSteps.length ? h("ul", { class: "plain amber" }, D.next.ownerSteps.map(function (o) { return h("li", {}, taskLink(o.id), " ", pill(o.status), o.lines.map(function (l) { return h("div", { class: "small", text: l }); })); })) : h("p", { class: "muted", text: "None found." }));
    return root;
  }

  // ---- Git ----
  function gitTab() {
    var root = h("div");
    var g = D.git;
    if (!g.available) { root.appendChild(h("p", { text: "git: n/a" })); } else {
      root.appendChild(h("dl", { class: "dl" },
        h("dt", { text: "Branch" }), h("dd", { class: "mono", text: g.branch }),
        h("dt", { text: "HEAD" }), h("dd", { class: "mono", text: g.head }),
        h("dt", { text: "Ahead / behind origin/main" }), h("dd", { text: g.ahead === null ? "n/a (no origin/main)" : g.ahead + " ahead, " + g.behind + " behind" }),
        h("dt", { text: "Uncommitted files" }), h("dd", { text: String(g.uncommitted) })));
      root.appendChild(h("h2", { text: "Last 15 commits" }));
      root.appendChild(table(["SHA", "Date", "Subject"], g.commits.map(function (c) { return tr([h("span", { class: "mono", text: c.sha }), c.date, c.subject]); })));
      root.appendChild(h("h2", { text: "Worktrees (" + g.worktrees.length + ")" }));
      root.appendChild(h("ul", { class: "plain" }, g.worktrees.map(function (w) { return h("li", { class: "mono small", text: w }); })));
    }
    root.appendChild(h("h2", { text: "HTTP routes found by text search (" + D.source.routes.length + ")" }));
    root.appendChild(table(["Method", "Path", "Where"], D.source.routes.map(function (r) { return tr([r.method || "any", h("span", { class: "mono", text: r.path }), r.file + ":" + r.line]); })));
    root.appendChild(h("h2", { text: "CLI commands from bin/aletheia.mjs (" + D.source.cli.length + ")" }));
    root.appendChild(h("ul", { class: "plain" }, D.source.cli.map(function (c) { return h("li", {}, h("span", { class: "mono", text: c.usage }), c.note ? h("div", { class: "muted small", text: c.note }) : ""); })));
    return root;
  }

  var RENDER = { Overview: overview, Tasks: tasksTab, Features: featuresTab, Docs: docsTab, Verification: verificationTab, Next: nextTab, Git: gitTab };

  // ---- shell ----
  var app = document.getElementById("app");
  var tabBar, panel;
  function theme(mode) {
    var r = document.documentElement;
    if (mode === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", mode);
    try { localStorage.setItem("status-theme", mode); } catch (e) { /* storage may be blocked */ }
  }
  function go(tab) {
    state.tab = tab;
    try { history.replaceState(null, "", "#" + tab.toLowerCase()); } catch (e) { /* file URLs may refuse */ }
    Array.prototype.forEach.call(tabBar.children, function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === tab ? "true" : "false"); b.tabIndex = b.getAttribute("data-tab") === tab ? 0 : -1; });
    panel.textContent = "";
    panel.appendChild(RENDER[tab]());
    panel.setAttribute("aria-labelledby", "tab-" + tab);
  }
  function build() {
    var stale = D.git.available && D.git.uncommittedDocs && D.git.uncommittedDocs.length;
    var header = h("header", { class: "top" },
      h("h1", { text: "Aletheia project status" }),
      h("div", { class: "meta" }, "generated at " + when(D.generatedAt) + " from commit " + D.commit + " "));
    var tg = h("button", { class: "btn", type: "button", text: "Theme: auto", "aria-label": "Change colour theme" });
    var modes = ["auto", "light", "dark"], mi = 0;
    try { var saved = localStorage.getItem("status-theme"); if (saved && modes.indexOf(saved) >= 0) { mi = modes.indexOf(saved); theme(saved); tg.textContent = "Theme: " + saved; } } catch (e) { /* ignore */ }
    tg.addEventListener("click", function () { mi = (mi + 1) % 3; theme(modes[mi]); tg.textContent = "Theme: " + modes[mi]; });
    header.lastChild.appendChild(tg);
    app.appendChild(header);
    var main = h("div", { class: "wrap" });
    if (stale) main.appendChild(h("div", { class: "banner", role: "status", text: "stale? " + D.git.uncommittedDocs.length + " tracked doc file(s) had uncommitted changes when this page was generated: " + D.git.uncommittedDocs.slice(0, 5).join(", ") + (D.git.uncommittedDocs.length > 5 ? " ..." : "") }));
    tabBar = h("nav", { class: "tabs", role: "tablist", "aria-label": "Sections" });
    TABS.forEach(function (name, i) {
      var b = h("button", { type: "button", role: "tab", id: "tab-" + name, "data-tab": name, text: name });
      b.addEventListener("click", function () { go(name); });
      b.addEventListener("keydown", function (e) {
        var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = TABS[(i + d + TABS.length) % TABS.length]; go(n); document.getElementById("tab-" + n).focus();
      });
      tabBar.appendChild(b);
    });
    app.appendChild(tabBar);
    panel = h("main", { role: "tabpanel", tabindex: "0" });
    app.appendChild(main);
    app.appendChild(panel);
    app.appendChild(h("footer", { class: "muted small" }, "Computed from the repository's files at generation time. Test results are the last recorded run, not a fresh run. Regenerate with ", h("code", { text: "bun scripts/gen-status.mjs" }), "."));
    var first = (location.hash || "").replace("#", "");
    var start = TABS.filter(function (t) { return t.toLowerCase() === first; })[0] || "Overview";
    go(start);
  }
  build();
})();
