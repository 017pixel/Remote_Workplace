import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { randomUUID } from "node:crypto";
import type { HermesErrorCode, HermesMessage, HermesServerMessage, HermesSession, HermesSessionSource, HermesToolCall } from "@wrapt/contracts";
import { hermesSessionSchema } from "@wrapt/contracts";
import { settings } from "../../config/settings.js";
import { HermesClientError } from "../client.js";
import { redactText, truncateText } from "../redaction.js";
import { encodeAcpMessage, parseAcpMessage, type AcpJsonRpcNotification, type AcpJsonRpcResponse } from "./protocol.js";
import { normalizeAcpUpdate, normalizePermission } from "./normalize.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface SessionRecord {
  session: HermesSession;
  cwd: string;
  running: boolean;
  cancelRequested: boolean;
  assistant: Map<string, { content: string; createdAt: string }>;
  assistantMessageId: string | null;
  tools: Map<string, HermesToolCall>;
  clientMessageIds: string[];
}

interface SessionMetadata {
  title?: string;
  source?: HermesSessionSource;
  model?: string | null;
  provider?: string | null;
  cwd?: string | null;
  projectId?: string | null;
  messageCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface PendingApproval {
  rpcId: number | string;
  sessionId: string;
  timer: NodeJS.Timeout;
}

type ManagerListener = (message: HermesServerMessage) => void;

function providerFromModel(model: string | null): string | null {
  if (!model) return null;
  const separator = model.indexOf(":");
  return separator > 0 ? model.slice(0, separator) : null;
}

function safeMessageId(value: string | null | undefined): string { return value && value.length > 0 ? value : randomUUID(); }

function now(): string { return new Date().toISOString(); }

export class HermesAcpManager {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private startup: Promise<void> | null = null;
  private requestId = 0;
  private readonly pending = new Map<number | string, PendingRequest>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly listeners = new Set<ManagerListener>();
  private readonly replayListeners = new Map<string, Set<ManagerListener>>();
  private restartTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private restartAttempt = 0;
  private connectionCount = 0;
  private closing = false;
  private intentionalStop = false;

  constructor(
    private readonly options: {
      maxSessions?: number;
      requestTimeoutSeconds?: number;
      approvalTimeoutSeconds?: number;
      maxResponseBytes?: number;
    } = {},
  ) {}

