import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
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

  it("verschweigt eine Deduplizierung nicht als falsche Ordnerzuordnung", async () => {
    const assets = await repository();
    const firstFolder = assets.createFolder("Erster Ordner");
    const secondFolder = assets.createFolder("Zweiter Ordner");
    await assets.create({ filename: "bild.png", mimeType: "image/png", buffer: Buffer.from("asset"), folderId: firstFolder.id });

    await expect(assets.create({ filename: "bild-kopie.png", mimeType: "image/png", buffer: Buffer.from("asset"), folderId: secondFolder.id }))
      .rejects.toMatchObject({ code: "ORBIT_ASSET_DUPLICATE", statusCode: 409 });
    expect(assets.list(10, null, firstFolder.id).assets).toHaveLength(1);
    expect(assets.list(10, null, secondFolder.id).assets).toHaveLength(0);
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
    expect(basename(stored!.path)).toMatch(/^[0-9a-f]{64}-bericht\.pdf$/);
    assets.close();
  });

  it("streams uploads with a hard size limit and removes partial files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-assets-"));
    directories.push(directory);
    const archive = join(directory, "archive");
    const assets = new OrbitAssetRepository(join(directory, "workbench.sqlite"), archive, 5, 2048);
    await expect(assets.createStream({
      filename: "zu-gross.txt",
      mimeType: "text/plain",
      stream: Readable.from([Buffer.from("123"), Buffer.from("456")]),
    })).rejects.toMatchObject({ code: "ORBIT_ASSET_TOO_LARGE", statusCode: 413 });
    expect(await readdir(archive)).toEqual([]);
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

  it("uses folder filters with stable cursor parameter ordering", async () => {
    const assets = await repository();
    const folder = assets.createFolder("Ordner");
    await assets.create({ filename: "eins.txt", mimeType: "text/plain", buffer: Buffer.from("one"), folderId: folder.id });
    await assets.create({ filename: "zwei.txt", mimeType: "text/plain", buffer: Buffer.from("two"), folderId: folder.id });
    await assets.create({ filename: "root.txt", mimeType: "text/plain", buffer: Buffer.from("root") });
    const first = assets.list(1, null, folder.id);
    const cursor = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8")) as { createdAt: string; id: string };
    const second = assets.list(1, cursor, folder.id);
    expect([...first.assets, ...second.assets]).toHaveLength(2);
    expect([...first.assets, ...second.assets].every((asset) => asset.folderId === folder.id)).toBe(true);
    assets.close();
  });

  it("reserves the shared quota atomically across concurrent repositories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "workbench-assets-quota-"));
    directories.push(directory);
    const path = join(directory, "workbench.sqlite");
    const archive = join(directory, "archive");
    const first = new OrbitAssetRepository(path, archive, 10, 5);
    const second = new OrbitAssetRepository(path, archive, 10, 5);
    const results = await Promise.allSettled([
      first.create({ filename: "first.bin", mimeType: "application/octet-stream", buffer: Buffer.from("1234") }),
      second.create({ filename: "second.bin", mimeType: "application/octet-stream", buffer: Buffer.from("5678") }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    first.close();
    second.close();
  });
});
