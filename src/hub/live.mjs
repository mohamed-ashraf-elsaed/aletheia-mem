// Advisory live frames over WebSocket (T-105). A connected browser is told "something changed, re-poll";
// the 10-second poll remains the source of truth. Frames carry ids and kinds only, never payload text.
export function createLiveHub(hub) {
  const sockets = new Set();
  const isDismissed = (type, id) => (id == null ? false : !!hub.db.prepare("SELECT 1 FROM dismissals WHERE item_type = ? AND item_id = ?").get(type, id));

  /** Send a frame to every socket whose project scope includes it and whose target is not dismissed. */
  function broadcast(frame) {
    const text = JSON.stringify(frame);
    for (const ws of sockets) {
      const scope = ws.data?.project ?? null;
      if (scope && frame.project && scope !== frame.project) continue;
      if (frame.kind === "fact" && isDismissed("fact", frame.id)) continue;
      if (frame.kind === "session" && isDismissed("memory", frame.id)) continue;
      try {
        ws.send(text);
      } catch {
        sockets.delete(ws);
      }
    }
  }

  return {
    sockets,
    broadcast,
    add(ws, data = {}) {
      ws.data = data;
      sockets.add(ws);
    },
    remove(ws) {
      sockets.delete(ws);
    },
  };
}
