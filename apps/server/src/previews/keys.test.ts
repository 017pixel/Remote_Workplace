import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewSecrets } from "./keys.js";

const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "preview-keys-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("PreviewSecrets", () => {
  it("legt fehlende Schlüssel einmalig und mit stabilem Material an", () => {
    const directory = temporaryDirectory();
    const first = new PreviewSecrets(directory).storageKey();
    const second = new PreviewSecrets(directory).storageKey();

    expect(first).toEqual(second);
    expect(first).toHaveLength(32);
  });

  it("überschreibt einen beschädigten bestehenden Schlüssel nicht", () => {
    const directory = temporaryDirectory();
    const path = join(directory, "preview-storage.key");
    writeFileSync(path, "beschädigt\n", { mode: 0o600 });

    expect(() => new PreviewSecrets(directory).storageKey()).toThrow(/beschädigt/);
    expect(readFileSync(path, "utf8")).toBe("beschädigt\n");
  });

  it("behandelt Lesefehler nicht als Erstprovisionierung", () => {
    if (process.getuid?.() === 0) return;
    const directory = temporaryDirectory();
    const path = join(directory, "preview-storage.key");
    writeFileSync(path, `${Buffer.alloc(32, 1).toString("base64")}\n`, { mode: 0o600 });
    chmodSync(path, 0o000);

    expect(() => new PreviewSecrets(directory).storageKey()).toThrow();
  });
});
