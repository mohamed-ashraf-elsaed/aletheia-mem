// the release helper (--prepare, --verify, --sync-server-json) and the release workflow, tested on a temp git repository.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { compareVersions, imageRefs, moveUnreleased, relativeLinks, REQUIRED, syncServerJson, topChangelogRelease, unpackedMb } from "../scripts/release.mjs";

afterAll(cleanupTempDirs);

const repo = join(import.meta.dir, "..");
const script = join(repo, "scripts/release.mjs");
const CHANGELOG = (unreleased) => `# Changelog\n\n## [Unreleased]\n${unreleased}\n## [0.1.0] - 2026-10-27\n\nFirst.\n`;
const GOOD_README = `<img src="https://example.com/a.png" alt="a">\n\n[Docs](https://example.com/docs)\n`;

function sh(cwd, ...cmd) {
  const proc = Bun.spawnSync(cmd, { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

function fixture({ unreleased = "\n### Fixed\n\n- A thing.\n", readme = GOOD_README, branch = "main", version = "0.1.0" } = {}) {
  const dir = tempDir("aletheia-release-");
  for (const path of REQUIRED) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), "x\n");
  }
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "fx", version, files: ["bin", "src", "docs", "NOTICE.md", "README.md", "CHANGELOG.md"] }, null, 2)}\n`);
  writeFileSync(join(dir, "server.json"), `${JSON.stringify({ name: "fx", version, packages: [{ registryType: "npm", identifier: "fx", version }] }, null, 2)}\n`);
  writeFileSync(join(dir, "CHANGELOG.md"), CHANGELOG(unreleased));
  writeFileSync(join(dir, "README.md"), readme);
  sh(dir, "git", "init", "-q", "-b", branch);
  sh(dir, "git", "add", "-A");
  sh(dir, "git", "commit", "-q", "-m", "init");
  return dir;
}

const release = (dir, ...args) => {
  const proc = Bun.spawnSync([process.execPath, script, ...args], { cwd: dir, env: { ...process.env, RELEASE_ROOT: dir } });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
};

describe("release helpers", () => {
  test("versions compare numerically and the top CHANGELOG release is found", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
    expect(topChangelogRelease(CHANGELOG("\n- x\n"))).toBe("0.1.0");
    expect(unpackedMb("Unpacked size: 7.86MB")).toBeCloseTo(7.86);
  });

  test("moveUnreleased copies release notes literally, including text such as $` that a replacement string would expand", () => {
    const notes = "\n### Changed\n\n- Rejects code tokens (`$`, `->`, `::`) and more.\n";
    const out = moveUnreleased(CHANGELOG(notes), "0.1.1", "2026-11-01");
    expect(out).toBe("# Changelog\n\n## [Unreleased]\n\n## [0.1.1] - 2026-11-01\n\n### Changed\n\n- Rejects code tokens (`$`, `->`, `::`) and more.\n\n## [0.1.0] - 2026-10-27\n\nFirst.\n");
  });
  test("moveUnreleased keeps an empty Unreleased heading and dates the new section", () => {
    const out = moveUnreleased(CHANGELOG("\n### Fixed\n\n- A thing.\n"), "0.1.1", "2026-11-01");
    expect(out).toMatch(/## \[Unreleased\]\n\n## \[0\.1\.1\] - 2026-11-01\n\n### Fixed\n\n- A thing\.\n\n## \[0\.1\.0\]/);
  });

  test("image and relative-link scanners see markdown and HTML", () => {
    const text = `![x](a.png)\n<img src="https://h/x.png">\n[l](docs/a.md) <a href="https://ok">ok</a>\n`;
    expect(imageRefs(text).map((r) => r.url)).toEqual(["a.png", "https://h/x.png"]);
    expect(relativeLinks(text).map((r) => r.url)).toEqual(["a.png", "docs/a.md"]);
    expect(relativeLinks(text, 1).length).toBe(1);
  });
});

