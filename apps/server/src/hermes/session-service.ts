import { hermesCronResponseSchema, hermesModelsResponseSchema, hermesResultSchema, hermesResultsResponseSchema, hermesSessionSchema, hermesSessionsResponseSchema, hermesTaskSchema, hermesTasksResponseSchema, type HermesCronJob, type HermesResult, type HermesSession, type HermesSessionSource, type HermesTask, type Project } from "@workbench/contracts";
import { HermesClientError } from "./client.js";
import type { HermesDashboardClient } from "./client.js";
import type { HermesAcpManager } from "./acp/Manager.js";
import { truncateText } from "./redaction.js";

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function asDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value < 10_000_000_000 ? value * 1_000 : value).toISOString();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function source(value: unknown): HermesSessionSource {
  const normalized = String(value ?? "other").toLowerCase();
  if (normalized === "tui" || normalized === "acp") return "acp";
  if (normalized === "web" || normalized === "cli" || normalized === "telegram" || normalized === "cron") return normalized;
  return "other";
}

function providerFromModel(model: string | null): string | null {
  if (!model) return null;
  const index = model.indexOf(":");
  return index > 0 ? model.slice(0, index) : null;
}

function rawSessions(value: unknown): unknown[] {
  const data = object(value);
  return Array.isArray(data.sessions) ? data.sessions : Array.isArray(value) ? value : [];
}

function projectForCwd(cwd: string | null, projects: readonly Project[]): string | null {
  if (!cwd) return null;
  return projects.find((project) => project.path === cwd)?.id ?? null;
}

export class HermesSessionService {
  constructor(
    private readonly client: HermesDashboardClient,
    private readonly manager: HermesAcpManager,
    private readonly projects: () => Promise<readonly Project[]> = async () => [],
  ) {}

  async listSessions(options: { limit: number; offset: number; query?: string; source?: HermesSessionSource }): Promise<ReturnType<typeof hermesSessionsResponseSchema.parse>> {
    const raw = options.query?.trim()
      ? await this.client.get(`/api/sessions/search?q=${encodeURIComponent(options.query.trim())}&limit=${options.limit}`)
      : await this.client.get(`/api/sessions?limit=${options.limit}&offset=${options.offset}`);
    const projects = await this.projects();
    const data = object(raw);
    const items = options.query?.trim() && Array.isArray(data.results) ? data.results : rawSessions(raw);
    const sessions = items.map((item) => this.normalizeSession(item, projects)).filter((item) => !options.source || item.source === options.source);
    return hermesSessionsResponseSchema.parse({ sessions, nextCursor: sessions.length >= options.limit ? String(options.offset + sessions.length) : null, ...(typeof data.total === "number" ? { total: data.total } : {}) });
  }

  async getSession(sessionId: string): Promise<unknown> {
    const session = await this.client.get(`/api/sessions/${encodeURIComponent(sessionId)}`);
    return session;
  }

  async getSessionSummary(sessionId: string): Promise<HermesSession> {
    const raw = await this.getSession(sessionId);
    const summary = this.normalizeSession(object(raw).session ?? raw, await this.projects());
    if (summary.id !== sessionId) throw new HermesClientError("SESSION_NOT_FOUND", "Die Hermes-Session wurde nicht gefunden.", 404, false);
    return summary;
  }

