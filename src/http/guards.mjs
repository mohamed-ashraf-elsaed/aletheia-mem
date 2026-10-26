// Request guards. The view exposes private work history, so it answers only the local machine.
//   localOnly      peer is loopback, Host header is a loopback name, and no proxy headers are present
//   sameOriginJson state-changing calls come from the viewer itself: not cross-site, JSON body
//   crossOrigin    an Origin header that is not this server's own loopback origin
const LOOPBACK_PEERS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"]);
const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "::1"]);

export function hostName(hostHeader) {
  const value = String(hostHeader ?? "").trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end === -1 ? value : value.slice(1, end);
  }
  const colon = value.lastIndexOf(":");
  return colon > -1 && /^\d+$/.test(value.slice(colon + 1)) ? value.slice(0, colon) : value;
}

const hasProxyHeaders = (headers) => !!(headers.get("forwarded") || headers.get("x-forwarded-for") || headers.get("x-forwarded-host") || headers.get("x-real-ip"));

export function isLocalRequest(request, peerAddress) {
  return LOOPBACK_PEERS.has(peerAddress ?? "") && LOOPBACK_NAMES.has(hostName(request.headers.get("host"))) && !hasProxyHeaders(request.headers);
}

/** True when the Origin header is present and is not exactly this server's own loopback origin. */
export function isCrossOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return true;
  }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return true;
  const host = request.headers.get("host");
  if (!host) return true;
  const hostParts = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(host.trim().toLowerCase());
  if (!hostParts) return true;
  const name = hostParts[1].replace(/^\[|\]$/g, "");
  const port = hostParts[2] ?? "80";
  return LOOPBACK_NAMES.has(name) ? (url.port || "80") !== port : true;
}

export function isSameOriginJson(request) {
  const contentType = request.headers.get("content-type") ?? "";
  return request.headers.get("sec-fetch-site") !== "cross-site" && !isCrossOrigin(request) && /^application\/json\b/i.test(contentType);
}