  subscribe(listener: ManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get ready(): boolean { return this.child !== null && this.startup === null; }

  activeSessionCount(): number { return [...this.sessions.values()].filter((record) => record.running).length; }

  hasConnections(): boolean { return this.connectionCount > 0; }

  session(sessionId: string): HermesSession | null { return this.sessions.get(sessionId)?.session ?? null; }

  sessionsSnapshot(): Array<{ session: HermesSession; running: boolean }> {
    return [...this.sessions.values()].map((record) => ({ session: record.session, running: record.running }));
  }

  openConnection(): void {
    this.connectionCount += 1;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  closeConnection(): void {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    this.scheduleIdleShutdown();
  }

  async createSession(cwd: string, title?: string): Promise<HermesSession> {
    await this.ensureProcess();
    if (this.sessions.size >= (this.options.maxSessions ?? settings.hermes.acpMaxSessions)) {
      throw new HermesClientError("RATE_LIMITED", "Die maximale Zahl aktiver Hermes-Sessions ist erreicht.", 429, true);
    }
    const result = await this.request("session/new", { cwd, mcpServers: [] });
    const response = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const sessionId = typeof response.sessionId === "string" ? response.sessionId : "";
    if (!sessionId) throw new HermesClientError("ACP_UNAVAILABLE", "Hermes hat keine Session-ID geliefert.");
    const model = this.currentModel(response);
    const session = hermesSessionSchema.parse({
      id: sessionId,
      title: title?.trim() || "Neuer Hermes-Chat",
      source: "acp",
      model,
      provider: providerFromModel(model),
      cwd,
      projectId: null,
      messageCount: 0,
      createdAt: now(),
      updatedAt: now(),
      status: "idle",
    });
    this.sessions.set(sessionId, { session, cwd, running: false, cancelRequested: false, assistant: new Map(), assistantMessageId: null, tools: new Map(), clientMessageIds: [] });
    return session;
  }

  async attachSession(sessionId: string, cwd: string, metadata: SessionMetadata = {}, replayListener?: ManagerListener): Promise<HermesSession> {
    await this.ensureProcess();
    const existing = this.sessions.get(sessionId);
    const created = !existing;
    if (!existing) {
      const placeholder = hermesSessionSchema.parse({ id: sessionId, title: "Hermes-Session", source: "acp", model: null, provider: null, cwd, projectId: null, messageCount: 0, createdAt: now(), updatedAt: now(), status: "idle" });
      this.sessions.set(sessionId, { session: placeholder, cwd, running: false, cancelRequested: false, assistant: new Map(), assistantMessageId: null, tools: new Map(), clientMessageIds: [] });
    }
    if (replayListener) {
      const listeners = this.replayListeners.get(sessionId) ?? new Set<ManagerListener>();
      listeners.add(replayListener);
      this.replayListeners.set(sessionId, listeners);
    }
    try {
      const result = await this.request("session/load", { cwd, sessionId, mcpServers: [] });
      if (result === null) throw new HermesClientError("SESSION_NOT_FOUND", "Die Hermes-Session wurde nicht gefunden.", 404, false);
      const response = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const current = this.sessions.get(sessionId);
      const model = metadata.model ?? this.currentModel(response);
      const session = hermesSessionSchema.parse({
        id: sessionId,
        title: metadata.title?.trim() || current?.session.title || "Hermes-Session",
        source: metadata.source ?? current?.session.source ?? "acp",
        model,
        provider: metadata.provider ?? providerFromModel(model),
        cwd: metadata.cwd ?? current?.session.cwd ?? cwd,
        projectId: metadata.projectId ?? current?.session.projectId ?? null,
        messageCount: metadata.messageCount ?? current?.session.messageCount ?? 0,
        createdAt: metadata.createdAt ?? current?.session.createdAt ?? now(),
        updatedAt: metadata.updatedAt ?? current?.session.updatedAt ?? now(),
        status: "idle",
      });
      const record = this.sessions.get(sessionId);
      if (record) {
        record.session = session;
        record.cwd = session.cwd ?? cwd;
      } else {
        this.sessions.set(sessionId, { session, cwd, running: false, cancelRequested: false, assistant: new Map(), assistantMessageId: null, tools: new Map(), clientMessageIds: [] });
      }
      return session;
    } catch (error) {
      if (created) this.sessions.delete(sessionId);
      throw error;
    } finally {
      if (replayListener) {
        const listeners = this.replayListeners.get(sessionId);
        listeners?.delete(replayListener);
        if (listeners?.size === 0) this.replayListeners.delete(sessionId);
      }
    }
  }

  async prompt(sessionId: string, content: string, clientMessageId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new HermesClientError("SESSION_NOT_FOUND", "Die Hermes-Session ist nicht geladen.", 404, false);
    if (record.clientMessageIds.includes(clientMessageId)) return;
    if (record.running) throw new HermesClientError("SESSION_BUSY", "Diese Hermes-Session verarbeitet bereits eine Aufgabe.", 409, true);
    record.clientMessageIds.push(clientMessageId);
    if (record.clientMessageIds.length > 50) record.clientMessageIds.shift();
    record.running = true;
    record.cancelRequested = false;
    record.assistant.clear();
    record.assistantMessageId = null;
    record.tools.clear();
    record.session = { ...record.session, status: "running", updatedAt: now(), messageCount: record.session.messageCount + 1 };
    const userMessage: HermesMessage = { id: clientMessageId, role: "user", content, toolCalls: [], createdAt: now(), truncated: false };
    this.emit({ v: 1, type: "message.appended", sessionId, message: userMessage });
    this.emit({ v: 1, type: "task.state", sessionId, state: "running" });
    try {
      await this.request("session/prompt", { sessionId, prompt: [{ type: "text", text: content }], messageId: clientMessageId });
      const last = [...record.assistant.entries()].at(-1);
      if (last) {
        this.emit({ v: 1, type: "message.complete", sessionId, message: { id: last[0], role: "assistant", content: last[1].content, toolCalls: [...record.tools.values()], createdAt: last[1].createdAt, truncated: last[1].content.length > 200_000 } });
        record.assistant.delete(last[0]);
        record.assistantMessageId = null;
      }
    } catch (error) {
      const cancelled = record.cancelRequested;
      if (cancelled) {
        for (const tool of record.tools.values()) {
          if (tool.status !== "pending" && tool.status !== "running") continue;
          const cancelledTool: HermesToolCall = { ...tool, status: "failed", result: tool.result ?? "Aufgabe abgebrochen.", exitCode: tool.exitCode ?? 130, durationMs: tool.durationMs ?? null };
          record.tools.set(tool.id, cancelledTool);
          this.emit({ v: 1, type: "tool.update", sessionId, toolCall: cancelledTool });
        }
      } else {
        this.emitError(sessionId, error instanceof HermesClientError ? error.code : "ACP_CRASHED", error instanceof Error ? error.message : "Hermes konnte die Aufgabe nicht ausführen.");
      }
    } finally {
      record.running = false;
      record.cancelRequested = false;
      record.session = { ...record.session, status: "idle", updatedAt: now(), messageCount: record.session.messageCount + 1 };
      this.emit({ v: 1, type: "task.state", sessionId, state: "idle" });
      this.scheduleIdleShutdown();
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new HermesClientError("SESSION_NOT_FOUND", "Die Hermes-Session ist nicht geladen.", 404, false);
    if (!record.running) return;
    record.cancelRequested = true;
    record.session = { ...record.session, status: "running" };
    this.emit({ v: 1, type: "task.state", sessionId, state: "cancelling" });
    try {
      // ACP definiert session/cancel als Notification. Als JSON-RPC-Request
      // gesendet gäbe es keine Antwort; der vermeintliche Timeout würde die
      // eigentliche Abbruchaktion im Browser als Fehler darstellen.
      this.sendNotification("session/cancel", { sessionId });
    } catch (error) {
      // Cancellation races with a fast provider response. Hermes then rejects
      // the request because the turn is already finished. Treat that case as
      // an idempotent stop; a real process failure is still surfaced.
      if (!(error instanceof HermesClientError) || error.code !== "ACP_UNAVAILABLE" || !this.child) throw error;
      record.running = false;
      record.session = { ...record.session, status: "idle", updatedAt: now() };
      this.emit({ v: 1, type: "task.state", sessionId, state: "idle" });
    }
  }

  async setModel(sessionId: string, model: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) throw new HermesClientError("SESSION_NOT_FOUND", "Die Hermes-Session ist nicht geladen.", 404, false);
    await this.request("set_session_model", { sessionId, modelId: model });
    const updated = { ...record.session, model, provider: providerFromModel(model), updatedAt: now() };
    record.session = hermesSessionSchema.parse(updated);
  }

  respondApproval(requestId: string, option: "allow_once" | "allow_session" | "deny", sessionId?: string): boolean {
    const pending = this.approvals.get(requestId);
    if (!pending || (sessionId !== undefined && pending.sessionId !== sessionId)) return false;
    this.approvals.delete(requestId);
    clearTimeout(pending.timer);
    const result = option === "deny" ? { outcome: { outcome: "cancelled" } } : { outcome: { outcome: "selected", optionId: option } };
    try { this.send({ jsonrpc: "2.0", id: pending.rpcId, result }); } catch { /* Der ACP-Prozess kann parallel beendet worden sein. */ }
    this.emit({ v: 1, type: "approval.resolved", requestId, option, reason: "answered" });
    return true;
  }

  async close(): Promise<void> {
    this.closing = true;
    this.intentionalStop = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    for (const approval of this.approvals.values()) clearTimeout(approval.timer);
    this.approvals.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("ACP geschlossen")); }
    this.pending.clear();
    this.replayListeners.clear();
    this.lines?.close();
    this.lines = null;
    this.child?.kill("SIGTERM");
    this.child = null;
    this.startup = null;
  }

