import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { canonicalizeSnapshot, snapshotBytes, snapshotHash } from "./previewStorageSnapshot";
import { sha256Hex } from "./sha256";

describe("Snapshot-Kanonisierung", () => {
  it("sortiert deterministisch nach Schlüssel", () => {
    const first = canonicalizeSnapshot([{ key: "b", value: "2" }, { key: "a", value: "1" }]);
    const second = canonicalizeSnapshot([{ key: "a", value: "1" }, { key: "b", value: "2" }]);
    expect(first).toBe(second);
    expect(first).toBe("[[\"a\",\"1\"],[\"b\",\"2\"]]");
  });

  it("berechnet denselben SHA-256 wie Node", () => {
    const entries = [{ key: "auth", value: "token" }, { key: "theme", value: "dark" }];
    const expected = createHash("sha256").update(canonicalizeSnapshot(entries), "utf8").digest("hex");
    expect(snapshotHash(entries)).toBe(expected);
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("Grüße über Ports")).toBe(createHash("sha256").update("Grüße über Ports", "utf8").digest("hex"));
  });

  it("zählt UTF-8-Bytes, nicht Zeichen", () => {
    expect(snapshotBytes([{ key: "ü", value: "ä" }])).toBe(4);
  });
});
