// The `aletheia sync` and `aletheia audit` commands. Hub-side commands read sync.db directly; device-side
// commands use the local replica/outbox and speak HTTP to the hub. Nothing here is a hook and no model runs.
import { SyncStore } from "./store.mjs";
import { SyncClient } from "./client.mjs";
import { mergeOps, replicaContentHash } from "./engine.mjs";
import { exportAudit } from "../audit-export.mjs";

const die = (message) => {
  const error = new Error(message);
  error.isUsage = true;
  throw error;
};

function deviceClient(config) {
  return new SyncClient(config.syncClientDb, { deviceId: null, name: process.env.HOSTNAME ?? null });
}

function hubStore(config) {
  const store = new SyncStore(config.syncDb);
  store.ensureAccount();
  return store;
}

/** Exchange a pairing code for a device token over HTTP. */
async function join(url, code, config, name) {
  const client = deviceClient(config);
  try {
    const response = await fetch(`${url}/v1/sync/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, device_id: client.deviceId, name: name ?? client.deviceId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `join failed (${response.status})`);
    client.setMeta("hub_url", url);
    client.setMeta("token", data.token);
    client.setMeta("device_name", name ?? client.deviceId);
    return { joined: true, deviceId: client.deviceId, url };
  } finally {
    client.close();
  }
}

function syncToken(config) {
  const client = deviceClient(config);
  const token = client.meta("token");
  const url = client.meta("hub_url");
  return { client, token, url };
}

export async function runSyncCommand({ config, flags, pos, out }) {
  const sub = pos[0];

  if (sub === "pair") {
    const store = hubStore(config);
    try {
      const code = store.createPairCode(1, { ttlMs: Number(flags.ttl) || 10 * 60_000 });
      return `Pairing code: ${code}\nJoin on a device: aletheia sync join http://127.0.0.1:${config.syncPort} ${code}`;
    } finally {
      store.close();
    }
  }

  if (sub === "join") {
    const url = pos[1] ?? die("Usage: aletheia sync join <url> <code> [--name device-name]");
    const code = pos[2] ?? die("Usage: aletheia sync join <url> <code> [--name device-name]");
    return join(url, code, config, typeof flags.name === "string" ? flags.name : null);
  }

  if (sub === "status") {
    const { client } = syncToken(config);
    try {
      return {
        deviceId: client.deviceId,
        name: client.name,
        hub: client.meta("hub_url", null),
        cursor: client.cursor(),
        outbox: client.outbox().length,
        entities: client.entities().length,
        contentHash: client.contentHash(),
      };
    } finally {
      client.close();
    }
  }

  if (sub === "devices") {
    const { client, token, url } = syncToken(config);
    if (!url || !token) return { devices: hubStore(config).listDevices(1) };
    try {
      const response = await fetch(`${url}/v1/sync/devices`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `devices failed (${response.status})`);
      return data;
    } finally {
      client.close();
    }
  }

  if (sub === "revoke") {
    const deviceId = pos[1] ?? die("Usage: aletheia sync revoke <device_id>");
    const { client, token, url } = syncToken(config);
    try {
      if (url && token) {
        const response = await fetch(`${url}/v1/sync/revoke`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ device_id: deviceId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? `revoke failed (${response.status})`);
        return data;
      }
      const store = hubStore(config);
      try {
        return { revoked: store.revokeDevice(1, deviceId) };
      } finally {
        store.close();
      }
    } finally {
      client.close();
    }
  }

  if (sub === "push" || sub === "pull" || sub === "run") {
    const { client, token, url } = syncToken(config);
    try {
      if (!url || !token) die("No sync hub configured. Run: aletheia sync join <url> <code>");
      if (sub === "push") return client.push(url, token);
      if (sub === "pull") return client.pull(url, token);
      const interval = Number(flags.interval) || 30_000;
      out(`Sync loop running every ${interval} ms; Ctrl-C to stop.`);
      let running = true;
      for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { running = false; });
      while (running) {
        try {
          await client.push(url, token);
          await client.pull(url, token);
        } catch (error) {
          out(`sync error: ${error.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
      return { stopped: true };
    } finally {
      client.close();
    }
  }

  if (sub === "compact") {
    const store = hubStore(config);
    try {
      return store.compact(1, { retentionMs: Number(flags["retention-days"] ?? 30) * 24 * 60 * 60_000 });
    } finally {
      store.close();
    }
  }

  if (sub === "purge") {
    const entityId = pos[1] ?? die("Usage: aletheia sync purge <entity_id>");
    const store = hubStore(config);
    try {
      return store.purgeEntity(1, entityId);
    } finally {
      store.close();
    }
  }

  if (sub === "export" || sub === "import") {
    const dir = pos[1] ?? die(`Usage: aletheia sync ${sub} <directory>`);
    const { client } = syncToken(config);
    try {
      return sub === "export" ? client.exportFolder(dir) : client.importFolder(dir);
    } finally {
      client.close();
    }
  }

  // ---- end-to-end encryption (T-117) -------------------------------------------------------------
  const passphrase = typeof flags.passphrase === "string" && flags.passphrase !== "" ? flags.passphrase : process.env.ALETHEIA_SYNC_PASSPHRASE;

  if (sub === "upgrade-kdf") {
    const store = hubStore(config);
    try {
      return store.upgradeE2eeKdf(store.ensureAccount().id, { passphrase });
    } finally {
      store.close();
    }
  }

  if (sub === "enable-e2ee") {
    const store = hubStore(config);
    try {
      const result = store.enableE2ee(store.ensureAccount().id, { passphrase });
      return {
        ...result,
        note: "Future ops are encrypted with the data key. Old plaintext ops stay until `aletheia sync purge-plaintext`. Devices run `aletheia sync unlock-e2ee --passphrase <p>`. Export a recovery key with `aletheia sync export-recovery-key --out <file>`; without the passphrase and the recovery file the data is unrecoverable.",
      };
    } finally {
      store.close();
    }
  }

  if (sub === "unlock-e2ee") {
    const { client, token, url } = syncToken(config);
    try {
      if (!url || !token) die("No sync hub configured. Run: aletheia sync join <url> <code>");
      if (typeof flags["recovery-file"] === "string") {
        const { readFileSync } = await import("node:fs");
        return client.importRecoveryKey(readFileSync(flags["recovery-file"], "utf8"));
      }
      return client.unlockE2ee({ url, token, passphrase });
    } finally {
      client.close();
    }
  }

  if (sub === "rotate-key") {
    const store = hubStore(config);
    try {
      return store.rotateE2eeKey(store.ensureAccount().id, { passphrase });
    } finally {
      store.close();
    }
  }

  if (sub === "change-passphrase") {
    const store = hubStore(config);
    try {
      const oldPassphrase = typeof flags.old === "string" ? flags.old : process.env.ALETHEIA_SYNC_OLD_PASSPHRASE;
      const newPassphrase = typeof flags.new === "string" ? flags.new : process.env.ALETHEIA_SYNC_NEW_PASSPHRASE;
      return store.changePassphrase(store.ensureAccount().id, { oldPassphrase, newPassphrase });
    } finally {
      store.close();
    }
  }

  if (sub === "export-recovery-key") {
    const outFile = flags.out ?? die("Usage: aletheia sync export-recovery-key --out <file>");
    const { client } = syncToken(config);
    try {
      const content = client.exportRecoveryKey();
      const { writeFileSync } = await import("node:fs");
      writeFileSync(outFile, `${content}\n`, { mode: 0o600 });
      return { wrote: outFile, mode: "0600", note: "This file is the data keys. Keep it offline. Without it and the passphrase the ciphertext is unrecoverable." };
    } finally {
      client.close();
    }
  }

  if (sub === "purge-plaintext") {
    const store = hubStore(config);
    try {
      return store.purgePlaintext(store.ensureAccount().id, { apply: !!flags.apply, passphrase });
    } finally {
      store.close();
    }
  }

  return die("Usage: aletheia sync pair | join <url> <code> | status | devices | revoke <device> | push | pull | run | compact | purge <entity_id> | export <dir> | import <dir> | enable-e2ee | unlock-e2ee | rotate-key | change-passphrase | upgrade-kdf | export-recovery-key --out <file> | purge-plaintext [--apply]");
}

/**
 * `aletheia mcp-link` manages the private remote MCP endpoint (T-107). Hub-side: it reads sync.db
 * directly and mints a scoped token. The token is printed once and travels in the Authorization
 * header, never in the URL.
 */
export function runMcpLinkCommand({ config, flags, pos }) {
  const sub = pos[0];
  const store = new SyncStore(config.syncDb);
  try {
    const account = store.ensureAccount();
    if (sub === "create") {
      const projects = typeof flags.projects === "string" ? flags.projects.split(",").map((p) => p.trim()).filter(Boolean) : [];
      const scope = flags.scope === "sync" || flags.scope === "admin" ? flags.scope : "mcp";
      const minted = store.mintToken(account.id, { scope, name: typeof flags.name === "string" ? flags.name : null, projects });
      const base = (typeof flags.url === "string" && flags.url ? flags.url : `http://127.0.0.1:${config.syncPort}`).replace(/\/+$/, "");
      const url = `${base}/mcp`;
      const header = `Authorization: Bearer ${minted.token}`;
      return {
        id: minted.id,
        scope,
        projects,
        url,
        token: minted.token,
        note: "The token is shown once and travels in the Authorization header, never in the URL. Revoke with: aletheia mcp-link revoke <id>.",
        claudeCode: `claude mcp add --transport http aletheia ${url} --header "${header}"`,
        claudeDesktop: JSON.stringify({ mcpServers: { aletheia: { type: "http", url, headers: { Authorization: `Bearer ${minted.token}` } } } }, null, 2),
      };
    }
    if (sub === "list") {
      return { links: store.listTokens(account.id).filter((token) => ["mcp", "read", "sync", "admin"].includes(token.scope)).map((token) => ({ id: token.id, scope: token.scope, name: token.name, projects: token.projects, revokedAt: token.revoked_at, lastUsedAt: token.last_used_at })) };
    }
    if (sub === "revoke") {
      const id = Number(pos[1] ?? "");
      if (!Number.isSafeInteger(id)) return die("Usage: aletheia mcp-link revoke <id>");
      const revoked = store.revokeToken(account.id, id);
      store.audit(account.id, { action: "token.revoke", result: revoked ? "ok" : "missing", detail: { id } });
      return { revoked };
    }
    return die("Usage: aletheia mcp-link create [--projects a,b] [--scope mcp|sync|admin] [--name x] [--url https://hub.example] | list | revoke <id>");
  } finally {
    store.close();
  }
}

/** `aletheia audit` reads the sync audit log (the hub's append-only audit table). */
export function readAudit(config, limit) {
  const store = hubStore(config);
  try {
    return store.auditLog(1, limit);
  } finally {
    store.close();
  }
}

/** `aletheia audit export` renders the sync audit log as JSONL (default) or CSV with a date range. */
export function exportAuditLog(config, { from = null, to = null, format = "jsonl" } = {}) {
  const store = hubStore(config);
  try {
    return exportAudit(store, store.ensureAccount().id, { from, to, format });
  } finally {
    store.close();
  }
}

/** Helpers exported for tests and the server. */
export { mergeOps, replicaContentHash };
