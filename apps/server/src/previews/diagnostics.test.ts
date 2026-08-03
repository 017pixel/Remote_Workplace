import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { previewDiagnosticEventSchema } from "@workbench/contracts";
import { PreviewDiagnosticsService, redactMetadata, redactText, redactUrl } from "./diagnostics.js";
import { PreviewSecrets } from "./keys.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function service(options: { retentionDays?: number; maxDailyBytes?: number; maxTotalBytes?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "workbench-preview-logs-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const secrets = new PreviewSecrets(join(directory, "secrets"));
  const diagnostics = new PreviewDiagnosticsService({
    directory: join(directory, "preview-logs"),
    secrets,
    retentionDays: options.retentionDays ?? 7,
    maxEventBytes: 65_536,
    ...(options.maxDailyBytes === undefined ? {} : { maxDailyBytes: options.maxDailyBytes }),
    ...(options.maxTotalBytes === undefined ? {} : { maxTotalBytes: options.maxTotalBytes }),
    enabled: true,
  });
  cleanup.push(() => diagnostics.close());
  return {
    directory: join(directory, "preview-logs"),
    secrets,
    diagnostics,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return previewDiagnosticEventSchema.parse({
    id: randomUUID(),
    at: new Date().toISOString(),
    source: "client",
    category: "network",
    severity: "warn",
    message: "fetch 401 https://api.test/v1?token=geheim",
    route: "/api?token=geheim",
    metadata: {
      Authorization: "Bearer super-geheim",
      Cookie: "sid=abc",
      body: "{\"password\":\"x\"}",
      contact: "person@example.com",
    },
    ...overrides,
  });
}

describe("Preview-Diagnose", () => {
  it("entfernt Secrets aus URL, Text und Metadaten", () => {
    expect(redactUrl("https://user:pass@api.test/v1?token=abc&ok=1")).toContain("token=%5Bredigiert%5D");
    expect(redactUrl("https://user:pass@api.test/v1")).not.toContain("pass");
    expect(redactText("kontakt person@example.com")).toBe("kontakt [e-mail]");
    const metadata = redactMetadata({ Authorization: "Bearer x", body: "geheim", nested: { Cookie: "sid=1" } }) as Record<string, unknown>;
    expect(metadata.Authorization).toBe("[redigiert]");
    expect(metadata.body).toBe("[nicht erfasst]");
    expect((metadata.nested as Record<string, unknown>).Cookie).toBe("[redigiert]");
  });

  it("schreibt redigierte JSONL-Zeilen mit Pseudonym und Modus 0600", async () => {
    const { diagnostics, directory, secrets } = await service();
    diagnostics.record([event()], { userId: "person@example.com" });
    await diagnostics.flush();
    const files = await readdir(directory);
    const logFile = files.find((name) => name.endsWith(".jsonl"))!;
    expect(logFile).toBeDefined();
    const content = await readFile(join(directory, logFile), "utf8");
    expect(content).not.toContain("super-geheim");
    expect(content).not.toContain("sid=abc");
    expect(content).not.toContain("person@example.com");
    expect(content).toContain(secrets.pseudonym("person@example.com"));
    expect((await stat(join(directory, logFile))).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  });

  it("zählt verworfene Ereignisse und filtert nach Severity", async () => {
    const { diagnostics } = await service();
    diagnostics.record([event({ severity: "debug", message: "leise" }), event({ severity: "error", message: "laut" })], { userId: "a@b.test", dropped: 12 });
    const errors = diagnostics.list({ severity: "error" });
    expect(errors.events.map((entry) => entry.message)).toEqual(["laut"]);
    expect(errors.dropped).toBe(12);
  });

  it("komprimiert abgeschlossene Tage und entfernt alte", async () => {
    const { diagnostics, directory } = await service({ retentionDays: 2 });
    diagnostics.record([event()], { userId: "a@b.test" });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const ancient = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    await writeFile(join(directory, `${yesterday}.jsonl`), "{}\n", { mode: 0o600 });
    await writeFile(join(directory, `${ancient}.jsonl`), "{}\n", { mode: 0o600 });
    await diagnostics.rotate();
    const files = await readdir(directory);
    expect(files).toContain(`${yesterday}.jsonl.gz`);
    expect(files).not.toContain(`${yesterday}.jsonl`);
    expect(files.some((name) => name.startsWith(ancient))).toBe(false);
    expect(files).toContain("index.json");
  });

  it("liest innerhalb der Retention auch komprimierte Tageslogs", async () => {
    const { diagnostics } = await service({ retentionDays: 2 });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    diagnostics.record([event({ at: yesterday, message: "aus dem komprimierten Log" })], { userId: "a@b.test" });
    await diagnostics.rotate();
    await expect(diagnostics.readLog({ since: new Date(Date.now() - 2 * 86_400_000).toISOString() }, "a@b.test"))
      .resolves.toEqual([expect.objectContaining({ message: "aus dem komprimierten Log" })]);
  });

  it("erzwingt Tages- und Gesamtquoten vor dem Schreiben", async () => {
    const { diagnostics } = await service({ maxDailyBytes: 1, maxTotalBytes: 1 });
    expect(diagnostics.record([event()], { userId: "a@b.test" })).toMatchObject({ stored: 0, dropped: 1 });
    await diagnostics.flush();
  });

  it("begrenzt Rohdiagnose-Sitzungen auf 15 Minuten", async () => {
    const { diagnostics } = await service();
    const session = diagnostics.startCapture("node-1", 60);
    expect(Date.parse(session.expiresAt) - Date.parse(session.startedAt)).toBe(15 * 60_000);
    expect(diagnostics.activeCapture("node-1")?.id).toBe(session.id);
    diagnostics.stopCapture(session.id);
    expect(diagnostics.activeCapture("node-1")).toBeNull();
  });
});
