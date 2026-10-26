// The status bar (T-206): nine indicators, a connection banner, polling that backs off and pauses when the page is
// hidden, and the /v1/live WebSocket when it is available. createStatusController() holds the logic and takes its
// timers, network and socket as arguments so it can be tested; mountStatus() draws it. Every value comes from an API
// answer (see ui-status-model.js).
import { banner, copyText, iconButton, icon, popover, statusDot, toast } from "./ui-components.js";
import { faviconHref } from "./ui-brand.js";
import { healthView } from "./ui-core.js";
import { h, state, swap } from "./ui-dom.js";
import { enter, leave, shake } from "./ui-motion.js";
import { nextPollDelay, updatedAgo } from "./ui-pure.js";
import { bannerText, buildIndicators, frameKind, newErrors, overallState, recovered, retryDelaySeconds } from "./ui-status-model.js";

export const POLL_MS = { live: 30_000, polling: 10_000, max: 60_000 };
const SOCKET_RETRY_MS = [5_000, 10_000, 20_000, 60_000];

export function setFaviconState(kind, doc = globalThis.document) {
  const link = doc?.getElementById?.("ui-favicon");
  if (!link) return;
  link.setAttribute("type", "image/svg+xml");
  link.setAttribute("href", faviconHref(kind));
}

