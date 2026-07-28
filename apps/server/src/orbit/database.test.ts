import { readFile } from "node:fs/promises";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import { OrbitDatabase, createDefaultOrbitWorkspace } from "./database.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function database() {
  const directory = await mkdtemp(join(tmpdir(), "workbench-orbit-"));
  directories.push(directory);
  return { path: join(directory, "workbench.sqlite"), db: new OrbitDatabase(join(directory, "workbench.sqlite")) };
}

describe("OrbitDatabase", () => {
  it("persists a validated document with an increasing revision", async () => {
    const { path, db } = await database();
    const initial = db.get();
    expect(initial.initialized).toBe(false);
    expect(initial.revision).toBe(0);

    const document = createDefaultOrbitWorkspace();
    document.boards[0]!.name = "Server-Orbit";
    const saved = db.save(document, 0);
    expect(saved.revision).toBe(1);
    expect(saved.initialized).toBe(true);
    db.close();

    const backup = JSON.parse(await readFile(`${path}.orbit-backups/current.json`, "utf8")) as {
      revision: number;
      sha256: string;
      document: { boards: Array<{ name: string }> };
    };
    expect(backup).toMatchObject({ revision: 1, sha256: expect.stringMatching(/^[a-f0-9]{64}$/), document: { boards: [{ name: "Server-Orbit" }] } });

    const history = new DatabaseSync(path, { readOnly: true });
    expect(history.prepare("SELECT revision, source FROM orbit_document_revisions").all()).toEqual([{ revision: 1, source: "autosave" }]);
    history.close();

    const reopened = new OrbitDatabase(path);
    expect(reopened.get()).toMatchObject({ revision: 1, initialized: true, document: { boards: [{ name: "Server-Orbit" }] } });
    reopened.close();
  });

  it("rejects stale writes instead of silently overwriting another device", async () => {
    const { path, db } = await database();
    db.save(createDefaultOrbitWorkspace(), 0);
    const stale = createDefaultOrbitWorkspace();
    stale.boards[0]!.name = "Veralteter Entwurf";
    let conflict: unknown;
    try { db.save(stale, 0); } catch (error) {
      conflict = error;
      expect(error).toMatchObject({ statusCode: 409, code: "ORBIT_REVISION_CONFLICT" });
    }
    expect(conflict).toBeInstanceOf(AppError);
    db.close();
    const inspected = new DatabaseSync(path, { readOnly: true });
    expect(inspected.prepare("SELECT count(*) count FROM orbit_conflict_backups").get()).toEqual({ count: 1 });
    inspected.close();
  });

  it("blocks a suddenly emptied populated Orbit and retains the current revision", async () => {
    const { path, db } = await database();
    const populated = createDefaultOrbitWorkspace();
    populated.boards[0]!.nodes = Array.from({ length: 4 }, (_, index) => ({
      id: `node-${index}`,
      type: "note" as const,
      title: `Notiz ${index}`,
      position: { x: index * 40, y: 0 },
      size: { width: 340, height: 220 },
      projectId: null,
      parentId: null,
      runtimeId: null,
      toolType: null,
      previewId: null,
      previewLayout: null,
      previewTarget: null,
      previewPath: "/",
      previewDeviceId: null,
      previewOrientation: "portrait" as const,
      previewSlotId: null,
      previewIsolation: true,
      previewRuntime: "iframe" as const,
      previewReferenceId: null,
      previewLastUsedAt: null,
      assetId: null,
      assetMimeType: null,
      assetBytes: null,
      provider: null,
      content: "",
      language: null,
      color: null,
      locked: false,
      zIndex: index,
    }));
    db.save(populated, 0);
    expect(() => db.save(createDefaultOrbitWorkspace(), 1)).toThrowError(AppError);
    expect(db.get().revision).toBe(1);
    expect(db.get().document.boards[0]!.nodes).toHaveLength(4);
    db.close();
    const inspected = new DatabaseSync(path, { readOnly: true });
    expect(inspected.prepare("SELECT count(*) count FROM orbit_conflict_backups").get()).toEqual({ count: 1 });
    inspected.close();
  });

  it("recovers the latest checksum-verified external snapshot when the database disappears", async () => {
    const { path, db } = await database();
    const document = createDefaultOrbitWorkspace();
    document.boards[0]!.name = "Wiederhergestellt";
    db.save(document, 0);
    db.close();
    await unlink(path);

    const recovered = new OrbitDatabase(path);
    expect(recovered.get()).toMatchObject({ revision: 1, initialized: true, document: { boards: [{ name: "Wiederhergestellt" }] } });
    recovered.close();
  });

  it("settles a stale legacy client on the current server document", async () => {
    const { path, db } = await database();
    const currentDocument = createDefaultOrbitWorkspace();
    currentDocument.boards[0]!.name = "Aktueller Serverstand";
    const current = db.save(currentDocument, 0);

    const staleDocument = createDefaultOrbitWorkspace();
    staleDocument.boards[0]!.name = "Gesicherter Alt-Entwurf";
    const settled = db.saveLegacy(staleDocument, 0);

    expect(settled).toMatchObject({
      revision: current.revision,
      document: { boards: [{ name: "Aktueller Serverstand" }] },
    });
    db.close();

    const reopened = new OrbitDatabase(path);
    expect(reopened.get()).toMatchObject({
      revision: current.revision,
      document: { boards: [{ name: "Aktueller Serverstand" }] },
    });
    reopened.close();
  });
});
