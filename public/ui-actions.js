// Optimistic actions and long tasks (T-207, T-208). An action changes the screen first, sends the request, and
// rolls the screen back if the request fails. When it succeeds, an Undo toast stays for 8 seconds.
import { progressBar, toast, undoToast } from "./ui-components.js";
import { h } from "./ui-dom.js";

export const UNDO_MS = 8000;

/**
 * optimistic({ apply, rollback, request, done, undo })
 *   apply()     change the screen now.
 *   request()   the API call. If it throws, rollback() runs and an error toast says why.
 *   rollback()  put the screen back.
 *   done        text for the Undo toast (omit for no toast).
 *   undo()      the API call that reverses the action. If it fails, a toast says so and nothing else changes.
 *   reapply()   (optional) run after a successful undo instead of rollback(), for example to reload a list.
 * Resolves true when the request succeeded.
 */
export async function optimistic({ apply, rollback, request, done = null, undo = null, reapply = null, failure = "That did not work." }) {
  apply?.();
  try {
    await request();
  } catch (error) {
    rollback?.();
    toast(error?.message ? `${failure} ${error.message}` : failure, { tone: "danger" });
    return false;
  }
  if (done) {
    if (undo) {
      undoToast(done, async () => {
        try {
          await undo();
          (reapply ?? rollback)?.();
        } catch (error) {
          toast(`Could not undo. ${error?.message ?? ""}`.trim(), { tone: "danger" });
        }
      }, { duration: UNDO_MS });
    } else {
      toast(done, { tone: "success", duration: 2500 });
    }
  }
  return true;
}

/**
 * A progress bar for a long call (import, export, prune report, back-fill). The server only reports counts when the
 * call finishes, so the bar is indeterminate while it runs and then shows the counts. Never blocks the page.
 * `task(report)` may call report({ value, max, text }) if the API ever streams counts.
 */
export async function withProgress(container, { label, task, summarize = null }) {
  const bar = progressBar({ label, text: "Working…" });
  const wrap = h("div", { class: "ui-longtask", role: "group", "aria-label": label }, h("div", { class: "ui-meta" }, label), bar);
  container.replaceChildren(wrap);
  try {
    const result = await task((next) => bar.update(next));
    bar.update({ value: 1, max: 1, text: summarize ? summarize(result) : "Done" });
    return result;
  } catch (error) {
    bar.update({ value: 0, max: 1, text: `Failed: ${error?.message ?? "unknown error"}` });
    wrap.classList.add("is-failed");
    throw error;
  }
}
