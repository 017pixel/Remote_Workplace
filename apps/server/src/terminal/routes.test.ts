import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalManager } from "./Manager.js";
import { registerTerminalRoutes } from "./routes.js";
import { registerEditorProxy } from "../services/editorProxy.js";
import { TerminalDatabase } from "./database.js";

const apps: ReturnType<typeof Fastify>[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("terminal websocket route", () => {
  it("uses the direct WebSocket API exposed by @fastify/websocket v11", async () => {
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({
      allowedRoots: ["/tmp"],
      defaultCwd: "/tmp",
      maxSessions: 1,
    });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, {
      prefix: "/api/v1",
      manager,
      allowedUsers: ["terminal-test@example.com"],
    });
    await registerEditorProxy(app);
    await app.ready();

    const socket = await app.injectWS("/api/v1/terminal", {
      headers: { "tailscale-user-login": "terminal-test@example.com", origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" },
    });
    const pong = new Promise<string>((resolve) => {
      socket.once("message", (data: Buffer) => resolve(data.toString()));
    });
    socket.send(JSON.stringify({ type: "terminal.ping" }));

    expect(JSON.parse(await pong)).toEqual({ type: "terminal.pong" });
    socket.terminate();
    manager.shutdown();
  });

  it("uses the configured development identity when the browser WebSocket has no proxy header", async () => {
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({
      allowedRoots: ["/tmp"],
      defaultCwd: "/tmp",
      maxSessions: 1,
    });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, {
      prefix: "/api/v1",
      manager,
      allowedUsers: ["terminal-dev@example.com"],
      developmentUser: "terminal-dev@example.com",
    });
    await app.ready();

    const socket = await app.injectWS("/api/v1/terminal", {
      headers: { origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" },
    });
    const pong = new Promise<string>((resolve) => {
      socket.once("message", (data: Buffer) => resolve(data.toString()));
    });
    socket.send(JSON.stringify({ type: "terminal.ping" }));

    expect(JSON.parse(await pong)).toEqual({ type: "terminal.pong" });
    socket.terminate();
    manager.shutdown();
  });

  it("resolves a project ID on the server before creating a session", async () => {
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({ allowedRoots: ["/tmp"], defaultCwd: "/tmp", maxSessions: 1 });
    const resolveProjectPath = vi.fn(async () => "/tmp");
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, {
      prefix: "/api/v1",
      manager,
      allowedUsers: ["terminal-test@example.com"],
      resolveProjectPath,
    });
    await app.ready();

    const socket = await app.injectWS("/api/v1/terminal", { headers: { "tailscale-user-login": "terminal-test@example.com", origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" } });
    const created = new Promise<Record<string, unknown>>((resolve) => {
      socket.on("message", (data: Buffer) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type === "terminal.created") resolve(message);
      });
    });
    socket.send(JSON.stringify({ type: "terminal.create", requestId: "project-terminal", projectId: "wrapt", cols: 80, rows: 24 }));

    await expect(created).resolves.toMatchObject({ type: "terminal.created", requestId: "project-terminal", kind: "shell", cwd: "/tmp" });
    expect(resolveProjectPath).toHaveBeenCalledWith("wrapt");
    socket.terminate();
    manager.shutdown();
  });

  it("uses an explicitly validated split directory before the project root", async () => {
    const splitDirectory = await mkdtemp(join(tmpdir(), "wrapt-terminal-split-"));
    directories.push(splitDirectory);
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({ allowedRoots: ["/tmp"], defaultCwd: "/tmp", maxSessions: 1 });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, {
      prefix: "/api/v1",
      manager,
      allowedUsers: ["terminal-test@example.com"],
      resolveProjectPath: async () => "/tmp",
    });
    await app.ready();

    const socket = await app.injectWS("/api/v1/terminal", { headers: { "tailscale-user-login": "terminal-test@example.com", origin: "http://localhost", host: "localhost", "x-forwarded-proto": "http" } });
    const created = new Promise<Record<string, unknown>>((resolve) => {
      socket.on("message", (data: Buffer) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type === "terminal.created") resolve(message);
      });
    });
    socket.send(JSON.stringify({ type: "terminal.create", requestId: "split-terminal", projectId: "wrapt", cwd: splitDirectory, cols: 80, rows: 24 }));

    await expect(created).resolves.toMatchObject({ type: "terminal.created", requestId: "split-terminal", cwd: splitDirectory });
    socket.terminate();
    manager.shutdown();
  });

  it("exposes authenticated session and workspace synchronization endpoints", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wrapt-terminal-routes-"));
    directories.push(directory);
    const database = new TerminalDatabase(join(directory, "wrapt.sqlite"));
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({ allowedRoots: ["/tmp"], defaultCwd: "/tmp", maxSessions: 1, database });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, { prefix: "/api/v1", manager, database, allowedUsers: ["terminal-test@example.com"] });
    await app.ready();
    const headers = { "tailscale-user-login": "terminal-test@example.com" };
    expect((await app.inject({ method: "GET", url: "/api/v1/terminal/sessions", headers })).json()).toMatchObject({ sessions: [] });
    expect((await app.inject({ method: "GET", url: "/api/v1/terminal/workspace", headers })).json()).toMatchObject({ revision: 0, document: { version: 2, entries: [], folders: [{ id: "default", name: "Terminal" }] } });
    // Ein altes v1-Dokument wird beim Schreiben automatisch nach v2 migriert.
    const saved = await app.inject({ method: "PUT", url: "/api/v1/terminal/workspace", headers, payload: { document: { version: 1, areas: {} }, expectedRevision: 0 } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ revision: 1, document: { version: 2 } });
    // Serverseitige Operationen ändern das Layout transaktional.
    const ops = await app.inject({
      method: "POST",
      url: "/api/v1/terminal/workspace/ops",
      headers,
      payload: {
        expectedRevision: 1,
        operations: [{
          type: "createEntry",
          entry: { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "Build", parentFolderId: null, sortOrder: 0, pinned: true, persistent: true, kind: "shell", projectId: null, initialCwd: null },
        }],
      },
    });
    expect(ops.statusCode).toBe(200);
    expect(ops.json()).toMatchObject({ revision: 2, document: { entries: [{ name: "Build", pinned: true }] } });
    manager.shutdown();
    database.close();
  });

  it("migrates an already stored V1 workspace on GET and keeps ops working", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wrapt-terminal-routes-v1-"));
    directories.push(directory);
    const database = new TerminalDatabase(join(directory, "wrapt.sqlite"));
    const internal = database as unknown as { db: { prepare: (sql: string) => { run: (...params: (string | number)[]) => void } } };
    internal.db.prepare("INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at) VALUES (?, ?, ?, ?)").run(
      "terminal-test@example.com",
      JSON.stringify({ version: 1, areas: {} }),
      343,
      "2026-08-19T08:00:00.000Z",
    );
    const app = Fastify();
    apps.push(app);
    const manager = new TerminalManager({ allowedRoots: ["/tmp"], defaultCwd: "/tmp", maxSessions: 1, database });
    await app.register(websocket, { options: { maxPayload: 65_536 } });
    await app.register(registerTerminalRoutes, { prefix: "/api/v1", manager, database, allowedUsers: ["terminal-test@example.com"] });
    await app.ready();
    const headers = { "tailscale-user-login": "terminal-test@example.com" };

    // GET darf beim Migrieren nicht mehr mit 500 abbrechen (Regression:
    // "cannot start a transaction within a transaction").
    const loaded = await app.inject({ method: "GET", url: "/api/v1/terminal/workspace", headers });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json()).toMatchObject({ revision: 344, document: { version: 2 } });

    // Ops auf dem migrierten Stand funktionieren ebenfalls.
    const ops = await app.inject({
      method: "POST",
      url: "/api/v1/terminal/workspace/ops",
      headers,
      payload: {
        expectedRevision: 344,
        operations: [{
          type: "createEntry",
          entry: { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "Build", parentFolderId: null, sortOrder: 0, pinned: true, persistent: true, kind: "shell", projectId: null, initialCwd: null },
        }],
      },
    });
    expect(ops.statusCode).toBe(200);
    expect(ops.json()).toMatchObject({ revision: 345 });
    manager.shutdown();
    database.close();
  });
});
