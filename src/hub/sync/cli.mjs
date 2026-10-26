// The `aletheia sync` and `aletheia audit` commands. Hub-side commands read sync.db directly; device-side
// commands use the local replica/outbox and speak HTTP to the hub. Nothing here is a hook and no model runs.
import { SyncStore } from "./store.mjs";
import { SyncClient } from "./client.mjs";
import { mergeOps, replicaContentHash } from "./engine.mjs";

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

  return die("Usage: aletheia sync pair | join <url> <code> | status | devices | revoke <device> | push | pull | run | compact | purge <entity_id> | export <dir> | import <dir>");
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

/** Helpers exported for tests and the server. */
export { mergeOps, replicaContentHash };
