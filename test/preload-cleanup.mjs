// Registered by bunfig.toml `[test] preload`. Bun fires an afterAll registered here once, after the whole run, so
// every temp directory the tests created is removed even when a test file forgets its own cleanup.
import { afterAll } from "bun:test";
import { cleanupTempDirs } from "./temp-dirs.mjs";

afterAll(() => cleanupTempDirs());