describe("release.mjs --prepare", () => {
  test("bumps package.json, server.json and moves the notes on a clean main", () => {
    const dir = fixture();
    const result = release(dir, "--prepare", "0.1.1", "--date", "2026-11-01");
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version).toBe("0.1.1");
    const manifest = JSON.parse(readFileSync(join(dir, "server.json"), "utf8"));
    expect(manifest.version).toBe("0.1.1");
    expect(manifest.packages[0].version).toBe("0.1.1");
    const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    expect(changelog).toContain("## [0.1.1] - 2026-11-01");
    expect(changelog.indexOf("## [Unreleased]")).toBeLessThan(changelog.indexOf("## [0.1.1]"));
    expect(changelog.indexOf("## [0.1.1]")).toBeLessThan(changelog.indexOf("## [0.1.0]"));
    expect(sh(dir, "git", "tag").out).toBe("");
  });

  test("refuses a dirty tree", () => {
    const dir = fixture();
    writeFileSync(join(dir, "README.md"), "changed\n");
    const result = release(dir, "--prepare", "0.1.1");
    expect(result.code).toBe(1);
    expect(result.err).toContain("not clean");
    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version).toBe("0.1.0");
  });

  test("refuses a branch other than main", () => {
    const result = release(fixture({ branch: "work" }), "--prepare", "0.1.1");
    expect(result.code).toBe(1);
    expect(result.err).toContain("must run on main");
  });

  test("refuses a version that is not greater", () => {
    for (const v of ["0.1.0", "0.0.9"]) {
      const result = release(fixture(), "--prepare", v);
      expect(result.code).toBe(1);
      expect(result.err).toContain("not greater than 0.1.0");
    }
  });

  test("refuses a stale or missing server.json and empty release notes", () => {
    const stale = fixture({ version: "0.2.0" });
    expect(release(stale, "--prepare", "0.1.1").err).toContain("not greater than 0.2.0 in server.json");
    const missing = fixture();
    rmSync(join(missing, "server.json"));
    expect(release(missing, "--prepare", "0.1.1").err).toContain("server.json is missing");
    expect(release(fixture({ unreleased: "\n" }), "--prepare", "0.1.1").err).toContain("[Unreleased] is empty");
    expect(release(fixture(), "--prepare", "v0.1.1").code).toBe(1);
  });
});

describe("release.mjs --sync-server-json", () => {
  test("bumps server.json when the version is newer", () => {
    const dir = fixture();
    // The workflow passes GITHUB_REF_NAME, so the command must accept the leading v of the tag.
    const result = release(dir, "--sync-server-json", "v0.1.1");
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("bumped from 0.1.0 to 0.1.1");
    const manifest = JSON.parse(readFileSync(join(dir, "server.json"), "utf8"));
    expect(manifest.version).toBe("0.1.1");
    expect(manifest.packages[0].version).toBe("0.1.1");
  });

  test("keeps the original formatting and other fields", () => {
    const text = '{\n  "name": "fx",\n  "description": "kept \\"as is\\"",\n  "version": "0.1.0",\n  "packages": [\n    {\n      "registryType": "npm",\n      "identifier": "fx",\n      "version": "0.1.0"\n    }\n  ]\n}';
    expect(syncServerJson(text, "0.1.1").text).toBe(text.replaceAll("0.1.0", "0.1.1"));
  });

  test("leaves server.json alone when it matches or is newer", () => {
    expect(release(fixture(), "--sync-server-json", "0.1.0").out).toContain("already matches 0.1.0");
    const newer = fixture({ version: "0.1.5" });
    const result = release(newer, "--sync-server-json", "0.1.0");
    expect(result.code).toBe(0);
    expect(result.out).toContain("already newer than 0.1.0");
    expect(JSON.parse(readFileSync(join(newer, "server.json"), "utf8")).version).toBe("0.1.5");
  });

  test("fails when server.json is missing or not JSON", () => {
    const missing = fixture();
    rmSync(join(missing, "server.json"));
    expect(release(missing, "--sync-server-json", "0.1.1").err).toContain("server.json is missing");
    const bad = fixture();
    writeFileSync(join(bad, "server.json"), "{nope");
    expect(release(bad, "--sync-server-json", "0.1.1").err).toContain("not valid JSON");
  });
});

