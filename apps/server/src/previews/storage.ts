import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, constants as zlibConstants } from "node:zlib";
import {
  PREVIEW_STORAGE_LIMITS,
  type PreviewLocalStorageEntry,
  type PreviewLocalStorageSnapshot,
  type PreviewLocalStorageState,
} from "@workbench/contracts";
import { AppError } from "../utils/errors.js";
import type { PreviewSlotDatabase, SnapshotPayloadRow } from "./database.js";
import type { PreviewSecrets } from "./keys.js";

/** Kanonische, deterministisch sortierte Darstellung eines Snapshots. */
export function canonicalize(entries: readonly PreviewLocalStorageEntry[]): string {
  const sorted = [...entries].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return JSON.stringify(sorted.map((entry) => [entry.key, entry.value]));
}

export function snapshotHash(entries: readonly PreviewLocalStorageEntry[]): string {
  return createHash("sha256").update(canonicalize(entries), "utf8").digest("hex");
}

export function snapshotBytes(entries: readonly PreviewLocalStorageEntry[]): number {
  return entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.key, "utf8") + Buffer.byteLength(entry.value, "utf8"), 0);
}

export interface StorageServiceOptions {
  database: PreviewSlotDatabase;
  secrets: PreviewSecrets;
  mode: "off" | "opt-in";
  maxBytes: number;
  maxKeys: number;
}

/**
 * localStorage-Snapshots sind opt-in, größenbegrenzt und werden vor SQLite mit
 * AES-256-GCM verschlüsselt. `userId`, Storage-Profil, Revision und Klartext-Hash
 * sind als Additional Authenticated Data gebunden.
 */
export class PreviewStorageService {
  private readonly options: StorageServiceOptions;

  constructor(options: StorageServiceOptions) {
    this.options = options;
  }

  get enabledGlobally(): boolean {
    return this.options.mode === "opt-in";
  }

  private assertEnabled() {
    if (!this.enabledGlobally) {
      throw new AppError(409, "PREVIEW_STORAGE_DISABLED", "Die localStorage-Synchronisierung ist in dieser Installation deaktiviert.");
    }
  }

  private additionalData(userId: string, storageProfileId: string, revision: number, hash: string): Buffer {
    return Buffer.from(`${userId}|${storageProfileId}|${revision}|${hash}`, "utf8");
  }

  state(userId: string, storageProfileId: string): PreviewLocalStorageState {
    const rows = this.options.database.snapshots(userId, storageProfileId);
    const toSnapshot = (row: (typeof rows)[number], status: "ready" | "unavailable"): PreviewLocalStorageSnapshot => ({
      storageProfileId: row.storageProfileId,
      revision: row.revision,
      createdAt: row.createdAt,
      keyCount: row.keyCount,
      byteCount: row.byteCount,
      hash: row.hash,
      bridgeVersion: row.bridgeVersion,
      status,
    });
    const [current, ...history] = rows;
    const readable = current ? this.canDecrypt(userId, storageProfileId, current.revision) : true;
    return {
      storageProfileId,
      enabled: this.options.database.storageEnabled(userId, storageProfileId),
      current: current ? toSnapshot(current, readable ? "ready" : "unavailable") : null,
      history: history.slice(0, PREVIEW_STORAGE_LIMITS.maxHistory).map((row) => toSnapshot(row, "ready")),
    };
  }

  private canDecrypt(userId: string, storageProfileId: string, revision: number): boolean {
    try {
      this.read(userId, storageProfileId, revision);
      return true;
    } catch {
      return false;
    }
  }

  setEnabled(userId: string, storageProfileId: string, enabled: boolean): PreviewLocalStorageState {
    if (enabled) this.assertEnabled();
    this.options.database.setStorageEnabled(userId, storageProfileId, enabled);
    return this.state(userId, storageProfileId);
  }

