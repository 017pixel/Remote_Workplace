import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { FileManagerService } from "./fileManagerService.js";

let root: string;
let service: FileManagerService;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "workbench-fm-"));
  await mkdir(join(root, "ordner"));
  await writeFile(join(root, "readme.md"), "# Hallo\nZeile zwei\nZeile drei");
  await writeFile(join(root, "bild.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await writeFile(join(root, "ordner", "notiz.txt"), "Inhalt der Notiz");
  await symlink(join(root, "readme.md"), join(root, "link.md"));
  service = new FileManagerService(root, 4_096, 1024 * 1024, join(root, "state.sqlite"));
});

afterAll(async () => {
  service.close();
  await rm(root, { recursive: true, force: true });
});

describe("FileManagerService", () => {
  it("liest Textvorschau mit Metadaten", async () => {
    const preview = await service.textPreview({ path: join(root, "readme.md") });
    expect(preview.text).toContain("# Hallo");
    expect(preview.lineCount).toBe(3);
    expect(preview.mimeType).toBe("text/markdown");
    expect(preview.truncated).toBe(false);
  });

  it("schneidet eine Textvorschau sauber an einer UTF-8-Zeichengrenze ab", async () => {
    // 4_095 ASCII-Bytes + ein zweibytiges „ä" → die Grenze (4_096) liegt mitten
    // im „ä". Die Datei ist gültiger Text und muss lesbar bleiben.
    const boundaryFile = join(root, "grenze.txt");
    await writeFile(boundaryFile, Buffer.concat([Buffer.alloc(4_095, 0x61), Buffer.from([0xc3, 0xa4])]));
    const preview = await service.textPreview({ path: boundaryFile });
    expect(preview.truncated).toBe(true);
    expect(preview.text.endsWith("ä")).toBe(true);
    expect(preview.text).not.toMatch(/\uFFFD/);
    // Vervollständigte Zeichen dürfen die Grenze nur minimal überschreiten.
    expect(preview.text.length).toBeLessThanOrEqual(4_097);
    await service.remove({ path: boundaryFile });
  });

  it("verwirft ein Zeichen, das erst an der Truncation-Grenze beginnt", async () => {
    // 4_096 ASCII-Bytes + ein zweibytiges „ä" direkt hinter der Grenze: Das „ä"
    // beginnt erst bei Byte 4_096 und wird komplett verworfen.
    const boundaryFile = join(root, "grenze2.txt");
    await writeFile(boundaryFile, Buffer.concat([Buffer.alloc(4_096, 0x61), Buffer.from([0xc3, 0xa4])]));
    const preview = await service.textPreview({ path: boundaryFile });
    expect(preview.truncated).toBe(true);
    expect(preview.text.length).toBe(4_096);
    expect(preview.text.endsWith("a")).toBe(true);
    await service.remove({ path: boundaryFile });
  });

  it("verweigert Binärdateien als Textvorschau", async () => {
    await expect(service.textPreview({ path: join(root, "bild.png") })).rejects.toMatchObject({ code: "FILESYSTEM_NOT_TEXT" });
  });

  it("verweigert eine Datei mit ungültigen Bytes im Präfix als Textvorschau", async () => {
    const invalid = join(root, "kaputt.txt");
    await writeFile(invalid, Buffer.from([0x61, 0x62, 0x63, 0xff, 0x64, 0x65]));
    await expect(service.textPreview({ path: invalid })).rejects.toMatchObject({ code: "FILESYSTEM_NOT_TEXT" });
    await service.remove({ path: invalid });
  });

  it("lehnt Pfade außerhalb des Roots ab", async () => {
    await expect(service.textPreview({ path: "/etc/passwd" })).rejects.toMatchObject({ code: "FILESYSTEM_PATH_OUTSIDE_ROOT" });
  });

  it("lehnt Symlinks ab", async () => {
    await expect(service.textPreview({ path: join(root, "link.md") })).rejects.toMatchObject({ code: "FILESYSTEM_SYMLINK_FORBIDDEN" });
  });

  it("streamt mit Range-Support", async () => {
    const media = await service.openMedia({ path: join(root, "readme.md") }, "bytes=0-4");
    expect(media.statusCode).toBe(206);
    expect(media.headers["Content-Range"]).toBe("bytes 0-4/29");
    const chunks: Buffer[] = [];
    for await (const chunk of media.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("# Hal");
  });

  it("gibt bei ungültigem Range 416", async () => {
    await expect(service.openMedia({ path: join(root, "readme.md") }, "bytes=999-")).rejects.toMatchObject({ code: "FILESYSTEM_RANGE_INVALID" });
  });

  it("benennt um, verschiebt, legt Ordner an und löscht", async () => {
    const renamed = await service.rename({ path: join(root, "readme.md"), name: "gelesen.md" });
    expect(renamed.endsWith("gelesen.md")).toBe(true);
    const moved = await service.move({ path: renamed, targetDirectory: join(root, "ordner") });
    expect(moved.startsWith(join(root, "ordner"))).toBe(true);
    const created = await service.mkdir({ path: join(root, "ordner"), name: "neu" });
    expect(created.endsWith("neu")).toBe(true);
    await expect(service.remove({ path: join(root, "ordner") })).rejects.toMatchObject({ code: "FILESYSTEM_DIRECTORY_NOT_EMPTY" });
    await service.remove({ path: created });
    await service.remove({ path: moved });
    await expect(readFile(join(root, "ordner", "gelesen.md"))).rejects.toThrow();
  });

  it("verweigert Kollisionen beim Umbenennen", async () => {
    await writeFile(join(root, "duplikat-a.txt"), "a");
    await writeFile(join(root, "duplikat-b.txt"), "b");
    await expect(service.rename({ path: join(root, "duplikat-a.txt"), name: "duplikat-b.txt" })).rejects.toMatchObject({ code: "FILE_EXISTS" });
    await service.remove({ path: join(root, "duplikat-a.txt") });
    await service.remove({ path: join(root, "duplikat-b.txt") });
  });

  it("lädt Dateien hoch und verweigert Duplikate", async () => {
    const entry = await service.upload({
      directory: root,
      filename: "hochgeladen.txt",
      stream: Readable.from(Buffer.from("Upload-Inhalt")),
    });
    expect(entry.kind).toBe("file");
    expect(entry.readable).toBe(true);
    expect(await readFile(join(root, "hochgeladen.txt"), "utf8")).toBe("Upload-Inhalt");
    await expect(service.upload({ directory: root, filename: "hochgeladen.txt", stream: Readable.from("x") }))
      .rejects.toMatchObject({ code: "FILE_EXISTS" });
    await service.remove({ path: join(root, "hochgeladen.txt") });
  });

  it("bricht Uploads über dem Byte-Limit ab und hinterlässt keine Temp-Datei", async () => {
    await expect(service.upload({
      directory: root,
      filename: "zu-gross.bin",
      stream: Readable.from(Buffer.alloc(100, 0x42)),
      byteLimit: 10,
    })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(readFile(join(root, "zu-gross.bin"))).rejects.toThrow();
    const leftovers = await readdir(root);
    expect(leftovers.some((name) => name.startsWith(".wrapt-upload-"))).toBe(false);
  });

  it("sucht rekursiv und überspringt node_modules", async () => {
    await mkdir(join(root, "ordner", "node_modules"), { recursive: true });
    await writeFile(join(root, "ordner", "node_modules", "meinModul.js"), "// weg");
    const result = await service.search("notiz");
    expect(result.entries.some((entry) => entry.path.endsWith("notiz.txt"))).toBe(true);
    expect(result.entries.some((entry) => entry.name === "meinModul.js")).toBe(false);
  });

  it("speichert und lädt den Zustand mit Revision", async () => {
    const initial = service.state();
    expect(initial.revision).toBe(0);
    const document = { currentPath: root, history: [root], favorites: [], viewMode: "list" as const, sortKey: "name" as const, sortDirection: "asc" as const };
    const saved = await service.saveState({ document, expectedRevision: 0 });
    expect(saved.revision).toBe(1);
    await expect(service.saveState({ document, expectedRevision: 0 })).rejects.toMatchObject({ code: "FILE_MANAGER_STATE_CONFLICT" });
    const loaded = service.state();
    expect(loaded.document.currentPath).toBe(root);
    expect(loaded.revision).toBe(1);
  });

  it("schützt den Root vor dem Löschen", async () => {
    await expect(service.remove({ path: root })).rejects.toMatchObject({ code: "FILESYSTEM_ROOT_PROTECTED" });
  });
});
