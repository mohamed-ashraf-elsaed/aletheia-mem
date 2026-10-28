// the auto-start service writes text only. It never calls systemctl or launchctl and the real
// start is NOT RUN BY AUTHOR. Tests use a temp HOME and check the generated unit and plist text.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readServiceManifest, serviceInstall, servicePlan, serviceStatus, serviceUninstall } from "../src/service.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-service-"));
const home = join(temp, "home");
const config = {
  home,
  dataDir: join(home, ".aletheia"),
  hubDb: join(home, ".aletheia", "hub.db"),
  port: 37790,
};

afterAll(() => removeDir(temp, { recursive: true, force: true }));

describe("auto-start service", () => {
  test("the Linux unit is loopback-only with Restart, Nice and documented quota defaults", () => {
    const plan = servicePlan({ config, platform: "linux" });
    expect(plan).toMatchObject({ platform: "linux", supported: true, kind: "systemd" });
    expect(plan.content).toContain("Restart=on-failure");
    expect(plan.content).toContain("Nice=10");
    expect(plan.content).toContain("Environment=ALETHEIA_HOST=127.0.0.1");
    expect(plan.content).toContain(`Environment=ALETHEIA_DATA_DIR=${config.dataDir}`);
    expect(plan.content).toContain("# CPUQuota=50%");
    expect(plan.content).toContain("# MemoryMax=1G");
    expect(plan.content).not.toMatch(/^CPUQuota=/m);
  });

  test("quota flags write active overrides instead of the commented defaults", () => {
    const plan = servicePlan({ config, platform: "linux", flags: { "cpu-quota": "80%", "memory-max": "2G" } });
    expect(plan.content).toContain("CPUQuota=80%");
    expect(plan.content).toContain("MemoryMax=2G");
    expect(plan.content).not.toContain("# CPUQuota");
    expect(plan.content).not.toContain("# MemoryMax");
  });

  test("the macOS plist is written from the launchd docs and labelled from-docs-only", () => {
    const plan = servicePlan({ config, platform: "darwin" });
    expect(plan).toMatchObject({ platform: "darwin", supported: true, kind: "launchd", verification: "from-docs-only" });
    expect(plan.content).toContain("<key>Label</key>");
    expect(plan.content).toContain("com.aletheia.mem");
    expect(plan.content).toContain("<key>ProgramArguments</key>");
    expect(plan.content).toContain("<key>KeepAlive</key>");
    expect(plan.content).toContain("127.0.0.1");
    expect(plan.file).toContain("LaunchAgents");
  });

  test("Windows is not supported and says so", () => {
    const plan = servicePlan({ config, platform: "win32" });
    expect(plan.supported).toBe(false);
    expect(plan.note).toContain("not supported");
  });

  test("install is dry-run by default and idempotent with --write", () => {
    const dry = serviceInstall({ config, platform: "linux" });
    expect(dry.dryRun).toBe(true);
    expect(dry.changed).toBe(true);
    expect(existsSync(dry.file)).toBe(false);

    const first = serviceInstall({ config, platform: "linux", flags: { write: true } });
    expect(first.dryRun).toBe(false);
    expect(first.changed).toBe(true);
    expect(first.backup).toBeNull();
    expect(readFileSync(first.file, "utf8")).toBe(first.content);
    expect(readServiceManifest(config.dataDir).installed).toBe(true);

    const before = readFileSync(first.file, "utf8");
    const second = serviceInstall({ config, platform: "linux", flags: { write: true } });
    expect(second.changed).toBe(false);
    expect(second.backup).toBeNull();
    expect(readFileSync(first.file, "utf8")).toBe(before);
  });

  test("uninstall is dry-run by default and removes the file and manifest with --write", () => {
    const dry = serviceUninstall({ config, platform: "linux" });
    expect(dry.dryRun).toBe(true);
    expect(dry.installed).toBe(true);
    expect(existsSync(dry.file)).toBe(true);

    const removed = serviceUninstall({ config, platform: "linux", flags: { write: true } });
    expect(removed.dryRun).toBe(false);
    expect(removed.removed).toBe(true);
    expect(removed.backup).toBeTruthy();
    expect(existsSync(removed.file)).toBe(false);
    expect(readServiceManifest(config.dataDir).installed).toBe(false);
    expect(serviceStatus({ config, platform: "linux" }).installed).toBe(false);
  });
});
