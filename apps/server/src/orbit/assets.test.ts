import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OrbitAssetRepository } from "./assets.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

async function repository() {
  const directory = await mkdtemp(join(tmpdir(), "workbench-assets-"));
  directories.push(directory);
  return new OrbitAssetRepository(join(directory, "workbench.sqlite"), join(directory, "archive"), 1024, 2048);
}

describe("OrbitAssetRepository", () => {
  it("archives an asset once and reuses it for identical content", async () => {
    const assets = await repository();
    const first = await assets.create({ filename: "bild.png", mimeType: "image/png", buffer: Buffer.from("asset") });
    const duplicate = await assets.create({ filename: "kopie.png", mimeType: "image/png", buffer: Buffer.from("asset") });
    expect(duplicate.id).toBe(first.id);
    const stored = await assets.file(first.id);
    expect(stored?.asset).toMatchObject({ filename: "bild.png", mimeType: "image/png", bytes: 5 });
    expect(await readFile(stored!.path, "utf8")).toBe("asset");
    assets.close();
  });

  it("lists archived assets with an opaque continuation cursor", async () => {
    const assets = await repository();
    await assets.create({ filename: "eins.txt", mimeType: "text/plain", buffer: Buffer.from("one") });
    await assets.create({ filename: "zwei.txt", mimeType: "text/plain", buffer: Buffer.from("two") });
    await assets.create({ filename: "drei.txt", mimeType: "text/plain", buffer: Buffer.from("three") });
    const first = assets.list(2, null);
    expect(first.assets).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const cursor = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8")) as { createdAt: string; id: string };
    const second = assets.list(2, cursor);
    expect(second.assets).toHaveLength(1);
    expect([...first.assets, ...second.assets].map((asset) => asset.id)).toHaveLength(3);
    assets.close();
  });

  it("stores files under a real, extension-preserving name on disk", async () => {
    const assets = await repository();
    const file = await assets.create({ filename: "bericht.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf-bytes") });
    const stored = await assets.file(file.id);
    expect(basename(stored!.path)).toMatch(/^[0-9a-f]{12}-bericht\.pdf$/);
    assets.close();
  });

  it("keeps traversal attempts inside the archive directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-assets-"));
    directories.push(directory);
    const archive = join(directory, "archive");
    const assets = new OrbitAssetRepository(join(directory, "workbench.sqlite"), archive, 1024, 2048);
    const file = await assets.create({ filename: "../../etc/passwd", mimeType: "text/plain", buffer: Buffer.from("x") });
    const stored = await assets.file(file.id);
    expect(basename(stored!.path)).not.toContain("/");
    const entries = await readdir(archive);
    expect(entries).toContain(basename(stored!.path));
    assets.close();
  });
});
