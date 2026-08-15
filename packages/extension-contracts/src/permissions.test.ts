import { describe, expect, it } from "vitest";
import {
  extensionPermissionIdSchema,
  extensionPermissionIds,
  extensionPermissionRequestSchema,
  extensionPermissionRequestsSchema,
  extensionPermissionRiskById,
  networkHostSchema,
  processPermissionScopeSchema,
  projectPermissionScopeSchema,
  secretReferenceSchema,
  servicesPermissionScopeSchema,
} from "./permissions.js";

describe("Extension Permission IDs", () => {
  it("akzeptiert den vollständigen stabilen V1-Satz", () => {
    for (const permissionId of extensionPermissionIds) {
      expect(extensionPermissionIdSchema.parse(permissionId)).toBe(permissionId);
    }
  });

  it.each(["Files.Read", "files.delete", "network", "system.services.restart", " files.read"])(
    "weist die unbekannte Permission %s ab",
    (permissionId) => {
      expect(extensionPermissionIdSchema.safeParse(permissionId).success).toBe(false);
    },
  );

  it("besitzt für jede Permission genau eine hostdefinierte Risikostufe", () => {
    expect(Object.keys(extensionPermissionRiskById).sort()).toEqual([...extensionPermissionIds].sort());
    expect(extensionPermissionRiskById["process.execute"]).toBe("highly-privileged");
    expect(extensionPermissionRiskById["projects.read"]).toBe("normal");
  });
});

describe("Permission Scopes", () => {
  it("verwendet current oder explizit präfixierte Projekt-IDs", () => {
    expect(projectPermissionScopeSchema.parse({ projects: ["current", "id:remote-workplace"] })).toEqual({
      projects: ["current", "id:remote-workplace"],
    });
  });

  it.each([
    { projects: [] },
    { projects: ["remote-workplace"] },
    { projects: ["id:../etc"] },
    { projects: ["id:Remote-Workplace"] },
    { projects: ["current", "current"] },
  ])(
    "weist den ungültigen Project Scope %j ab",
    ({ projects }) => {
      expect(projectPermissionScopeSchema.safeParse({ projects }).success).toBe(false);
    },
  );

  it("begrenzt Process Scopes auf Commands und Projekte", () => {
    expect(
      processPermissionScopeSchema.parse({
        projects: ["current"],
        commands: ["git", "pnpm"],
      }),
    ).toEqual({ projects: ["current"], commands: ["git", "pnpm"] });
    expect(processPermissionScopeSchema.safeParse({}).success).toBe(false);
    expect(processPermissionScopeSchema.safeParse({ commands: ["/usr/bin/git"] }).success).toBe(false);
    expect(processPermissionScopeSchema.safeParse({ commands: ["../git"] }).success).toBe(false);
    expect(processPermissionScopeSchema.safeParse({ commands: ["git", "git"] }).success).toBe(false);
  });

  it.each(["example.com", "api.example.com", "xn--bcher-kva.example"])(
    "akzeptiert den exakten öffentlichen Host %s",
    (host) => {
      expect(networkHostSchema.parse(host)).toBe(host);
    },
  );

  it.each(["localhost", "127.0.0.1", "[::1]", "https://example.com", "*.example.com", "API.example.com"])(
    "weist den ungeeigneten Network-Scope-Host %s ab",
    (host) => {
      expect(networkHostSchema.safeParse(host).success).toBe(false);
    },
  );

  it("verwendet logische Secret-Referenzen statt Werte", () => {
    expect(secretReferenceSchema.parse("api.github-token")).toBe("api.github-token");
    expect(secretReferenceSchema.safeParse("GITHUB_TOKEN").success).toBe(false);
    expect(secretReferenceSchema.safeParse("../token").success).toBe(false);
  });

  it("begrenzt Service Scopes auf exakte systemd-Units", () => {
    expect(servicesPermissionScopeSchema.parse({ services: ["workbench.service", "worker@one.service"] })).toEqual({
      services: ["workbench.service", "worker@one.service"],
    });
    expect(servicesPermissionScopeSchema.safeParse({ services: ["*.service"] }).success).toBe(false);
    expect(servicesPermissionScopeSchema.safeParse({ services: ["..workbench.service"] }).success).toBe(false);
    expect(servicesPermissionScopeSchema.safeParse({ services: ["workbench.service", "workbench.service"] }).success).toBe(
      false,
    );
  });
});

describe("strukturierte Permission Requests", () => {
  it.each([
    { permission: "files.read", scope: { projects: ["current"] } },
    { permission: "process.execute", scope: { projects: ["current"], commands: ["git"] } },
    { permission: "network.fetch", scope: { hosts: ["api.example.com"] } },
    { permission: "notifications.create" },
    { permission: "secrets.request", scope: { names: ["api.example-token"] } },
    { permission: "system.services.read", scope: { services: ["workbench.service"] } },
  ])("akzeptiert %j", (request) => {
    expect(extensionPermissionRequestSchema.parse(request)).toEqual(request);
  });

  it("erlaubt einen bewusst globalen Request ohne Scope", () => {
    expect(extensionPermissionRequestSchema.parse({ permission: "network.fetch" })).toEqual({
      permission: "network.fetch",
    });
  });

  it.each([
    { permission: "notifications.create", scope: { projects: ["current"] } },
    { permission: "files.read", scope: { hosts: ["example.com"] } },
    { permission: "network.fetch", scope: { projects: ["current"] } },
    { permission: "system.services.read", scope: { services: ["workbench"] } },
    { permission: "unknown.read" },
  ])("weist den nicht zur Permission passenden Request %j ab", (request) => {
    expect(extensionPermissionRequestSchema.safeParse(request).success).toBe(false);
  });

  it("weist doppelte Permission Requests statt stiller Zusammenführung ab", () => {
    expect(
      extensionPermissionRequestsSchema.safeParse([
        { permission: "files.read", scope: { projects: ["current"] } },
        { permission: "files.read", scope: { projects: ["id:remote-workplace"] } },
      ]).success,
    ).toBe(false);
  });
});
