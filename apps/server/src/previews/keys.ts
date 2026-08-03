import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { join } from "node:path";

/**
 * Geheimnisse der Preview-Funktionen liegen als eigene Dateien mit Modus `0600`
 * im Datenverzeichnis. Sie werden nie über eine API, ein Log oder einen Export
 * ausgegeben und nicht voneinander abgeleitet.
 */
export class PreviewSecrets {
  private readonly dataDirectory: string;
  private readonly cache = new Map<string, Buffer>();

  constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  private read(fileName: string, byteLength: number): Buffer {
    const cached = this.cache.get(fileName);
    if (cached) return cached;
    const path = join(this.dataDirectory, fileName);
    mkdirSync(this.dataDirectory, { recursive: true, mode: 0o700 });
    const readExisting = () => {
      const material = Buffer.from(readFileSync(path, "utf8").trim(), "base64");
      if (material.byteLength !== byteLength) {
        throw new Error(`Der Preview-Schlüssel ${fileName} ist beschädigt.`);
      }
      chmodSync(path, 0o600);
      return material;
    };
    let material: Buffer;
    try {
      material = readExisting();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const generated = randomBytes(byteLength);
      try {
        writeFileSync(path, `${generated.toString("base64")}\n`, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
          flush: true,
        });
        material = generated;
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
        // Ein paralleler Erststart hat den Schlüssel bereits atomar angelegt.
        material = readExisting();
      }
    }
    this.cache.set(fileName, material);
    return material;
  }

  /** AES-256-GCM-Schlüssel der localStorage-Snapshots. */
  storageKey(): Buffer {
    return this.read("preview-storage.key", 32);
  }

  /** HMAC-Schlüssel für die Pseudonymisierung von `userId` in Diagnoselogs. */
  logHmacKey(): Buffer {
    return this.read("preview-log-hmac.key", 32);
  }

  /**
   * Capability-Token für den lokalen Doctor. Nur über Loopback gültig; die
   * Kodierung entspricht exakt dem Dateiinhalt, damit `preview-doctor.sh` die
   * Datei unverändert als Bearer-Token senden kann.
   */
  capabilityToken(): string {
    return this.read("preview-agent-capability", 32).toString("base64");
  }

  /** Stabile Pseudonym-ID einer Benutzeridentität für persistierte Logs. */
  pseudonym(userId: string): string {
    return createHmac("sha256", this.logHmacKey()).update(userId).digest("hex").slice(0, 32);
  }

  matchesCapabilityToken(candidate: string): boolean {
    const expected = Buffer.from(this.capabilityToken());
    const given = Buffer.from(candidate);
    return expected.byteLength === given.byteLength && timingSafeEqual(expected, given);
  }
}
