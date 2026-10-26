// Auto-start service generation (T-151). Writes a systemd user unit on Linux and a launchd plist on
// macOS, dry-run by default, with a backup and a manifest. It only writes text; it never calls systemctl
// or launchctl, and the author has not started the service on a real machine.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const SERVICE_MANIFEST = "service-manifest.json";
export const DEFAULT_CPU_QUOTA = "50%";
export const DEFAULT_MEMORY_MAX = "1G";
export const LAUNCHD_SOURCE = "https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html (fetched 2026-10-26)";

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const jsonText = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

const serverScript = () => join(import.meta.dir, "..", "bin", "aletheia-server.mjs");

function manifestPath(dataDir) {
  return join(dataDir, SERVICE_MANIFEST);
}

export function readServiceManifest(dataDir) {
  const file = manifestPath(dataDir);
  if (!existsSync(file)) return { version: 1, installed: false };
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { version: 1, installed: false, warning: `${file} is not readable; treating it as empty.` };
  }
}

function writeServiceManifest(dataDir, doc) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(manifestPath(dataDir), jsonText(doc));
}

const escapeXml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function linuxUnit({ bun, script, config, cpuQuota, memoryMax, quotasSet }) {
  const lines = [
    "[Unit]",
    "Description=Aletheia memory hub (loopback)",
    "After=network.target",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${bun} ${script}`,
    "Restart=on-failure",
    "Nice=10",
    "Environment=ALETHEIA_HOST=127.0.0.1",
    `Environment=ALETHEIA_DATA_DIR=${config.dataDir}`,
    `Environment=ALETHEIA_HUB_DB=${config.hubDb}`,
    `Environment=ALETHEIA_PORT=${config.port}`,
    "",
  ];
  if (quotasSet) {
    lines.push(`CPUQuota=${cpuQuota}`);
    lines.push(`MemoryMax=${memoryMax}`);
  } else {
    lines.push("# Defaults (override with --cpu-quota / --memory-max):");
    lines.push(`# CPUQuota=${cpuQuota}`);
    lines.push(`# MemoryMax=${memoryMax}`);
  }
  lines.push("", "[Install]", "WantedBy=default.target");
  return `${lines.join("\n")}\n`;
}

function macPlist({ bun, script, config }) {
  const env = [
    ["ALETHEIA_HOST", "127.0.0.1"],
    ["ALETHEIA_DATA_DIR", config.dataDir],
    ["ALETHEIA_HUB_DB", config.hubDb],
    ["ALETHEIA_PORT", String(config.port)],
  ];
  const log = join(config.dataDir, "aletheia.log");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aletheia.mem</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(bun)}</string>
    <string>${escapeXml(script)}</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(log)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${env.map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`).join("\n")}
  </dict>
</dict>
</plist>
`;
}

/** The service text for this platform, without writing anything. */
export function servicePlan({ config, platform = process.platform, flags = {} } = {}) {
  const bun = process.execPath;
  const script = serverScript();
  const cpuQuota = typeof flags["cpu-quota"] === "string" && flags["cpu-quota"] ? flags["cpu-quota"] : DEFAULT_CPU_QUOTA;
  const memoryMax = typeof flags["memory-max"] === "string" && flags["memory-max"] ? flags["memory-max"] : DEFAULT_MEMORY_MAX;
  const quotasSet = typeof flags["cpu-quota"] === "string" || typeof flags["memory-max"] === "string";

  if (platform === "win32") {
    return { platform: "windows", supported: false, note: "Windows auto-start is not supported. Start aletheia-server manually or through Task Scheduler." };
  }

  if (platform === "darwin") {
    return {
      platform: "darwin",
      supported: true,
      kind: "launchd",
      label: "com.aletheia.mem",
      file: join(config.home, "Library", "LaunchAgents", "aletheia.plist"),
      content: macPlist({ bun, script, config }),
      verification: "from-docs-only",
      source: LAUNCHD_SOURCE,
    };
  }

  return {
    platform: "linux",
    supported: true,
    kind: "systemd",
    label: "aletheia.service",
    file: join(config.home, ".config", "systemd", "user", "aletheia.service"),
    content: linuxUnit({ bun, script, config, cpuQuota, memoryMax, quotasSet }),
    verification: "from-docs-only",
    source: "systemd user units (systemd.unit(5)); loopback only",
  };
}

export function serviceInstall({ config, flags = {}, platform = process.platform } = {}) {
  const plan = servicePlan({ config, platform, flags });
  if (!plan.supported) return plan;
  const before = existsSync(plan.file) ? readFileSync(plan.file, "utf8") : null;
  const changed = before !== plan.content;
  const write = !!flags.write && !flags["dry-run"];
  if (!write) return { ...plan, dryRun: true, changed, note: "Dry run: nothing was written. Add --write to apply." };

  let backup = null;
  if (existsSync(plan.file) && changed) {
    backup = `${plan.file}.aletheia-bak-${stamp()}`;
    copyFileSync(plan.file, backup);
  }
  if (changed) {
    mkdirSync(dirname(plan.file), { recursive: true });
    writeFileSync(plan.file, plan.content);
  }
  writeServiceManifest(config.dataDir, {
    version: 1,
    installed: true,
    platform: plan.platform,
    kind: plan.kind,
    label: plan.label,
    file: plan.file,
    cpuQuota: typeof flags["cpu-quota"] === "string" ? flags["cpu-quota"] : null,
    memoryMax: typeof flags["memory-max"] === "string" ? flags["memory-max"] : null,
    installedAt: new Date().toISOString(),
  });
  return { ...plan, dryRun: false, changed, wrote: changed ? [plan.file] : [], backup, note: changed ? "Installed." : "Already installed; nothing changed." };
}

export function serviceUninstall({ config, flags = {}, platform = process.platform } = {}) {
  const plan = servicePlan({ config, platform, flags });
  if (!plan.supported) return plan;
  const installed = existsSync(plan.file);
  const write = !!flags.write && !flags["dry-run"];
  if (!write) return { ...plan, dryRun: true, installed, note: installed ? "Dry run: nothing was removed. Add --write to remove." : "Not installed." };

  let backup = null;
  if (installed) {
    backup = `${plan.file}.aletheia-bak-${stamp()}`;
    copyFileSync(plan.file, backup);
    rmSync(plan.file);
  }
  const manifest = manifestPath(config.dataDir);
  if (existsSync(manifest)) rmSync(manifest);
  return { ...plan, dryRun: false, installed, removed: installed, backup, note: installed ? "Removed." : "Not installed." };
}

export function serviceStatus({ config, flags = {}, platform = process.platform } = {}) {
  const plan = servicePlan({ config, platform, flags });
  if (!plan.supported) return plan;
  return { ...plan, installed: existsSync(plan.file), manifest: readServiceManifest(config.dataDir) };
}

export function runServiceCommand({ config, flags, pos }) {
  const sub = pos[0];
  if (sub === "install") return serviceInstall({ config, flags });
  if (sub === "uninstall") return serviceUninstall({ config, flags });
  if (sub === "status") return serviceStatus({ config, flags });
  const error = new Error("Usage: aletheia service install|uninstall|status [--write] [--cpu-quota X] [--memory-max Y]");
  error.isUsage = true;
  throw error;
}
