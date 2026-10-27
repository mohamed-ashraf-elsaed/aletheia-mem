// The server script must start with no flags. A bug once passed the text "undefined" as the host name.
import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./temp-dirs.mjs";

test("bin/aletheia-server.mjs starts without --host and answers health", async () => {
  const dir = tempDir("server-bin-");
  mkdirSync(join(dir, "home"), { recursive: true });
  const port = 39000 + Math.floor(Math.random() * 900);
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, "..", "bin", "aletheia-server.mjs")], {
    env: { ...process.env, HOME: join(dir, "home"), ALETHEIA_DATA_DIR: join(dir, "data"), ALETHEIA_PORT: String(port) }, stdout: "pipe", stderr: "pipe",
  });
  try {
    let ok = false;
    for (let i = 0; i < 40 && !ok; i += 1) {
      await Bun.sleep(100);
      try { ok = (await fetch(`http://127.0.0.1:${port}/v1/health`)).status === 200; } catch { /* not up yet */ }
    }
    expect(ok).toBe(true);
  } finally {
    proc.kill();
  }
});
