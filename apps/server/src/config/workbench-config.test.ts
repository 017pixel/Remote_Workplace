import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadWorkbenchConfig, persistUsageMonitoring, readUsageMonitoring, workbenchConfigSchema, type WorkbenchConfig } from "./workbench-config.js";

function exampleConfig(): WorkbenchConfig {
  return workbenchConfigSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), "../../config/workbench.example.json"), "utf8")) as unknown);
}

describe("Workbench-Preview-Konfiguration", () => {
  it("lädt fehlende Hermes-Konfiguration mit sicheren Defaults", () => {
    const config = exampleConfig() as unknown as Record<string, unknown>;
    delete config.hermes;
    const parsed = workbenchConfigSchema.parse(config);
    expect(parsed.hermes).toMatchObject({ enabled: true, host: "127.0.0.1", port: 9119, proxyPrefix: "/hermes" });
  });

  it("erzwingt Loopback und einen freien Hermes-Port", () => {
    const nonLoopback = exampleConfig();
    nonLoopback.hermes.host = "0.0.0.0";
    expect(() => workbenchConfigSchema.parse(nonLoopback)).toThrowError(/Loopback/);

    const collision = exampleConfig();
    collision.hermes.port = collision.t3.port;
    expect(() => workbenchConfigSchema.parse(collision)).toThrowError(/Hermes-Port/);

    const invalidPrefix = exampleConfig();
    invalidPrefix.hermes.proxyPrefix = "hermes";
    expect(() => workbenchConfigSchema.parse(invalidPrefix)).toThrowError();
  });

  it("akzeptiert getrennte interne und öffentliche Slot-Ports", () => {
    expect(workbenchConfigSchema.parse(exampleConfig()).previews).toMatchObject({
      allowedProjectPorts: [1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040],
      slotPorts: [3901, 3902, 3903, 3904, 3905, 3906, 3907, 3908, 3909, 3910, 3911, 3912],
      publicPorts: [8451, 8452, 8453, 8454, 8455, 8456, 8457, 8458, 8459, 8460, 8461, 8462],
    });
  });

  it("erzwingt eindeutige Projektports ohne Kollision mit Workbench-Diensten", () => {
    const duplicate = exampleConfig();
    duplicate.previews.allowedProjectPorts[1] = duplicate.previews.allowedProjectPorts[0]!;
    expect(() => workbenchConfigSchema.parse(duplicate)).toThrowError(/Projektports müssen eindeutig/);

    const collision = exampleConfig();
    collision.previews.allowedProjectPorts[0] = collision.t3.port;
    expect(() => workbenchConfigSchema.parse(collision)).toThrowError(/kollidiert mit einem Workbench-Dienst/);
  });

  it("weist Kollisionen zwischen Preview, T3 und Workbench-HTTPS zurück", () => {
    const overlap = exampleConfig();
    overlap.previews.publicPorts[0] = overlap.previews.slotPorts[0]!;
    expect(() => workbenchConfigSchema.parse(overlap)).toThrowError(/nicht überschneiden/);

    const t3Collision = exampleConfig();
    t3Collision.previews.slotPorts[0] = t3Collision.t3.port;
    expect(() => workbenchConfigSchema.parse(t3Collision)).toThrowError(/T3 Code/);

    const workbenchCollision = exampleConfig();
    workbenchCollision.previews.publicPorts[0] = workbenchCollision.tailscale.httpsPort;
    expect(() => workbenchConfigSchema.parse(workbenchCollision)).toThrowError(/Workbench-HTTPS-Port/);
  });
});

describe("Limitüberwachung in der Config", () => {
  const directories: string[] = [];
  const baseConfig = () => {
    const config = exampleConfig() as unknown as Record<string, unknown>;
    delete config.usage;
    return config;
  };

  function createConfigDirectory(config: unknown): string {
    const directory = mkdtempSync(join(tmpdir(), "workbench-usage-config-"));
    directories.push(directory);
    writeFileSync(join(directory, "workbench.local.json"), JSON.stringify(config, null, 2), "utf8");
    return directory;
  }

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("überwacht alle Werkzeuge, wenn der Abschnitt fehlt", () => {
    expect(readUsageMonitoring(createConfigDirectory(baseConfig()))).toEqual({ codex: true, opencode: true, claude: true });
  });

  it("übernimmt gesetzte Werte aus der Config", () => {
    const config = { ...baseConfig(), usage: { monitoring: { codex: true, opencode: true, claude: false } } };
    expect(readUsageMonitoring(createConfigDirectory(config))).toEqual({ codex: true, opencode: true, claude: false });
  });

  it("schreibt die Limitüberwachung und lässt übrige Werte unverändert", () => {
    const directory = createConfigDirectory(baseConfig());
    persistUsageMonitoring(directory, { codex: false, opencode: true, claude: true });
    expect(readUsageMonitoring(directory)).toEqual({ codex: false, opencode: true, claude: true });
    expect(loadWorkbenchConfig(directory).paths.projectsRoot).toBe(exampleConfig().paths.projectsRoot);
  });
});
