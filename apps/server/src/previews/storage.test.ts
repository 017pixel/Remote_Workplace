import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewSlotDatabase } from "./database.js";
import { PreviewSecrets } from "./keys.js";
import { PreviewStorageService, snapshotHash } from "./storage.js";
import { AppError } from "../utils/errors.js";

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const user = "a@b.test";
const profile = "11111111-1111-4111-8111-111111111111";
const entries = [{ key: "theme", value: "dark" }, { key: "auth", value: "token-123" }];

async function service(options: { mode?: "off" | "opt-in" } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-preview-storage-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "workbench.sqlite");
  const database = new PreviewSlotDatabase(path);
  cleanup.push(() => database.close());
  const secrets = new PreviewSecrets(directory);
  const storage = new PreviewStorageService({
    database,
    secrets,
    mode: options.mode ?? "opt-in",
    maxBytes: 262_144,
    maxKeys: 1_000,
  });
  return { database, storage, path, directory };
}

describe("localStorage-Snapshots", () => {
  it("verlangt Opt-in und speichert nur verschlüsselt", async () => {
    const { storage, path } = await service();
    expect(() => storage.write(user, profile, { expectedRevision: null, hash: snapshotHash(entries), bridgeVersion: "v1", entries }))
      .toThrowError(/nicht aktiviert/);

    storage.setEnabled(user, profile, true);
    const snapshot = storage.write(user, profile, { expectedRevision: null, hash: snapshotHash(entries), bridgeVersion: "v1", entries });
    expect(snapshot.revision).toBe(1);
    expect(snapshot.keyCount).toBe(2);

    const inspection = new DatabaseSync(path, { readOnly: true });
    const row = inspection.prepare("SELECT ciphertext, iv, auth_tag authTag FROM preview_local_storage_snapshots").get() as { ciphertext: Uint8Array };
    inspection.close();
    expect(Buffer.from(row.ciphertext).toString("utf8")).not.toContain("token-123");
  });

  it("liest nur mit passendem Schlüssel und Auth-Tag zurück", async () => {
    const { storage, database, path } = await service();
    storage.setEnabled(user, profile, true);
    storage.write(user, profile, { expectedRevision: null, hash: snapshotHash(entries), bridgeVersion: "v1", entries });
    expect(storage.read(user, profile).entries).toEqual([...entries].sort((left, right) => left.key < right.key ? -1 : 1));

    // Fremder Benutzer sieht nichts.
    expect(() => storage.read("fremd@example.com", profile)).toThrowError(AppError);

    // Manipulierter Auth-Tag darf niemals Klartext liefern.
    const inspection = new DatabaseSync(path);
    inspection.prepare("UPDATE preview_local_storage_snapshots SET auth_tag = ?").run(Buffer.alloc(16));
    inspection.close();
    expect(() => storage.read(user, profile)).toThrowError(/entschlüsseln/);
    expect(storage.state(user, profile).current?.status).toBe("unavailable");
    expect(database.snapshots(user, profile)).toHaveLength(1);
  });

  it("antwortet bei paralleler Änderung mit einem Konflikt", async () => {
    const { storage } = await service();
    storage.setEnabled(user, profile, true);
    storage.write(user, profile, { expectedRevision: null, hash: snapshotHash(entries), bridgeVersion: "v1", entries });
    const next = [{ key: "theme", value: "light" }];
    expect(() => storage.write(user, profile, { expectedRevision: null, hash: snapshotHash(next), bridgeVersion: "v1", entries: next }))
      .toThrowError(/anderen Gerät/);
    const conflict = storage.conflict(user, profile);
    expect(conflict).toMatchObject({ serverRevision: 1, serverKeyCount: 2 });
    const written = storage.write(user, profile, { expectedRevision: 1, hash: snapshotHash(next), bridgeVersion: "v1", entries: next });
    expect(written.revision).toBe(2);
  });

  it("hält höchstens drei historische Revisionen", async () => {
    const { storage } = await service();
    storage.setEnabled(user, profile, true);
    for (let revision = 0; revision < 6; revision += 1) {
      const value = [{ key: "count", value: String(revision) }];
      storage.write(user, profile, { expectedRevision: revision === 0 ? null : revision, hash: snapshotHash(value), bridgeVersion: "v1", entries: value });
    }
    const state = storage.state(user, profile);
    expect(state.current?.revision).toBe(6);
    expect(state.history.length).toBeLessThanOrEqual(3);
  });

  it("weist zu große Snapshots und falsche Hashes ab", async () => {
    const { storage } = await service();
    storage.setEnabled(user, profile, true);
    expect(() => storage.write(user, profile, { expectedRevision: null, hash: "0".repeat(64), bridgeVersion: "v1", entries }))
      .toThrowError(/Hash/);
    const huge = Array.from({ length: 20 }, (_, index) => ({ key: `k${index}`, value: "x".repeat(20_000) }));
    expect(() => storage.write(user, profile, { expectedRevision: null, hash: snapshotHash(huge), bridgeVersion: "v1", entries: huge }))
      .toThrowError(/Bytes groß/);
  });

  it("bleibt im Modus off vollständig deaktiviert", async () => {
    const { storage } = await service({ mode: "off" });
    expect(storage.enabledGlobally).toBe(false);
    expect(() => storage.setEnabled(user, profile, true)).toThrowError(/deaktiviert/);
  });
});
