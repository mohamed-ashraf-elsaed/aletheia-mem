#!/usr/bin/env bun
// Check (or regenerate) docs/openapi.json against the route manifest in test/route-manifest.mjs.
//   bun scripts/check-openapi.mjs          # exit 1 when a manifest route is missing from the document
//   bun scripts/check-openapi.mjs --write  # regenerate docs/openapi.json from the manifest
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { UNIQUE_ROUTES } from "../test/route-manifest.mjs";

const ROOT = join(import.meta.dir, "..");
const OPENAPI_PATH = join(ROOT, "docs", "openapi.json");
const WRITE = process.argv.includes("--write");

function buildOpenapi() {
  const paths = {};
  for (const route of UNIQUE_ROUTES) {
    const method = route.method.toLowerCase();
    const params = [...route.template.matchAll(/\{([^}]+)\}/g)].map((match) => ({ name: match[1], in: "path", required: true, schema: { type: "string" } }));
    const schema = route.type === "json" && route.keys.length
      ? { type: "object", required: route.keys, properties: Object.fromEntries(route.keys.map((key) => [key, {}])) }
      : undefined;
    const response = { description: `${route.method} ${route.template}` };
    if (schema) response.content = { "application/json": { schema } };
    paths[route.template] ??= {};
    paths[route.template][method] = {
      summary: `${route.method} ${route.template}`,
      ...(params.length ? { parameters: params } : {}),
      responses: { [String(route.status)]: response },
    };
  }
  return { openapi: "3.0.3", info: { title: "Aletheia HTTP API", version: "0.1.0" }, paths };
}

function missingPaths(doc) {
  const missing = [];
  for (const route of UNIQUE_ROUTES) {
    const method = route.method.toLowerCase();
    if (!doc?.paths?.[route.template]?.[method]) missing.push(`${route.method} ${route.template}`);
  }
  return missing;
}

if (WRITE) {
  writeFileSync(OPENAPI_PATH, `${JSON.stringify(buildOpenapi(), null, 2)}\n`);
  console.log(`openapi: wrote ${UNIQUE_ROUTES.length} route entries to docs/openapi.json`);
} else {
  if (!existsSync(OPENAPI_PATH)) {
    console.error("openapi: docs/openapi.json is missing; run `bun scripts/check-openapi.mjs --write`");
    process.exit(1);
  }
  const doc = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
  const missing = missingPaths(doc);
  if (missing.length) {
    for (const entry of missing) console.error(`openapi: missing ${entry}`);
    console.error(`openapi: ${missing.length} route(s) missing; run \`bun scripts/check-openapi.mjs --write\``);
    process.exit(1);
  }
  console.log(`openapi ok: ${UNIQUE_ROUTES.length} paths`);
}
