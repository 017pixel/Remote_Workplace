import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { workbenchConfigSchema, type WorkbenchConfig } from "./workbench-config.js";

function exampleConfig(): WorkbenchConfig {
  return workbenchConfigSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), "../../config/workbench.example.json"), "utf8")) as unknown);
}

describe("Workbench-Preview-Konfiguration", () => {
  it("akzeptiert getrennte interne und öffentliche Slot-Ports", () => {
    expect(workbenchConfigSchema.parse(exampleConfig()).previews).toMatchObject({
      slotPorts: [3901, 3902, 3903, 3904, 3905, 3906, 3907, 3908, 3909, 3910, 3911, 3912],
      publicPorts: [8451, 8452, 8453, 8454, 8455, 8456, 8457, 8458, 8459, 8460, 8461, 8462],
    });
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
