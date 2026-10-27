// The set of files git tracks under a root, or null when the root is not a git checkout.
// Scripts use it so a local run sees the same files as a fresh clone: private files that sit on a maintainer's disk
// but are not tracked are ignored.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function trackedFiles(root) {
  if (!existsSync(join(root, ".git"))) return null;
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return new Set(out.split("\0").filter(Boolean));
  } catch {
    return null;
  }
}

export function isTracked(set, root, absolute) {
  if (!set) return true;
  const rel = absolute.slice(root.length + 1).split("\\").join("/");
  if (set.has(rel)) return true;
  return [...set].some((name) => name.startsWith(`${rel}/`));
}