  /**
   * Schreibt eine neue Revision. Bei abweichender `expectedRevision` antwortet der
   * Aufrufer mit `409`; Last-Write-Wins ist bewusst nicht der stille Standard.
   */
  write(userId: string, storageProfileId: string, input: {
    expectedRevision: number | null;
    hash: string;
    bridgeVersion: string;
    entries: PreviewLocalStorageEntry[];
  }): PreviewLocalStorageSnapshot {
    this.assertEnabled();
    if (!this.options.database.storageEnabled(userId, storageProfileId)) {
      throw new AppError(409, "PREVIEW_STORAGE_NOT_ENABLED", "Für diese Preview ist der Storage-Snapshot nicht aktiviert.");
    }
    if (input.entries.length > this.options.maxKeys) {
      throw new AppError(413, "PREVIEW_STORAGE_TOO_MANY_KEYS", `Ein Snapshot darf höchstens ${this.options.maxKeys} Schlüssel enthalten.`);
    }
    const byteCount = snapshotBytes(input.entries);
    if (byteCount > this.options.maxBytes) {
      throw new AppError(413, "PREVIEW_STORAGE_TOO_LARGE", `Ein Snapshot darf höchstens ${this.options.maxBytes} Bytes groß sein.`);
    }
    const hash = snapshotHash(input.entries);
    if (hash !== input.hash) {
      throw new AppError(400, "PREVIEW_STORAGE_HASH_MISMATCH", "Der übermittelte Snapshot-Hash passt nicht zum Inhalt.");
    }
    const rows = this.options.database.snapshots(userId, storageProfileId);
    const currentRevision = rows[0]?.revision ?? 0;
    if ((input.expectedRevision ?? 0) !== currentRevision) {
      throw new AppError(409, "PREVIEW_STORAGE_CONFLICT", "Der Snapshot wurde zwischenzeitlich von einem anderen Gerät geändert.");
    }
    const revision = currentRevision + 1;
    const createdAt = new Date().toISOString();
    // Komprimieren passiert ausschließlich serverseitig mit festem Ausgabelimit.
    const compressed = brotliCompressSync(Buffer.from(canonicalize(input.entries), "utf8"), {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
    });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.options.secrets.storageKey(), iv);
    cipher.setAAD(this.additionalData(userId, storageProfileId, revision, hash));
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const row: SnapshotPayloadRow = {
      storageProfileId,
      revision,
      createdAt,
      keyCount: input.entries.length,
      byteCount,
      hash,
      bridgeVersion: input.bridgeVersion,
      iv,
      authTag: cipher.getAuthTag(),
      ciphertext,
    };
    const committed = this.options.database.writeSnapshot(
      userId,
      row,
      PREVIEW_STORAGE_LIMITS.maxHistory,
      currentRevision,
    );
    if (!committed) {
      throw new AppError(409, "PREVIEW_STORAGE_CONFLICT", "Der Snapshot wurde zwischenzeitlich von einem anderen Gerät geändert.");
    }
    return {
      storageProfileId,
      revision,
      createdAt,
      keyCount: input.entries.length,
      byteCount,
      hash,
      bridgeVersion: input.bridgeVersion,
      status: "ready",
    };
  }

  /** Entschlüsselt authentifiziert. Ein falscher Auth-Tag führt nie zu Klartext. */
  read(userId: string, storageProfileId: string, revision?: number): { snapshot: PreviewLocalStorageSnapshot; entries: PreviewLocalStorageEntry[] } {
    const rows = this.options.database.snapshots(userId, storageProfileId);
    const target = revision ?? rows[0]?.revision;
    if (target === undefined) {
      throw new AppError(404, "PREVIEW_STORAGE_EMPTY", "Für dieses Storage-Profil existiert noch kein Snapshot.");
    }
    const row = this.options.database.snapshotPayload(userId, storageProfileId, target);
    if (!row) throw new AppError(404, "PREVIEW_STORAGE_EMPTY", "Diese Snapshot-Revision existiert nicht.");
    let plain: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.options.secrets.storageKey(), Buffer.from(row.iv));
      decipher.setAAD(this.additionalData(userId, storageProfileId, row.revision, row.hash));
      decipher.setAuthTag(Buffer.from(row.authTag));
      plain = brotliDecompressSync(Buffer.concat([decipher.update(Buffer.from(row.ciphertext)), decipher.final()]));
    } catch {
      throw new AppError(409, "PREVIEW_STORAGE_UNAVAILABLE", "Der Snapshot lässt sich mit dem aktuellen Schlüssel nicht entschlüsseln.");
    }
    const entries = (JSON.parse(plain.toString("utf8")) as Array<[string, string]>).map(([key, value]) => ({ key, value }));
    if (snapshotHash(entries) !== row.hash) {
      throw new AppError(409, "PREVIEW_STORAGE_UNAVAILABLE", "Der Snapshot ist beschädigt und wird nicht zurückgespielt.");
    }
    return {
      snapshot: {
        storageProfileId: row.storageProfileId,
        revision: row.revision,
        createdAt: row.createdAt,
        keyCount: row.keyCount,
        byteCount: row.byteCount,
        hash: row.hash,
        bridgeVersion: row.bridgeVersion,
        status: "ready",
      },
      entries,
    };
  }

  conflict(userId: string, storageProfileId: string) {
    const [current] = this.options.database.snapshots(userId, storageProfileId);
    if (!current) return null;
    return {
      serverRevision: current.revision,
      serverHash: current.hash,
      serverKeyCount: current.keyCount,
      serverByteCount: current.byteCount,
    };
  }

  clear(userId: string, storageProfileId: string): void {
    this.options.database.deleteSnapshots(userId, storageProfileId);
  }
}
