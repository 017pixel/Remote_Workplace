import type { PreviewLocalStorageEntry } from "@wrapt/contracts";
import { sha256Hex } from "./sha256";

/** Dieselbe kanonische Form wie auf dem Server: nach Schlüssel sortierte Paare. */
export function canonicalizeSnapshot(entries: readonly PreviewLocalStorageEntry[]): string {
  const sorted = [...entries].sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return JSON.stringify(sorted.map((entry) => [entry.key, entry.value]));
}

export function snapshotHash(entries: readonly PreviewLocalStorageEntry[]): string {
  return sha256Hex(canonicalizeSnapshot(entries));
}

export function snapshotBytes(entries: readonly PreviewLocalStorageEntry[]): number {
  const encoder = new TextEncoder();
  return entries.reduce((sum, entry) => sum + encoder.encode(entry.key).length + encoder.encode(entry.value).length, 0);
}
