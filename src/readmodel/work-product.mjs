// Work product: what a request produced. Commits, branches and pull requests are read out of recorded Bash
// calls; documents and deployments out of recorded MCP calls; files out of observations; links and files out
// of work-state fields. Port of the original work-product.mjs.
import { statSync } from "node:fs";
import { basename, extname, isAbsolute } from "node:path";

export const FILE_KINDS = {
  ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".gif": "image", ".svg": "image",
  ".mp4": "video", ".mov": "video", ".webm": "video",
  ".pdf": "document", ".docx": "document", ".pptx": "deck", ".key": "deck",
  ".xlsx": "spreadsheet", ".csv": "spreadsheet", ".html": "page",
};

export const MIME_TYPES = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".pdf": "application/pdf", ".html": "text/html; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".key": "application/octet-stream",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
};

const MCP_PRODUCTS = [
  { match: /^Artifact$/, kind: "artifact" },
  { match: /notion-create-pages$/, kind: "page" },
  { match: /Claude_Docs__(?:batch|create)$/, kind: "document" },
  { match: /chatgpt_space__create_page$/, kind: "page" },
  { match: /sites__save_version_and_deploy/, kind: "deployment" },
];
export const WORK_PRODUCT_FIELDS = new Set(["work_product", "work_products", "deliverable", "deliverables"]);
const LINK_FIELD_KINDS = {
  docs_url: "documentation", documentation_url: "documentation", promo_url: "promotion", announcement_url: "promotion",
  pr_url: "pull-request", deck_url: "deck", artifact_url: "artifact",
};

const title140 = (value) => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? (text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text) : null;
};

export function safeHttpUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export const isSafeAbsolutePath = (value, abs = isAbsolute) =>
  typeof value === "string" && abs(value) && !value.includes("\0") && !value.split(/[\\/]/).includes("..");

export const fileKindOf = (path) => (isSafeAbsolutePath(path) ? (FILE_KINDS[extname(path).toLowerCase()] ?? null) : null);

function urlKind(url, fallback) {
  const { hostname, pathname } = new URL(url);
  if (hostname === "github.com" && /\/pull\/\d+/.test(pathname)) return "pull-request";
  if (/\.(?:vercel\.app|netlify\.app|pages\.dev)$/.test(hostname)) return "deployment";
  return FILE_KINDS[extname(pathname).toLowerCase()] ?? fallback;
}

export function parseMaybeJson(value) {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectUrls(value, out = []) {
  if (typeof value === "string") {
    const url = safeHttpUrl(value);
    if (url) out.push(url);
  } else if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) if (/url$/i.test(key) || typeof item === "object") collectUrls(item, out);
  }
  return out;
}

