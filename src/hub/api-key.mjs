// The optional API key (ALETHEIA_API_KEY). When it is set, every /api/* and /v1/* route needs
// `Authorization: Bearer <key>`: those routes return memory or change data. Static files, /health, /healthz and the
// remote-login routes stay open. A browser cannot set that header on a WebSocket, so the dashboard trades the key for a
// short-lived, single-use ticket (POST /v1/live/ticket) and offers the ticket as a WebSocket subprotocol. The key never
// travels in a URL or in a header other than Authorization.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const KEY_REQUIRED = "A valid bearer key is required.";
/** Remote mode: the tool API needs a login session (browser) or the API key (tools). */
export const REMOTE_AUTH_REQUIRED = "This server is in remote mode: log in, or send the API key (ALETHEIA_API_KEY) as a bearer token.";
/** Marks a 401 as "send the API key", so the dashboard can tell it from a remote-login "session required" 401. */
export const KEY_CHALLENGE = { "WWW-Authenticate": 'Bearer realm="aletheia"' };
export const LIVE_PROTOCOL = "aletheia.live";
const TICKET_PREFIX = "aletheia.ticket.";
const OPEN_API = new Set(["/api/login", "/api/logout"]);

const digest = (value) => createHash("sha256").update(String(value)).digest();

/** True when no key is set, or the request carries `Authorization: Bearer <key>`. Compares hashes in constant time. */
export function bearerMatches(request, key) {
  if (!key) return true;
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  return !!match && timingSafeEqual(digest(match[1].trim()), digest(key));
}

/** Paths the key guards: every /api and /v1 route except login and logout. /v1/live takes a ticket as well. */
export const keyGuards = (path) => (path.startsWith("/api/") && !OPEN_API.has(path)) || path.startsWith("/v1/");

const offeredProtocols = (request) => (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((part) => part.trim()).filter(Boolean);

/** Upgrade headers for /v1/live: a client that offers the live protocol gets it back, as the WebSocket spec needs. */
export const liveUpgradeHeaders = (request) => (offeredProtocols(request).includes(LIVE_PROTOCOL) ? { "Sec-WebSocket-Protocol": LIVE_PROTOCOL } : undefined);

/** One-time tickets for the live socket. Each lasts `ttlMs` and works once. */
export function createLiveTickets({ ttlMs = 30_000, max = 256, now = Date.now } = {}) {
  const tickets = new Map(); // ticket -> expiry
  const prune = () => {
    const at = now();
    for (const [ticket, expiresAt] of tickets) if (expiresAt <= at) tickets.delete(ticket);
    while (tickets.size >= max) tickets.delete(tickets.keys().next().value);
  };
  return {
    issue() {
      prune();
      const ticket = randomBytes(24).toString("hex");
      tickets.set(ticket, now() + ttlMs);
      return { ticket, protocol: LIVE_PROTOCOL, expiresInMs: ttlMs };
    },
    /** Consume the ticket the request offers in Sec-WebSocket-Protocol. True once per ticket, before it expires. */
    redeem(request) {
      const offer = offeredProtocols(request).find((part) => part.startsWith(TICKET_PREFIX));
      if (!offer) return false;
      const ticket = offer.slice(TICKET_PREFIX.length);
      const expiresAt = tickets.get(ticket);
      tickets.delete(ticket);
      return expiresAt !== undefined && expiresAt > now();
    },
  };
}