describe("release.mjs --verify", () => {
  test("passes on a consistent fixture", () => {
    const result = release(fixture(), "--verify");
    expect(result.err).toBe("");
    expect(result.code).toBe(0);
    expect(result.out).toContain("verify ok");
  });

  test("fails when package.json and the CHANGELOG disagree", () => {
    const result = release(fixture({ version: "0.2.0" }), "--verify");
    expect(result.code).toBe(1);
    expect(result.err).toContain("does not equal the top CHANGELOG release");
  });

  test("fails when server.json drifts from package.json or is missing", () => {
    const drift = fixture();
    writeFileSync(join(drift, "server.json"), JSON.stringify({ name: "fx", version: "9.9.9", packages: [{ version: "9.9.9" }] }));
    expect(release(drift, "--verify").err).toContain("server.json version 9.9.9 does not match package.json version 0.1.0");
    const packageDrift = fixture();
    writeFileSync(join(packageDrift, "server.json"), JSON.stringify({ name: "fx", version: "0.1.0", packages: [{ version: "0.0.9" }] }));
    expect(release(packageDrift, "--verify").err).toContain("server.json package 0 version 0.0.9 does not match package.json version 0.1.0");
    const missing = fixture();
    rmSync(join(missing, "server.json"));
    expect(release(missing, "--verify").err).toContain("server.json is missing");
    const bad = fixture();
    writeFileSync(join(bad, "server.json"), "{nope");
    expect(release(bad, "--verify").err).toContain("server.json is not valid JSON");
  });

  test("fails when the tag exists, and --tag mode expects it", () => {
    const dir = fixture();
    sh(dir, "git", "tag", "-a", "v0.1.0", "-m", "t");
    expect(release(dir, "--verify").err).toContain("tag v0.1.0 already exists");
    expect(release(dir, "--verify", "--tag", "v0.1.0").code).toBe(0);
    expect(release(dir, "--verify", "--tag", "v0.9.9").err).toContain("does not match");
  });

  test("fails when a required file is not in the tarball", () => {
    const dir = fixture();
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    pkg.files = pkg.files.filter((f) => f !== "NOTICE.md");
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    const result = release(dir, "--verify");
    expect(result.code).toBe(1);
    expect(result.err).toContain("missing required paths: NOTICE.md");
  });

  test("fails on a relative image and on a relative link near the top", () => {
    const result = release(fixture({ readme: '<img src="docs/assets/logo.png">\n\n[a](docs/a.md)\n![b](https://ok/b.png)\n' }), "--verify");
    expect(result.code).toBe(1);
    expect(result.err).toContain("image URL is not absolute https");
    expect(result.err).toContain("relative link in the first 60 lines: docs/a.md");
  });

  test("a relative link after line 60 is allowed", () => {
    const readme = `${GOOD_README}${"filler\n".repeat(70)}[a](docs/a.md)\n`;
    expect(release(fixture({ readme }), "--verify").code).toBe(0);
  });
});