const GIT = String.raw`(?:^|[;&|(\n])\s*(?:rtk\s+)?(?:\/usr\/bin\/)?git(?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+))*\s+`;
const gitRe = (tail, flags = "") => new RegExp(GIT + tail, flags);
const GITHUB_REMOTE = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const SHA = "[0-9a-f]{7,40}";
const unquote = (s) => s.replace(/^(["'])(.*)\1$/, "$2");
const repoOfRemote = (remote) => {
  const m = typeof remote === "string" ? remote.trim().match(GITHUB_REMOTE) : null;
  return m ? `${m[1]}/${m[2]}` : null;
};
const githubUrl = (item) =>
  item.repo ? (item.kind === "commit" ? `https://github.com/${item.repo}/commit/${item.sha}` : `https://github.com/${item.repo}/tree/${item.branch}`) : undefined;

function responseText(toolUse, response) {
  if (typeof response === "string") return response;
  if (response && typeof response === "object") return [response.stdout, response.stderr].filter((s) => typeof s === "string").join("\n");
  return typeof toolUse.tool_response === "string" ? toolUse.tool_response : "";
}

function commitSubjects(command) {
  const starts = [...command.matchAll(gitRe(String.raw`commit\b`, "g"))].map((m) => m.index);
  return starts.map((start, i) => {
    const segment = command.slice(start, starts[i + 1]);
    const dash = segment.match(/\s-[a-zA-Z]*m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/);
    const heredoc = segment.match(/\s-F\s+-\s*<<-?\s*['"]?\w+['"]?\n([^\n]*)/);
    const message = dash ? (dash[1] ?? dash[2]).replace(/\\(.)/g, "$1") : heredoc?.[1];
    return title140(message?.split("\n")[0]);
  });
}

function parseCommits(command, response, output) {
  const found = new Map();
  const add = (sha, branch, subject) => {
    const key = sha.slice(0, 7);
    const prev = found.get(key);
    found.set(key, { sha: prev?.sha.length > sha.length ? prev.sha : sha, branch: branch ?? prev?.branch ?? null, subject: subject ?? prev?.subject ?? null });
  };
  const hint = response?.gitOperation?.commit;
  const subjects = commitSubjects(command);
  if (!subjects.length && !hint?.sha) return [];
  for (const [, ref, sha, subject] of output.matchAll(new RegExp(String.raw`^\[(.+?)(?: \(root-commit\))? (${SHA})\] (.+)$`, "gm"))) {
    add(sha, ref.startsWith("detached HEAD") ? null : ref, title140(subject));
  }
  if (typeof hint?.sha === "string" && new RegExp(`^${SHA}$`).test(hint.sha)) add(hint.sha, typeof hint.branch === "string" ? hint.branch : null, null);
  if (!found.size) {
    const okSha = subjects.length === 1 ? output.match(new RegExp(`^ok (${SHA})$`, "m"))?.[1] : null;
    if (okSha) add(okSha, null, subjects[0]);
    else {
      const lines = [...output.matchAll(new RegExp(`^(${SHA}) (.+)$`, "gm"))].map(([, sha, subj]) => [sha, title140(subj)]);
      for (const subject of subjects) {
        const hit = subject && lines.find(([, s]) => s === subject);
        if (hit) add(hit[0], null, subject);
      }
    }
  }
  return [...found.values()];
}

function pushTarget(command) {
  const args = (command.match(gitRe(String.raw`push((?:[ \t]+(?:"[^"]*"|'[^']*'|[^\s;&|)]+))*)`))?.[1] ?? "")
    .trim().split(/\s+/).filter(Boolean).map(unquote);
  if (args.some((a) => ["-d", "--delete", "--tags", "--mirror", "--all"].includes(a))) return null;
  const [remote, ref] = args.filter((a) => !a.startsWith("-"));
  const branch = ref && !ref.startsWith(":") ? ref.replace(/^\+/, "").split(":").at(-1).replace(/^refs\/heads\//, "") : null;
  return { repo: repoOfRemote(remote), branch: branch && branch !== "HEAD" ? branch : null };
}

function parsePushes(command, response, output) {
  const isPush = gitRe(String.raw`push\b`).test(command);
  const hintBranch = typeof response?.gitOperation?.push?.branch === "string" ? response.gitOperation.push.branch : null;
  if (!isPush && !hintBranch) return [];
  const target = isPush ? pushTarget(command) : null;
  const pushed = new Map();
  let repo = null;
  for (const line of output.split("\n")) {
    const to = line.match(/^To (\S+)$/);
    if (to) {
      repo = repoOfRemote(to[1]);
      continue;
    }
    const upd = line.match(new RegExp(String.raw`^\s*[ +*=]?\s*(?:${SHA}\.\.\.?(${SHA})|\[new branch\])\s+(\S+)\s+->\s+(\S+)`));
    if (!upd) continue;
    const branch = upd[3].replace(/^refs\/heads\//, "");
    pushed.set(branch, { branch, repo: repo ?? target?.repo ?? null, heads: upd[1] ? [upd[1]] : [] });
  }
  const fallback = hintBranch ?? target?.branch;
  if (!pushed.size && fallback && !/\[rejected\]|failed to push|^fatal:/m.test(output)) {
    pushed.set(fallback, { branch: fallback, repo: target?.repo ?? null, heads: [] });
  }
  return [...pushed.values()];
}

function parseNewBranches(command, output) {
  if (/^fatal:/m.test(output)) return [];
  return [...command.matchAll(gitRe(String.raw`(?:checkout\s+-[bB]|switch\s+-[cC])\s+("[^"]+"|'[^']+'|[^\s;&|)]+)`, "g"))].map((m) => ({ branch: unquote(m[1]), repo: null, heads: [] }));
}

function parsePullRequests(command, response, output, { atEpoch, sourceRef }) {
  if (!/(?:^|[;&|(\n])\s*(?:rtk\s+)?gh\s+pr\s+create\b/.test(command)) return [];
  const printed = output.match(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/m)?.[0];
  const url = safeHttpUrl(response?.gitOperation?.pr?.url ?? printed);
  if (!url) return [];
  const title = command.match(/--title\s+(?:"([^"]+)"|'([^']+)')/);
  return [{ kind: "pull-request", title: title140(title?.[1] ?? title?.[2]) ?? `PR #${url.split("/").at(-1)}`, url, atEpoch, sourceRef }];
}

function parseGit(command, response, output, { atEpoch = null, sourceRef = null } = {}) {
  const pushes = parsePushes(command, response, output);
  const branches = new Map([...parseNewBranches(command, output), ...pushes].map((b) => [b.branch, b]));
  const items = [];
  for (const commit of parseCommits(command, response, output)) {
    const push =
      (commit.branch && pushes.find((p) => p.branch === commit.branch)) ||
      pushes.find((p) => p.heads.some((h) => h.startsWith(commit.sha.slice(0, 7)))) ||
      (!commit.branch && pushes.length === 1 ? pushes[0] : null);
    items.push({
      kind: "commit",
      title: commit.subject ? `${commit.sha.slice(0, 7)} ${commit.subject}` : commit.sha.slice(0, 7),
      sha: commit.sha, branch: commit.branch ?? push?.branch ?? null, repo: push?.repo ?? null, atEpoch, sourceRef,
    });
  }
  for (const b of branches.values()) items.push({ kind: "branch", title: b.branch, branch: b.branch, repo: b.repo, heads: b.heads, atEpoch, sourceRef });
  return items.map((item) => ({ ...item, url: githubUrl(item) }));
}

/** Work product found in one recorded tool call. */
export function productFromToolUse(toolUse) {
  const input = parseMaybeJson(toolUse.tool_input) ?? {};
  const response = parseMaybeJson(toolUse.tool_response);
  const sourceRef = { kind: "tool-use", id: toolUse.id };
  const atEpoch = toolUse.created_at_epoch ?? null;
  if (toolUse.tool_name === "Bash" && typeof input.command === "string") {
    const output = responseText(toolUse, response);
    return [...parsePullRequests(input.command, response, output, { atEpoch, sourceRef }), ...parseGit(input.command, response, output, { atEpoch, sourceRef })];
  }
  const product = MCP_PRODUCTS.find((p) => p.match.test(toolUse.tool_name));
  if (!product || !response) return [];
  if (toolUse.tool_name === "Artifact" && (input.action ?? "publish") !== "publish") return [];
  if (toolUse.tool_name === "Artifact" && input.asset) return [];
  const urls = [...new Set(collectUrls(response))].filter((u) => !/\/(?:api|oauth)\//.test(new URL(u).pathname));
  const title = title140(response.title ?? input.title ?? input.name) ?? (isSafeAbsolutePath(input.file_path) ? basename(input.file_path) : null);
  return urls.slice(0, 1).map((url) => ({ kind: urlKind(url, product.kind), title: title ?? new URL(url).hostname, url, atEpoch, sourceRef }));
}

/** Files an observation modified that look like deliverables (images, decks, pages, ...). */
export function productFromObservation(observation) {
  const files = parseMaybeJson(observation.files_modified);
  if (!Array.isArray(files)) return [];
  return files.flatMap((path, index) => {
    const kind = fileKindOf(path);
    if (!kind) return [];
    const name = basename(path);
    const title = /^index\.\w+$/i.test(name) ? basename(path.slice(0, -name.length - 1)) || name : name;
    return [{ kind, title, path, atEpoch: observation.created_at_epoch ?? null, sourceRef: { kind: "observation", id: observation.id, index } }];
  });
}

export const isWorkProductField = (name) => WORK_PRODUCT_FIELDS.has(name) || /_url$/.test(name);

/** Work product declared in a work-state entry's fields (links and files). */
export function productFromFields(fields, { atEpoch = null, sourceRef = null } = {}) {
  const out = [];
  let index = 0;
  for (const [name, value] of Object.entries(fields ?? {})) {
    if (!isWorkProductField(name)) continue;
    const isList = WORK_PRODUCT_FIELDS.has(name);
    const parsed = isList && typeof value === "string" && /^\s*[[{]/.test(value) ? (parseMaybeJson(value) ?? value) : value;
    const candidates = isList ? (Array.isArray(parsed) ? parsed : [parsed]) : typeof value === "string" ? [value] : [];
    for (const candidate of candidates) {
      const obj = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : { url: candidate };
      const url = safeHttpUrl(obj.url ?? obj.link);
      const path = isSafeAbsolutePath(obj.path) ? obj.path : isSafeAbsolutePath(obj.url) ? obj.url : null;
      const kind = title140(obj.kind);
      const title = title140(obj.title ?? obj.name);
      const ref = sourceRef && { ...sourceRef, index: index++ };
      if (url) out.push({ kind: kind ?? urlKind(url, LINK_FIELD_KINDS[name] ?? "link"), title: title ?? new URL(url).hostname, url, field: name, atEpoch, sourceRef: ref });
      else if (path && (kind || fileKindOf(path))) out.push({ kind: kind ?? fileKindOf(path), title: title ?? basename(path), path, field: name, atEpoch, sourceRef: ref });
    }
  }
  return out;
}

const dedupKey = (item) => (item.kind === "commit" && item.sha ? `commit:${item.sha.slice(0, 7)}` : item.kind === "branch" && item.branch ? `branch:${item.branch}` : (item.url ?? item.path));

/** Merge, de-duplicate (newest wins) and attach repos to commits and branches. */
export function mergeWorkProduct(lists, limit = 60) {
  const all = lists.flat();
  const branchesByName = new Map();
  const repoByHead = new Map();
  const repoByRef = new Map();
  for (const item of all) {
    if (item.kind === "branch" && item.repo) {
      if (!branchesByName.has(item.branch)) branchesByName.set(item.branch, []);
      branchesByName.get(item.branch).push(item);
      for (const head of item.heads ?? []) repoByHead.set(head.slice(0, 7), item.repo);
    }
  }
  const refKey = (item) => (item.sourceRef ? `${item.sourceRef.kind}:${item.sourceRef.id}` : null);
  const repoFromBranch = (item) => branchesByName.get(item.branch)?.find((b) => item.kind === "branch" || (b.atEpoch ?? 0) >= (item.atEpoch ?? 0))?.repo;
  const repoOf = (item) => item.repo ?? repoFromBranch(item) ?? (item.sha ? repoByHead.get(item.sha.slice(0, 7)) : undefined) ?? null;
  for (const item of all) if (item.kind === "commit" && repoOf(item) && refKey(item)) repoByRef.set(refKey(item), repoOf(item));
  const unique = new Map();
  for (const item of all.sort((a, b) => (b.atEpoch ?? 0) - (a.atEpoch ?? 0))) {
    const key = dedupKey(item);
    if (unique.has(key)) continue;
    const repo = (item.kind === "commit" || item.kind === "branch") && !item.repo ? (repoOf(item) ?? (item.kind === "commit" ? repoByRef.get(refKey(item)) : null)) : null;
    unique.set(key, repo ? { ...item, repo, url: githubUrl({ ...item, repo }) } : item);
  }
  return [...unique.values()].slice(0, limit);
}

/** An existing regular file with an allowed extension, else null. */
export function existingProductFile(item) {
  if (!item?.path || !fileKindOf(item.path)) return null;
  try {
    return statSync(item.path).isFile() ? item.path : null;
  } catch {
    return null;
  }
}

export const productFileUrl = (item) => (item.path && item.sourceRef ? `/api/work-view/file/${item.sourceRef.kind}/${item.sourceRef.id}/${item.sourceRef.index ?? 0}` : null);

const FILE_LIKE = Object.keys(FILE_KINDS).map((ext) => `files_modified LIKE '%${ext}"%'`).join(" OR ");

/** Recorded calls and observations that can carry work product, since `sinceEpoch`. */
export function readProductRows(all, sinceEpoch, limit = 2000) {
  const mcp = all(
    `SELECT id, session_db_id, prompt_number, tool_name, tool_input, tool_response, created_at_epoch FROM tool_uses
     WHERE created_at_epoch >= ? AND (tool_name IN ('Artifact', 'mcp__claude_ai_Notion__notion-create-pages', 'mcp__claude_ai_Claude_Docs__batch', 'mcp__claude_ai_Claude_Docs__create')
       OR tool_name LIKE '%chatgpt_space__create_page' OR tool_name LIKE '%sites__save_version_and_deploy%'
       OR (tool_name = 'Bash' AND tool_input LIKE '%gh pr create%'))
     ORDER BY id DESC LIMIT ?`,
    [sinceEpoch, limit],
  );
  const git = all(
    `SELECT id, session_db_id, prompt_number, tool_name, tool_input, tool_response, created_at_epoch FROM tool_uses
     WHERE created_at_epoch >= ? AND tool_name = 'Bash' AND tool_input LIKE '%git%' AND tool_input NOT LIKE '%gh pr create%'
       AND (tool_input LIKE '%commit%' OR tool_input LIKE '%push%' OR tool_input LIKE '%checkout -b%' OR tool_input LIKE '%switch -c%')
     ORDER BY id DESC LIMIT ?`,
    [sinceEpoch, limit],
  );
  const productObservations = all(
    `SELECT id, memory_session_id, prompt_number, files_modified, created_at_epoch FROM observations
     WHERE created_at_epoch >= ? AND (${FILE_LIKE}) ORDER BY id DESC LIMIT ?`,
    [sinceEpoch, limit],
  );
  return { productCalls: [...mcp, ...git], productObservations };
}

/** Resolve the file behind /api/work-view/file/:kind/:id/:index, or null. */
export function resolveProductFile(all, kind, id, index) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(index) || index < 0) return null;
  let items = [];
  if (kind === "observation") {
    const row = all("SELECT id, files_modified, created_at_epoch FROM observations WHERE id = ?", [id])[0];
    items = row ? productFromObservation(row) : [];
  } else if (kind === "work-state") {
    const row = all("SELECT id, fields FROM work_state_entries WHERE id = ?", [id])[0];
    items = row ? productFromFields(parseMaybeJson(row.fields), { sourceRef: { kind, id } }) : [];
  }
  return existingProductFile(items.find((item) => item.sourceRef?.index === index)) ?? null;
}