  async getMessages(sessionId: string): Promise<unknown> {
    return this.client.get(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.delete(`/api/sessions/${encodeURIComponent(sessionId)}`);
  }

  async tasks(): Promise<ReturnType<typeof hermesTasksResponseSchema.parse>> {
    const sessions = (await this.listSessions({ limit: 100, offset: 0 })).sessions;
    const nowMs = Date.now();
    const tasks: HermesTask[] = sessions.filter((session) => session.status === "running").map((session) => {
      const started = session.createdAt ? Date.parse(session.createdAt) : nowMs;
      return hermesTaskSchema.parse({ id: `session:${session.id}`, sessionId: session.id, title: session.title, source: session.source, model: session.model, startedAt: session.updatedAt ?? new Date(nowMs).toISOString(), runtimeSeconds: Math.max(0, Math.floor((nowMs - started) / 1_000)), cancellable: true });
    });
    for (const managerSession of this.manager.sessionsSnapshot()) {
      if (!managerSession.running || tasks.some((task) => task.sessionId === managerSession.session.id)) continue;
      const started = managerSession.session.updatedAt ? Date.parse(managerSession.session.updatedAt) : nowMs;
      tasks.push(hermesTaskSchema.parse({ id: `acp:${managerSession.session.id}`, sessionId: managerSession.session.id, title: managerSession.session.title, source: "acp", model: managerSession.session.model, startedAt: managerSession.session.updatedAt ?? new Date(nowMs).toISOString(), runtimeSeconds: Math.max(0, Math.floor((nowMs - started) / 1_000)), cancellable: true }));
    }
    return hermesTasksResponseSchema.parse({ tasks });
  }

  async results(options: { source?: HermesSessionSource; status?: "success" | "failed"; offset?: number; limit?: number } = {}): Promise<ReturnType<typeof hermesResultsResponseSchema.parse>> {
    const limit = options.limit ?? 50;
    const sessions = (await this.listSessions({ limit: Math.min(100, limit + 20), offset: options.offset ?? 0 })).sessions;
    const results: HermesResult[] = sessions.filter((session) => session.status !== "running").map((session) => hermesResultSchema.parse({
      id: `result:${session.id}:${session.updatedAt ?? session.id}`,
      sessionId: session.id,
      source: session.source,
      status: session.status === "failed" ? "failed" : "success",
      title: session.title,
      preview: truncateText(session.title, 400),
      finishedAt: session.updatedAt ?? session.createdAt ?? new Date().toISOString(),
      cronJobId: null,
    })).filter((result) => (!options.source || result.source === options.source) && (!options.status || result.status === options.status));
    return hermesResultsResponseSchema.parse({ results: results.slice(0, limit), nextCursor: results.length >= limit ? String((options.offset ?? 0) + limit) : null });
  }

  async cron(): Promise<ReturnType<typeof hermesCronResponseSchema.parse>> {
    const raw = await this.client.get("/api/cron/jobs");
    const jobs = (Array.isArray(raw) ? raw : object(raw).jobs && Array.isArray(object(raw).jobs) ? object(raw).jobs as unknown[] : []).map((item) => this.normalizeCron(item));
    return hermesCronResponseSchema.parse({ jobs });
  }

  async models(): Promise<ReturnType<typeof hermesModelsResponseSchema.parse>> {
    const [infoRaw, optionsRaw] = await Promise.all([this.client.get("/api/model/info"), this.client.get("/api/model/options")]);
    const info = object(infoRaw);
    const currentId = typeof info.model === "string" ? info.model : null;
    const providers = object(optionsRaw).providers;
    const models = Array.isArray(providers) ? providers.flatMap((providerValue) => {
      const provider = object(providerValue);
      const providerId = typeof provider.slug === "string" ? provider.slug : null;
      const values = Array.isArray(provider.models) ? provider.models : [];
      return values.map((modelValue) => {
        const model = object(modelValue);
        const id = typeof modelValue === "string"
          ? modelValue
          : String(model.id ?? model.model ?? model.name ?? "");
        const qualifiedId = providerId && !id.includes(":") ? `${providerId}:${id}` : id;
        return id ? { id: qualifiedId, name: String(model.name ?? id), provider: providerId, active: id === currentId || qualifiedId === currentId } : null;
      }).filter((model): model is { id: string; name: string; provider: string | null; active: boolean } => model !== null);
    }) : [];
    if (models.length === 0 && currentId) models.push({ id: currentId, name: currentId, provider: providerFromModel(currentId), active: true });
    return hermesModelsResponseSchema.parse({ models, current: models.find((model) => model.active) ?? null });
  }

  async selectModel(model: string): Promise<void> {
    const provider = providerFromModel(model) ?? "auto";
    const modelName = model.includes(":") ? model.slice(model.indexOf(":") + 1) : model;
    await this.client.post("/api/model/set", { scope: "main", provider, model: modelName });
  }

  private normalizeSession(value: unknown, projects: readonly Project[]): HermesSession {
    const item = object(value);
    const id = String(item.id ?? item.session_id ?? "");
    const model = typeof item.model === "string" ? item.model : null;
    const createdAt = asDate(item.started_at ?? item.startedAt ?? item.created_at);
    const updatedAt = asDate(item.last_active ?? item.updated_at ?? item.updatedAt ?? item.ended_at) ?? createdAt;
    const active = item.is_active === true || (item.is_active === undefined && item.ended_at == null && updatedAt !== null && Date.now() - Date.parse(updatedAt) < 300_000);
    const status = item.error || item.failed ? "failed" : active ? "running" : "idle";
    const cwd = typeof item.cwd === "string" ? item.cwd : typeof item.working_directory === "string" ? item.working_directory : null;
    return hermesSessionSchema.parse({ id: id || `unknown-${Date.now()}`, title: String(item.title ?? "Hermes-Session").slice(0, 200), source: source(item.source), model, provider: typeof item.provider === "string" ? item.provider : providerFromModel(model), cwd, projectId: projectForCwd(cwd, projects), messageCount: Math.max(0, Number(item.message_count ?? item.messageCount ?? item.messages_count ?? 0) || 0), createdAt, updatedAt, status });
  }

  private normalizeCron(value: unknown): HermesCronJob {
    const item = object(value);
    const id = String(item.id ?? item.job_id ?? item.name ?? `cron-${Date.now()}`);
    const lastStatusValue = String(item.last_status ?? item.lastStatus ?? item.status ?? "unknown").toLowerCase();
    const lastStatus = lastStatusValue === "success" || lastStatusValue === "completed" ? "success" : lastStatusValue === "failed" || lastStatusValue === "error" ? "failed" : lastStatusValue === "running" ? "running" : "unknown";
    return { id, name: String(item.name ?? id).slice(0, 200), schedule: cronSchedule(item).slice(0, 120), enabled: item.enabled !== false && item.paused !== true, nextRunAt: asDate(item.next_run_at ?? item.nextRunAt ?? item.next_run), lastRunAt: asDate(item.last_run_at ?? item.lastRunAt ?? item.last_run), lastStatus, adminPath: `/cron/${encodeURIComponent(id)}` };
  }

}

function cronSchedule(item: Record<string, unknown>): string {
  const direct = item.schedule_display ?? item.schedule ?? item.cron ?? item.expression ?? item.spec;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (direct && typeof direct === "object") {
    const schedule = direct as Record<string, unknown>;
    for (const key of ["display", "expr", "cron", "expression", "interval", "schedule"]) {
      if (typeof schedule[key] === "string" && String(schedule[key]).trim()) return String(schedule[key]).trim();
    }
  }
  if (item.next_run_at ?? item.nextRunAt) return "geplant";
  return "nach Zeitplan";
}
