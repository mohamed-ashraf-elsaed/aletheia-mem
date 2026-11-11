// Real git checkouts for the worktree tests: a repo `shop` with two worktrees and one submodule, in a temp dir.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./temp-dirs.mjs";

export function git(cwd, ...args) {
  const result = spawnSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=test", "-c", "protocol.file.allow=always", ...args], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function initRepo(dir, file) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  writeFileSync(join(dir, "README"), `${file}\n`);
  git(dir, "add", "README");
  git(dir, "commit", "-q", "-m", file);
}

/** `shop` with a worktree inside .claude/worktrees, one beside it, and submodules at vendor/lib and deps-c0ffee. */
export function makeRepos() {
  const root = tempDir("aletheia-worktree-");
  const lib = join(root, "lib");
  initRepo(lib, "lib");
  const shop = join(root, "shop");
  initRepo(shop, "shop");
  git(shop, "submodule", "add", "-q", lib, "vendor/lib");
  git(shop, "submodule", "add", "-q", lib, "deps-c0ffee");
  git(shop, "commit", "-q", "-m", "submodule");
  const inner = join(shop, ".claude", "worktrees", "feature-abc123");
  git(shop, "worktree", "add", "-q", "-b", "feature", inner);
  const beside = join(root, "shop-hotfix");
  git(shop, "worktree", "add", "-q", "-b", "hotfix", beside);
  mkdirSync(join(inner, "src", "deep"), { recursive: true });
  return { root, shop, inner, beside, submodule: join(shop, "vendor", "lib") };
}
