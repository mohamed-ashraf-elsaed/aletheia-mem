// static checks for the Docker files. `docker build` is NOT RUN BY AUTHOR.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("Docker files", () => {
  test("the base image is pinned and the container runs as a non-root user", () => {
    const text = read("Dockerfile");
    expect(text).toMatch(/^FROM oven\/bun:1\.\d+\.\d+-alpine$/m);
    expect(text).toContain("adduser -S -G aletheia aletheia");
    expect(text).toContain("USER aletheia");
    expect(text).not.toMatch(/^USER root$/m);
  });

  test("the data directory is a volume and the healthcheck uses /healthz", () => {
    const text = read("Dockerfile");
    expect(text).toContain('VOLUME ["/data"]');
    expect(text).toContain("ALETHEIA_DATA_DIR=/data");
    expect(text).toContain("HEALTHCHECK");
    expect(text).toContain("/healthz");
  });

  test("no secret is baked into the image", () => {
    const text = read("Dockerfile");
    expect(text).not.toMatch(/ENV .*(KEY|TOKEN|SECRET|PASSWORD)\s*=/i);
    expect(text).not.toMatch(/ARG .*(KEY|TOKEN|SECRET|PASSWORD)/i);
    expect(text).not.toMatch(/COPY .*\.env/);
    expect(text).not.toContain("0.0.0.0");
  });

  test("compose keeps the service on loopback and persists /data", () => {
    const text = read("compose.yaml");
    expect(text).toContain("network_mode: host");
    expect(text).toContain("aletheia-data:/data");
    expect(text).toContain("ALETHEIA_DATA_DIR: /data");
    expect(text).toContain("/healthz");
    expect(text).toContain("restart: unless-stopped");
    expect(text).not.toMatch(/ALETHEIA_(API_KEY|OPENAI_API_KEY|ANTHROPIC)/);
    expect(text).not.toContain("privileged: true");
    expect(text).not.toMatch(/ports:\s*\n\s*-\s*"0\.0\.0\.0/);
  });

  test("the build context excludes the repository and local data", () => {
    const text = read(".dockerignore");
    for (const entry of [".git", ".github", "node_modules", "bench/data", "bench/runtime", ".env"]) {
      expect(text.split("\n")).toContain(entry);
    }
  });

  // The task note is kept only on the maintainers' machines; skipped in a fresh clone.
  (existsSync(join(root, "docs", "tasks")) ? test : test.skip)("docker build is recorded as not run", () => {
    const note = readdirSync(join(root, "docs", "tasks"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => read(join("docs", "tasks", name)))
      .find((text) => text.includes("docker build") && text.includes("NOT RUN BY AUTHOR"));
    expect(note).toBeDefined();
    expect(note).toContain("NOT RUN BY AUTHOR");
  });
});