describe("release workflow", () => {
  const yml = readFileSync(join(repo, ".github/workflows/release.yml"), "utf8");
  const code = yml.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");

  test("runs on v* tags and manual dispatch only, with the pinned Bun and the checks", () => {
    expect(code).toMatch(/on:\n  push:\n    tags:\n      - "v\*"\n  workflow_dispatch:\n    inputs:\n      tag:/);
    expect(code).toMatch(/dry_run:\n\s+description: .*\n\s+required: true\n\s+type: boolean\n\s+default: true/);
    expect(code).not.toMatch(/branches:/);
    expect(code).toContain("bun-version: 1.3.10");
    expect(code).toContain("run: bun test");
    expect(code).toContain('bun scripts/release.mjs --verify --tag "$TAG"');
  });

  test("publishes with provenance only when configured, and creates the GitHub release", () => {
    expect(code).toContain("id-token: write");
    expect(code).toContain("npm publish --provenance --access public");
    expect(code).toMatch(/if: \$\{\{ inputs\.dry_run != true && \(env\.NPM_TOKEN != '' \|\| vars\.NPM_TRUSTED_PUBLISHING == 'true'\) \}\}\n\s+run: \|\n\s+npm install -g npm@latest/);
    expect(code).toContain("gh release create");
    expect(code).toContain("--generate-notes");
    expect(code.indexOf("--verify --tag")).toBeLessThan(code.indexOf("npm publish"));
    expect(code.indexOf("npm publish")).toBeLessThan(code.indexOf("gh release create"));
  });

  test("syncs server.json, rebuilds the docs changelog page and publishes to the MCP registry", () => {
    expect(code).toContain('bun scripts/release.mjs --sync-server-json "$TAG"');
    // The sync runs before the test suite, so a stale server.json cannot fail the server-json test.
    expect(code.indexOf("--sync-server-json")).toBeLessThan(code.indexOf("run: bun test"));
    expect(code).toContain("bun scripts/build-site.mjs");
    expect(code).toContain("bun scripts/check-sitemap.mjs");
    expect(code).toContain("git push origin main");
    expect(code).toContain("sigstore/cosign-installer");
    expect(code).toContain("cosign verify-blob");
    expect(code).toContain("MCP_PUBLISHER_VERSION: v1.8.7");
    expect(code).toContain("./mcp-publisher login github-oidc");
    expect(code).toContain("./mcp-publisher publish");
    expect(code.indexOf("mcp-publisher publish")).toBeGreaterThan(code.indexOf("gh release create"));
    expect(code).toMatch(/MCP_REGISTRY_PUBLISH == 'true'/);
    expect(code).not.toMatch(/echo .*MCP_GITHUB_TOKEN[^"]/);
  });

  test("a dry run publishes nothing, and the distro notification is signed, optional and runs before the push to main", () => {
    for (const name of ["Create GitHub release", "Push server.json and the changelog page to main", "Notify the distribution server"]) {
      const at = code.indexOf(`- name: ${name}`);
      expect(at).toBeGreaterThan(-1);
      expect(code.slice(at, at + 200)).toContain("inputs.dry_run != true");
    }
    expect(code).toContain("vars.DISTRO_URL != ''");
    expect(code).toContain("secrets.DISTRO_WEBHOOK_SECRET");
    expect(code).toContain("openssl dgst -sha256 -hmac");
    expect(code).toContain("X-Hub-Signature-256");
    expect(code).toContain("/api/webhooks/github");
    expect(code.indexOf("Notify the distribution server")).toBeLessThan(code.indexOf("git push origin main"));
    expect(code.indexOf("Notify the distribution server")).toBeGreaterThan(code.indexOf("gh release create"));
  });

  test("the owner setup is documented in comments and never prints the token", () => {
    expect(yml).toMatch(/# .*Trusted Publisher/);
    expect(yml).toMatch(/# .*granular access token/);
    expect(yml).toMatch(/# .*MCP registry OIDC/);
    expect(yml).toMatch(/# .*MCP_GITHUB_TOKEN/);
    expect(code).not.toMatch(/echo .*NPM_TOKEN[^"]/);
  });
});

// docs/releasing.md is kept only on the maintainers' machines; skipped in a fresh clone.
(existsSync(join(repo, "docs/releasing.md")) ? describe : describe.skip)("docs/releasing.md", () => {
  const text = () => readFileSync(join(repo, "docs/releasing.md"), "utf8");
  test("states the policy, owner steps and rollback", () => {
    for (const part of ["--prepare 0.1.1", "npm publish --access public", "git tag -a v0.1.1", "gh release create", "npx aletheia-mem", "npm deprecate", "72 hours", "2FA", "Owner"]) {
      expect(text()).toContain(part);
    }
  });
});