/** A request that resolves { ok, status, data } for any HTTP answer and rejects only when the network fails. */
export async function rawJson(path, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(path, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

/**
 * The logic. deps: { fetchJson(path), now(), isHidden(), project(), openSocket(project), timers: { set, clear },
 * onChange(snapshot), onConnection(info) }. Returns { start, stop, refresh, snapshot, setProject, visibilityChanged }.
 */
export function createStatusController(deps) {
  const { fetchJson, now, isHidden, project, openSocket, timers, onChange, onConnection } = deps;
  const data = { health: null, work: null, sync: null, overview: null };
  let live = "off";
  let offline = false;
  let failures = 0;
  let refreshing = false;
  let updatedAt = null;
  let pollTimer = null;
  let retryTimer = null;
  let countdownTimer = null;
  let socket = null;
  let socketTimer = null;
  let socketFailures = 0;
  let frameTimer = null;
  let overviewAge = Infinity;
  let previous = [];
  let started = false;
  let attempt = 0;
  let inFlight = null;

  const snapshot = () => {
    const indicators = buildIndicators({ ...data, live, offline, now: now() });
    return { indicators, offline, live, refreshing, updatedAt, overall: overallState(indicators, { refreshing }), attempt };
  };
  const emit = () => {
    const next = snapshot();
    onChange({ ...next, newErrors: newErrors(previous, next.indicators), recovered: recovered(previous, next.indicators) });
    previous = next.indicators;
  };

  const withProject = (path) => (project() ? `${path}${path.includes("?") ? "&" : "?"}project=${encodeURIComponent(project())}` : path);

  async function pull({ light = false } = {}) {
    // A light refresh (after a live frame) skips the health check, which runs a database quick check.
    const jobs = [
      light ? Promise.resolve(null) : fetchJson("/v1/health"),
      fetchJson(withProject("/v1/work?sessions=1&facts=1&review=1")),
      fetchJson("/api/hub/sync/status?limit=100"),
    ];
    if (overviewAge >= 6) jobs.push(fetchJson("/api/hub/overview"));
    const settled = await Promise.allSettled(jobs);
    const networkDown = (result) => result.status === "rejected";
    const [healthR, workR, syncR, overviewR] = settled;
    if (!light && networkDown(healthR)) return { down: true };
    if (!light && healthR.status === "fulfilled" && healthR.value.data) data.health = healthR.value.data;
    if (workR.status === "fulfilled" && workR.value.ok) data.work = workR.value.data;
    if (syncR.status === "fulfilled") data.sync = syncR.value.ok ? syncR.value.data : { error: syncR.value.data?.error ?? `HTTP ${syncR.value.status}` };
    else if (!light) data.sync = { error: "The sync status request failed." };
    if (overviewR) {
      overviewAge = 0;
      if (overviewR.status === "fulfilled" && overviewR.value.ok) data.overview = overviewR.value.data;
    } else overviewAge += 1;
    return { down: false };
  }

  async function refresh({ light = false } = {}) {
    if (inFlight) return inFlight;
    refreshing = true;
    emit();
    inFlight = (async () => {
      let result;
      try {
        result = await pull({ light });
      } catch {
        result = { down: true };
      }
      refreshing = false;
      if (result.down) {
        failures += 1;
        attempt += 1;
        if (!offline) { offline = true; }
        emit();
        startCountdown();
        return;
      }
      if (offline) { offline = false; attempt = 0; stopCountdown(); onConnection({ up: true, recovered: true }); }
      failures = 0;
      updatedAt = now();
      state.health = data.health?.status === "ok" ? "ok" : data.health ? "down" : state.health;
      emit();
      schedule();
      if (!socket) connectSocket();
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  function schedule() {
    timers.clear(pollTimer);
    pollTimer = null;
    const delay = nextPollDelay({ base: live === "on" ? POLL_MS.live : POLL_MS.polling, max: POLL_MS.max, failures, hidden: isHidden() });
    if (delay != null) pollTimer = timers.set(() => refresh(), delay);
  }

  function stopCountdown() {
    timers.clear(retryTimer);
    timers.clear(countdownTimer);
    retryTimer = countdownTimer = null;
  }
  function startCountdown() {
    stopCountdown();
    const wait = retryDelaySeconds(attempt);
    let left = wait;
    onConnection({ up: false, secondsLeft: left, attempt, text: bannerText(left, attempt) });
    countdownTimer = timers.set(function tick() {
      left -= 1;
      onConnection({ up: false, secondsLeft: Math.max(0, left), attempt, text: bannerText(Math.max(0, left), attempt) });
      if (left > 0) countdownTimer = timers.set(tick, 1000);
    }, 1000);
    retryTimer = timers.set(() => { refresh(); }, wait * 1000);
  }

  function connectSocket() {
    if (!openSocket || isHidden() || socket) return;
    try {
      socket = openSocket(project());
    } catch {
      socket = null;
      return;
    }
    socket.onopen = () => { live = "on"; socketFailures = 0; emit(); schedule(); };
    socket.onmessage = (event) => {
      if (!frameKind(event.data)) return;
      timers.clear(frameTimer);
      frameTimer = timers.set(() => refresh({ light: true }), 400);
    };
    socket.onclose = () => {
      socket = null;
      const was = live;
      live = "off";
      if (was === "on") { emit(); schedule(); }
      if (!started) return;
      const wait = SOCKET_RETRY_MS[Math.min(socketFailures, SOCKET_RETRY_MS.length - 1)];
      socketFailures += 1;
      timers.clear(socketTimer);
      socketTimer = timers.set(() => connectSocket(), wait);
    };
    socket.onerror = () => {};
  }

  return {
    start() { started = true; return refresh(); },
    stop() {
      started = false;
      for (const timer of [pollTimer, retryTimer, countdownTimer, socketTimer, frameTimer]) timers.clear(timer);
      socket?.close?.();
      socket = null;
    },
    refresh: () => { stopCountdown(); return refresh(); },
    snapshot,
    /** The project changed: reconnect the socket for the new scope and pull again. */
    setProject() { socket?.close?.(); socket = null; live = "off"; return refresh(); },
    /** Called when the page is shown or hidden. Showing pulls at once; hiding stops the timers. */
    visibilityChanged() {
      if (isHidden()) { timers.clear(pollTimer); pollTimer = null; return; }
      if (started) { refresh(); if (!socket) connectSocket(); }
    },
  };
}

// ---- the DOM ---------------------------------------------------------------------------------------------

const STATE_WORD = { ok: "ok", working: "working", warn: "needs attention", error: "problem", idle: "idle", unknown: "checking" };

function popoverContent(entry) {
  return h("div", { class: "ui-status-pop" },
    h("h3", {}, entry.label),
    h("p", { class: "ui-status-pop-sum" }, entry.summary),
    entry.details.length ? h("ul", { class: "ui-detail-list" }, ...entry.details.map((line) => h("li", {}, line))) : null,
    entry.fix ? h("div", {}, h("div", { class: "ui-meta" }, "To fix or change this, run:"), h("div", { class: "ui-command" }, h("code", { class: "ui-mono" }, entry.fix), iconButton({ icon: "copy", label: "Copy command", onClick: () => copyText(entry.fix) }))) : null);
}

export function mountStatus({ el, healthEl, bannerSlot = globalThis.document?.getElementById?.("ui-banner-slot"), announce = () => {}, getProject = () => state.project, doc = globalThis.document, win = globalThis }) {
  const nodes = new Map();
  const popovers = new Map();
  let latest = { indicators: [], updatedAt: null, refreshing: false };
  let bannerEl = null;

  const updatedLabel = h("span", { class: "ui-status-updated ui-meta", "aria-live": "off" }, "not yet updated");
  const spinIcon = icon("refresh", { size: 16 });
  const refreshButton = h("button", { class: "ui-btn ui-btn-ghost ui-btn-sm ui-btn-icononly ui-status-refresh", type: "button", "aria-label": "Refresh the status now", title: "Refresh the status now" }, spinIcon);
  const right = h("div", { class: "ui-status-right" }, updatedLabel, refreshButton);
  const list = h("div", { class: "ui-status-list" });
  swap(el, list, right);

  function ensure(entry) {
    let node = nodes.get(entry.id);
    if (node) return node;
    const dot = statusDot(entry.state);
    const text = h("span", { class: "ui-status-text" }, entry.label);
    const word = h("span", { class: "ui-sr" }, STATE_WORD[entry.state]);
    const anchor = h("button", { class: "ui-status-item", type: "button", "data-status": entry.id }, dot, text, word);
    node = { anchor, dot, text, word };
    nodes.set(entry.id, node);
    const pop = popover({ anchor, content: () => popoverContent(latest.indicators.find((candidate) => candidate.id === entry.id) ?? entry), label: `${entry.label} details`, placement: "bottom", toggleOnClick: false });
    popovers.set(entry.id, pop);
    // Hover opens the details too; a click or Enter pins them open for keyboard and touch use.
    anchor.addEventListener("mouseenter", () => pop.open());
    anchor.addEventListener("mouseleave", () => { if (anchor.getAttribute("data-pinned") !== "1") setTimeout(() => { if (!anchor.matches?.(":hover") && !pop.el.matches?.(":hover")) pop.close(); }, 160); });
    // A click pins the details open (for touch and keyboard); another click lets go.
    anchor.addEventListener("click", () => {
      const pinned = anchor.getAttribute("data-pinned") === "1";
      anchor.setAttribute("data-pinned", pinned ? "" : "1");
      if (pinned) pop.close(); else pop.open();
    });
    anchor.addEventListener("focus", () => pop.open());
    anchor.addEventListener("blur", () => setTimeout(() => { if (!pop.el.contains?.(doc.activeElement) && anchor.getAttribute("data-pinned") !== "1") pop.close(); }, 120));
    list.append(anchor);
    return node;
  }

  function showBanner(info) {
    if (!bannerSlot) return;
    if (info.up) {
      if (info.recovered) toast("Reconnected to the Aletheia server.", { tone: "success", duration: 2500 });
      if (bannerEl) { const old = bannerEl; bannerEl = null; leave(old).then(() => old.remove?.()); }
      return;
    }
    if (!bannerEl) {
      bannerEl = banner({ tone: "danger", text: info.text, action: { label: "Retry now", onClick: () => controller.refresh() } });
      bannerSlot.append(bannerEl);
      enter(bannerEl);
    } else bannerEl.setText(info.text);
  }

  const controller = createStatusController({
    fetchJson: (path) => rawJson(path, win.fetch.bind(win)),
    now: () => Date.now(),
    isHidden: () => doc.visibilityState === "hidden",
    project: getProject,
    openSocket: typeof win.WebSocket === "function" ? (project) => new win.WebSocket(`${win.location.protocol === "https:" ? "wss" : "ws"}://${win.location.host}/v1/live${project ? `?project=${encodeURIComponent(project)}` : ""}`) : null,
    timers: { set: (fn, ms) => win.setTimeout(fn, ms), clear: (id) => win.clearTimeout(id) },
    onConnection: showBanner,
    onChange(snap) {
      latest = snap;
      for (const entry of snap.indicators) {
        const node = ensure(entry);
        node.dot.className = `ui-dot is-${entry.state}`;
        node.text.textContent = entry.label;
        node.word.textContent = STATE_WORD[entry.state];
        node.anchor.setAttribute("aria-label", `${entry.label}: ${STATE_WORD[entry.state]}`);
        popovers.get(entry.id)?.refresh();
      }
      list.classList.toggle("is-stale", snap.offline);
      refreshButton.classList.toggle("is-spinning", snap.refreshing);
      refreshButton.setAttribute("aria-busy", String(snap.refreshing));
      for (const entry of snap.newErrors) { const node = nodes.get(entry.id); if (node) shake(node.anchor); announce(`${entry.label} has a problem. ${entry.summary}`); }
      for (const entry of snap.recovered) announce(`${entry.label} is back to normal.`);
      const view = healthView(state.health);
      healthEl.className = `ui-health ${view.state} ui-sr`;
      healthEl.textContent = view.dot;
      healthEl.setAttribute("aria-label", view.label);
      setFaviconState(snap.overall, doc);
      tickUpdated();
    },
  });

  const tickUpdated = () => { updatedLabel.textContent = latest.updatedAt ? updatedAgo(latest.updatedAt) : latest.offline ? "offline" : "not yet updated"; };
  const ticker = win.setInterval(() => { if (doc.visibilityState !== "hidden") tickUpdated(); }, 1000);
  refreshButton.addEventListener("click", () => controller.refresh());
  doc.addEventListener("visibilitychange", () => controller.visibilityChanged());
  controller.start();
  return {
    refresh: () => controller.refresh(),
    setProject: () => controller.setProject(),
    stop: () => { controller.stop(); win.clearInterval(ticker); },
    controller,
  };
}
