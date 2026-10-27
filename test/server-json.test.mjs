// T-082: server.json (the MCP Registry manifest) must agree with package.json. The registry verifies the npm
// ownership marker `mcpName` in package.json against server.json.name, and reads the package's bin for the stdio
// transport. A field that drifts from package.json makes the manifest unpublishable, so this test fails it here.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
const repoUrl = (url) => String(url ?? "").replace(/^git\+/, "").replace(/\.git$/, "");

describe("server.json agrees with package.json", () => {
  test("the registry name matches the npm ownership marker", () => {
    expect(manifest.name).toBe(pkg.mcpName);
    expect(manifest.name).toBe(`io.github.mohamed-ashraf-elsaed/${pkg.name}`);
  });

  test("the version matches the package version in both places", () => {
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.packages[0].version).toBe(pkg.version);
  });

  test("the npm package identifier and stdio transport point at this package", () => {
    expect(manifest.packages).toHaveLength(1);
    expect(manifest.packages[0].registryType).toBe("npm");
    expect(manifest.packages[0].identifier).toBe(pkg.name);
    expect(manifest.packages[0].transport).toEqual({ type: "stdio" });
  });

  test("the stdio entry point is one of the package bins and the file exists", () => {
    const mcpBin = Object.entries(pkg.bin).find(([name]) => /mcp/i.test(name));
    expect(mcpBin).toBeTruthy();
    expect(existsSync(join(root, mcpBin[1]))).toBe(true);
  });

  test("the repository url matches the package repository", () => {
    expect(repoUrl(manifest.repository.url)).toBe(repoUrl(pkg.repository.url));
    expect(manifest.repository.source).toBe("github");
  });

  test("the schema points at the published registry schema", () => {
    expect(manifest.$schema).toBe("https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
  });
});
