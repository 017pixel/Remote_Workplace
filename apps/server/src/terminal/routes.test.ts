import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TerminalManager } from "./Manager.js";
import { registerTerminalRoutes } from "./routes.js";
import { registerEditorProxy } from "../services/editorProxy.js";

const apps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
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
      headers: { "tailscale-user-login": "terminal-test@example.com" },
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

    const socket = await app.injectWS("/api/v1/terminal", { headers: { "tailscale-user-login": "terminal-test@example.com" } });
    const created = new Promise<Record<string, unknown>>((resolve) => {
      socket.on("message", (data: Buffer) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type === "terminal.created") resolve(message);
      });
    });
    socket.send(JSON.stringify({ type: "terminal.create", requestId: "project-terminal", projectId: "remote-workplace", cols: 80, rows: 24 }));

    await expect(created).resolves.toMatchObject({ type: "terminal.created", requestId: "project-terminal", kind: "shell", cwd: "/tmp" });
    expect(resolveProjectPath).toHaveBeenCalledWith("remote-workplace");
    socket.terminate();
    manager.shutdown();
  });
});