  private currentModel(value: Record<string, unknown>): string | null {
    const models = value.models && typeof value.models === "object" ? value.models as Record<string, unknown> : {};
    return typeof models.currentModelId === "string" ? models.currentModelId : null;
  }

  private async ensureProcess(): Promise<void> {
    if (this.child && !this.startup) return;
    if (this.startup) return this.startup;
    this.closing = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.startup = this.startProcess()
      .catch((error: unknown) => {
        if (this.child) this.handleProcessExit(error instanceof Error ? error : new Error("ACP-Start fehlgeschlagen"));
        throw error;
      })
      .finally(() => { this.startup = null; });
    return this.startup;
  }

  private async startProcess(): Promise<void> {
    const python = settings.hermes.pythonPath;
    const home = settings.hermes.homeDirectory;
    const child = spawn(python, ["-m", "acp_adapter.entry"], {
      cwd: settings.hermes.checkoutDirectory,
      env: { ...process.env, HOME: settings.systemHomeDirectory, HERMES_HOME: home, PATH: `${python.replace(/\/python$/, "")}:${process.env.PATH ?? "/usr/bin:/bin"}` },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk: Buffer) => {
      const message = redactText(chunk.toString("utf8"), 2_000);
      if (message.trim()) console.debug(`[hermes-acp] ${message.trim()}`);
    });
    child.once("error", (error) => this.handleProcessExit(error));
    child.once("exit", (code, signal) => this.handleProcessExit(new Error(`ACP-Prozess beendet (${code ?? "?"}/${signal ?? "?"})`)));
    await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "wrapt", version: settings.appVersion },
    });
    this.restartAttempt = 0;
  }

  private handleProcessExit(error: Error) {
    if (!this.child) return;
    this.child = null;
    this.lines?.close();
    this.lines = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new HermesClientError("ACP_CRASHED", "Der Hermes-Chatprozess wurde beendet.")); }
    this.pending.clear();
    const intentionalStop = this.intentionalStop;
    this.intentionalStop = false;
    if (!intentionalStop) for (const record of this.sessions.values()) {
      record.running = false;
      record.session = { ...record.session, status: "failed", updatedAt: now() };
      this.emitError(record.session.id, "ACP_CRASHED", "Der Hermes-Chatprozess wurde beendet und wird beim nächsten Zugriff neu gestartet.");
    }
    if (!this.closing && !intentionalStop && (this.connectionCount > 0 || this.activeSessionCount() > 0) && !this.restartTimer) {
      const delay = Math.min(30_000, 1_000 * 2 ** this.restartAttempt);
      this.restartAttempt = Math.min(this.restartAttempt + 1, 5);
      this.restartTimer = setTimeout(() => { this.restartTimer = null; void this.ensureProcess().catch(() => undefined); }, delay);
      this.restartTimer.unref();
    }
    void error;
  }

  private handleLine(line: string) {
    const message = parseAcpMessage(line);
    if (!message) return;
    if ("id" in message && !("method" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const detail = redactText(message.error.message ?? `Fehlercode ${message.error.code ?? "unbekannt"}`, 500);
        console.debug(`[hermes-acp] ACP-Anfrage ${String(message.id)} abgelehnt: ${detail}`);
        pending.reject(new HermesClientError("ACP_UNAVAILABLE", "Hermes hat eine ACP-Anfrage abgelehnt."));
      }
      else pending.resolve(message.result ?? null);
      return;
    }
    if ("method" in message && message.method === "session/request_permission" && "id" in message) {
      const requestId = `approval-${randomUUID()}`;
      const params = message.params && typeof message.params === "object" ? message.params as Record<string, unknown> : {};
      const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
      const timeoutSeconds = this.options.approvalTimeoutSeconds ?? 60;
      const timer = setTimeout(() => {
        const approval = this.approvals.get(requestId);
        if (!approval) return;
        this.approvals.delete(requestId);
        try { this.send({ jsonrpc: "2.0", id: approval.rpcId, result: { outcome: { outcome: "cancelled" } } }); } catch { /* ACP beendet */ }
        this.emit({ v: 1, type: "approval.resolved", requestId, option: "deny", reason: "expired" });
      }, timeoutSeconds * 1_000);
      timer.unref();
      this.approvals.set(requestId, { rpcId: message.id, sessionId, timer });
      this.emit(normalizePermission(params, requestId, timeoutSeconds));
      return;
    }
    if ("method" in message && message.method === "session/update") this.handleSessionUpdate(message.params);
  }

  private handleSessionUpdate(paramsValue: unknown) {
    const params = paramsValue && typeof paramsValue === "object" ? paramsValue as Record<string, unknown> : {};
    const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
    const record = this.sessions.get(sessionId);
    if (!sessionId || !record) return;
    const normalized = normalizeAcpUpdate(params.update);
    if (!normalized) return;
    switch (normalized.kind) {
      case "message.replay": {
        const message: HermesMessage = { id: safeMessageId(normalized.messageId === "user" || normalized.messageId === "assistant" ? null : normalized.messageId), role: normalized.role, content: truncateText(normalized.content, 200_000), toolCalls: [], createdAt: now(), truncated: normalized.content.length > 200_000 };
        record.session = { ...record.session, messageCount: record.session.messageCount + 1, updatedAt: now() };
        this.emitSessionMessage(sessionId, { v: 1, type: "message.appended", sessionId, message });
        break;
      }
      case "message.delta": {
        const messageId = normalized.messageId === "assistant"
          ? (record.assistantMessageId ??= randomUUID())
          : safeMessageId(normalized.messageId);
        const current = record.assistant.get(messageId) ?? { content: "", createdAt: now() };
        current.content += normalized.delta;
        record.assistant.set(messageId, current);
        record.session = { ...record.session, updatedAt: now() };
        this.emit({ v: 1, type: "message.delta", sessionId, messageId, delta: truncateText(normalized.delta, 20_000) });
        break;
      }
      case "thought.delta": this.emitSessionMessage(sessionId, { v: 1, type: "thought.delta", sessionId, delta: truncateText(normalized.delta, 20_000) }); break;
      case "tool.update":
        record.tools.set(normalized.toolCall.id, normalized.toolCall);
        this.emitSessionMessage(sessionId, { v: 1, type: "tool.update", sessionId, toolCall: normalized.toolCall });
        break;
      case "commands.available": this.emitSessionMessage(sessionId, { v: 1, type: "commands.available", sessionId, commands: normalized.commands }); break;
      case "usage": this.emitSessionMessage(sessionId, { v: 1, type: "usage", sessionId, usage: normalized.usage }); break;
      case "session.title": record.session = { ...record.session, title: normalized.title, updatedAt: now() }; break;
    }
  }

  private emitError(sessionId: string | null, code: HermesErrorCode, message: string) {
    this.emit({ v: 1, type: "error", code, message: message.slice(0, 500), sessionId });
  }

  private emitSessionMessage(sessionId: string, message: HermesServerMessage): void {
    const replayListeners = this.replayListeners.get(sessionId);
    if (replayListeners && replayListeners.size > 0) {
      for (const listener of replayListeners) listener(message);
      return;
    }
    this.emit(message);
  }

  private emit(message: HermesServerMessage) { for (const listener of this.listeners) listener(message); }

  private send(message: AcpJsonRpcResponse) {
    if (!this.child?.stdin.writable) throw new HermesClientError("ACP_CRASHED", "Der Hermes-Chatprozess ist nicht verfügbar.");
    this.child.stdin.write(encodeAcpMessage(message));
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.child?.stdin.writable) throw new HermesClientError("ACP_CRASHED", "Der Hermes-Chatprozess ist nicht verfügbar.");
    const message: AcpJsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.child.stdin.write(encodeAcpMessage(message));
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.child?.stdin.writable) return Promise.reject(new HermesClientError("ACP_CRASHED", "Der Hermes-Chatprozess ist nicht verfügbar."));
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new HermesClientError("ACP_UNAVAILABLE", "Hermes hat nicht rechtzeitig geantwortet.")); }, (this.options.requestTimeoutSeconds ?? settings.hermes.requestTimeoutSeconds) * 1_000);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      try { this.child!.stdin.write(encodeAcpMessage({ jsonrpc: "2.0", id, method, params })); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new HermesClientError("ACP_CRASHED", "Die Verbindung zum Hermes-Chatprozess ist abgebrochen.")); }
    });
  }

  private scheduleIdleShutdown(): void {
    if (this.connectionCount > 0 || this.activeSessionCount() > 0 || !this.child || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.connectionCount === 0 && this.activeSessionCount() === 0) {
        this.intentionalStop = true;
        this.child?.kill("SIGTERM");
      }
    }, settings.hermes.acpIdleTimeoutSeconds * 1_000);
    this.idleTimer.unref();
  }
}
