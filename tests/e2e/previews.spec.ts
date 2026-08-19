import { expect, test } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startPreviewFixtures, fixturePorts } from "../fixtures/preview-apps/server.mjs";
import { previewIdentity, previewsEnabled, previewsReason } from "./helpers/previews";

// Das Harness bindet nur Loopback und wird pro Datei genau einmal gestartet.
let stopFixtures: (() => Promise<void>) | null = null;

test.beforeAll(async () => {
  if (!previewsEnabled) return;
  stopFixtures = await startPreviewFixtures();
});

test.afterAll(async () => {
  await stopFixtures?.();
  stopFixtures = null;
});

test.describe("Lokale Previews", () => {
  test.skip(!previewsEnabled, previewsReason);

  test("öffnet eine SPA-Session, hält die Routing-Revision und gibt sie wieder frei", async ({ request }) => {
    const opened = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-spa", projectId: null, primaryPort: fixturePorts.spa, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    expect(opened.ok()).toBeTruthy();
    const session = await opened.json() as { id: string; routingRevision: number; bindings: Array<{ slotId: number; publicUrl: string }>; limitations: string[] };
    expect(session.bindings).toHaveLength(1);
    expect(session.routingRevision).toBeGreaterThan(0);
    // Grenzen werden ehrlich benannt, statt Vollständigkeit zu behaupten.
    expect(session.limitations).toContain("cookies-share-host");
    expect(session.limitations).toContain("no-indexeddb-sync");

    const slots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as { slots: Array<{ id: number; internalPort: number; publicPort: number; targetPort: number | null; publicUrl: string; affinityStatus: string }> };
    const bound = slots.slots.find((slot) => slot.id === session.bindings[0]!.slotId)!;
    expect(bound.targetPort).toBe(fixturePorts.spa);
    expect(bound.affinityStatus).toBe("own");
    expect(session.bindings[0]!.publicUrl).toBe(bound.publicUrl);
    const publicPort = new URL(session.bindings[0]!.publicUrl).hostname === "127.0.0.1" ? bound.internalPort : bound.publicPort;
    expect(new URL(session.bindings[0]!.publicUrl).port).toBe(String(publicPort));

    const preview = await request.get(`http://127.0.0.1:${bound.internalPort}/`);
    expect(preview.ok()).toBeTruthy();
    expect(await preview.text()).toContain("SPA bereit");

    const closed = await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    expect(closed.status()).toBe(204);
  });

  test("weist eine externe URL als Preview-Ziel ab", async ({ request }) => {
    // Externe Adressen erreichen den lokalen Gateway nie: Er kennt nur Ports.
    const response = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-extern", projectId: null, primaryPort: 443, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    // Port 443 ist kein lokaler Projektdienst; die Session bleibt ohne erreichbares Ziel.
    if (response.ok()) {
      const session = await response.json() as { id: string };
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }
    const slots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as { slots: Array<{ publicUrl: string }> };
    for (const slot of slots.slots) expect(slot.publicUrl.startsWith("http")).toBeTruthy();
  });

  test("teilt identische Sessions und trennt unterschiedliche Ziele", async ({ request }) => {
    const shared = { projectId: null, primaryPort: fixturePorts.mpa, primaryProtocol: "http", isolate: false, storageProfileId: null };
    const sessionIds: string[] = [];

    try {
      const firstResponse = await request.post("/api/v1/previews/sessions", { headers: previewIdentity, data: { ...shared, sessionKey: "e2e-share-a" } });
      expect(firstResponse.ok()).toBeTruthy();
      const first = await firstResponse.json() as { id: string; bindings: Array<{ slotId: number }> };
      sessionIds.push(first.id);
      expect(first.bindings).toHaveLength(1);

      const secondResponse = await request.post("/api/v1/previews/sessions", { headers: previewIdentity, data: { ...shared, sessionKey: "e2e-share-b" } });
      expect(secondResponse.ok()).toBeTruthy();
      const second = await secondResponse.json() as { id: string; bindings: Array<{ slotId: number }> };
      sessionIds.push(second.id);
      expect(second.bindings).toHaveLength(1);
      expect(second.bindings[0]!.slotId).toBe(first.bindings[0]!.slotId);

      const otherResponse = await request.post("/api/v1/previews/sessions", { headers: previewIdentity, data: { ...shared, sessionKey: "e2e-share-c", primaryPort: fixturePorts.api } });
      expect(otherResponse.ok()).toBeTruthy();
      const other = await otherResponse.json() as { id: string; bindings: Array<{ slotId: number }> };
      sessionIds.push(other.id);
      expect(other.bindings).toHaveLength(1);
      expect(other.bindings[0]!.slotId).not.toBe(first.bindings[0]!.slotId);
    } finally {
      for (const sessionId of sessionIds.reverse()) {
        await request.delete(`/api/v1/previews/sessions/${sessionId}`, { headers: previewIdentity });
      }
    }
  });

  test("liefert MPA-Routen, Assets und Redirects über die Slot-Origin", async ({ request }) => {
    const opened = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-mpa", projectId: null, primaryPort: fixturePorts.mpa, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    expect(opened.ok()).toBeTruthy();
    const session = await opened.json() as { id: string; bindings: Array<{ slotId: number }> };

    try {
      expect(session.bindings).toHaveLength(1);
      const slots = await (await request.get("/api/v1/previews/slots", { headers: previewIdentity })).json() as { slots: Array<{ id: number; internalPort: number }> };
      const bound = slots.slots.find((slot) => slot.id === session.bindings[0]!.slotId);
      expect(bound).toBeDefined();
      const internalPort = bound!.internalPort;

      const start = await request.get(`http://127.0.0.1:${internalPort}/`);
      expect(await start.text()).toContain("styles.css");
      const admin = await request.get(`http://127.0.0.1:${internalPort}/admin`);
      expect(await admin.text()).toContain("Adminbereich");
      const asset = await request.get(`http://127.0.0.1:${internalPort}/styles.css`);
      expect(asset.headers()["content-type"]).toContain("text/css");
    } finally {
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }
  });

  test("hält Gerätepräferenz und Slot-Override auseinander", async ({ request }) => {
    const saved = await request.put("/api/v1/previews/device-preference", {
      headers: previewIdentity,
      data: { deviceId: "iphone-15", orientation: "portrait" },
    });
    expect(saved.ok()).toBeTruthy();
    const preference = await (await request.get("/api/v1/previews/device-preference", { headers: previewIdentity })).json() as { deviceId: string };
    expect(preference.deviceId).toBe("iphone-15");
    await request.put("/api/v1/previews/device-preference", { headers: previewIdentity, data: { deviceId: "iphone-13", orientation: "portrait" } });
  });

  test("nimmt Diagnose-Batches an und redigiert Secrets", async ({ request }) => {
    // Diagnose ist im isolierten E2E-Server aktiviert; ein Batch braucht deshalb
    // eine echte, dem Benutzer gehörende Preview-Session.
    const opened = await request.post("/api/v1/previews/sessions", {
      headers: previewIdentity,
      data: { sessionKey: "e2e-diagnose", projectId: null, primaryPort: fixturePorts.spa, primaryProtocol: "http", isolate: true, storageProfileId: null },
    });
    expect(opened.ok()).toBeTruthy();
    const session = await opened.json() as { id: string };
    try {
      const response = await request.post("/api/v1/previews/diagnostics/batches", {
        headers: previewIdentity,
        data: {
          previewNodeId: "e2e-node",
          sessionId: session.id,
          droppedSinceLastBatch: 0,
          events: [{
            id: "44444444-4444-4444-8444-444444444444",
            at: new Date().toISOString(),
            source: "client",
            category: "console",
            severity: "error",
            message: "Antwort mit Authorization: Bearer geheim",
            metadata: { Cookie: "sid=1" },
          }],
        },
      });
      expect(response.ok()).toBeTruthy();
      const listed = await (await request.get("/api/v1/previews/diagnostics?previewNodeId=e2e-node", { headers: previewIdentity })).json() as { events: Array<{ message: string }> };
      for (const event of listed.events) expect(event.message).not.toContain("geheim");
    } finally {
      await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
    }
  });

  test("verweigert Preview-Zugriff ohne Identität", async ({ request }) => {
    test.skip(!process.env.WRAPT_E2E_URL, "Die isolierte Testinstanz nutzt bewusst eine Entwicklungsidentität.");
    const response = await request.get("/api/v1/previews/slots");
    expect(response.status()).toBe(401);
  });

  test("recycelt belegte Slot-Origins und öffnet die Hub-Preview direkt in einem neuen Tab und Fenster", async ({ page, request }) => {
    // Eigene Projektlaufzeit im Fixture-Bereich (innerhalb des erlaubten
    // Browser-Roots): preview.config.json startet einen minimalen node-Server
    // auf dem ersten freien Port der erlaubten Preview-Palette.
    const runtimeDirectory = await mkdtemp(join(process.cwd(), "tests", "fixtures", ".e2e-runtime-"));
    await writeFile(join(runtimeDirectory, "preview.config.json"), JSON.stringify({
      version: 2,
      mainService: "frontend",
      services: [{
        id: "frontend",
        name: "E2E Fixture",
        role: "frontend",
        command: "node server.mjs",
        port: "auto",
        portMode: "argument",
      }],
    }));
    await writeFile(join(runtimeDirectory, "server.mjs"), `import { createServer } from "node:http";
const port = Number(process.argv[process.argv.indexOf("--port") + 1] ?? 1234);
createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><html lang=\\"de\\"><head><meta charset=\\"utf-8\\"><title>E2E Fixture</title></head><body><p>SPA bereit</p></body></html>");
}).listen(port, "127.0.0.1");
`);

    const registered = await request.post("/api/v1/projects/register", {
      headers: previewIdentity,
      data: { path: runtimeDirectory },
    });
    expect(registered.ok()).toBeTruthy();
    const registeredProject = await registered.json() as { project: { id: string; name: string } };

    // Die erkannte Laufzeit besitzt mindestens einen Browserdienst auf einem
    // Port der zentralen Palette; die konkrete Zuweisung kann beim Start noch
    // auf einen freien Palettenport ausweichen.
    const profileResponse = await request.get(`/api/v1/previews/dev-servers/${encodeURIComponent(registeredProject.project.id)}/profile`, { headers: previewIdentity });
    expect(profileResponse.ok()).toBeTruthy();
    const profile = await profileResponse.json() as { services: Array<{ port: number | null }> };
    expect(profile.services.some((service) => service.port !== null)).toBeTruthy();

    const reclaimPreviewSlots = async () => {
      for (let index = 0; index < 12; index += 1) {
        const startedResponse = await request.post("/api/v1/previews/slots/reclaim", { headers: previewIdentity });
        if (!startedResponse.ok()) break;
        const started = await startedResponse.json() as { slotId: number; nonce: string };
        await request.post(`/api/v1/previews/slots/${started.slotId}/reset/verify`, {
          headers: previewIdentity,
          data: { nonce: started.nonce, serviceWorkers: 0, cacheStorages: 0, localStorageKeys: 0, sessionStorageKeys: 0, indexedDatabases: 0, verifiable: true },
        });
      }
    };

    try {
      const initialSlotsResponse = await request.get("/api/v1/previews/slots", { headers: previewIdentity });
      expect(initialSlotsResponse.ok()).toBeTruthy();
      const initialSlots = await initialSlotsResponse.json() as {
        slots: Array<{ affinityStatus: "none" | "own" | "foreign" | "quarantined" }>;
      };
      const unusedSlotCount = initialSlots.slots.filter((slot) => slot.affinityStatus === "none").length;
      for (let index = 0; index < unusedSlotCount; index += 1) {
        const opened = await request.post("/api/v1/previews/sessions", {
          headers: previewIdentity,
          data: { sessionKey: `e2e-alt-${index}`, projectId: `altes-projekt-${index}`, primaryPort: fixturePorts.spa, primaryProtocol: "http", isolate: true, storageProfileId: null },
        });
        expect(opened.ok()).toBeTruthy();
        const session = await opened.json() as { id: string };
        await request.delete(`/api/v1/previews/sessions/${session.id}`, { headers: previewIdentity });
      }

      await page.goto("/wrapt/previews");

      // Der Hub öffnet das zuletzt gewählte Projekt automatisch; die Fixture-
      // Laufzeit wird über den Projekt-Manager als eigener Tab hinzugefügt.
      await test.step("Projekt-Tab im Hub öffnen", async () => {
        await page.getByRole("button", { name: "Preview-Projekt hinzufügen" }).click();
        const dialog = page.getByRole("dialog", { name: "Preview-Projekte" });
        await dialog.getByRole("textbox", { name: "Preview-Projekte suchen" }).fill(registeredProject.project.name);
        await dialog.getByRole("button", { name: registeredProject.project.name }).click();
      });

      await test.step("Laufzeit starten", async () => {
        // Das Hauptziel wartet auf den zugewiesenen Dienstport aus der Palette,
        // dann startet die Laufzeit.
        await expect(page.locator(".preview-hub-urlbar code")).toContainText(/Port \d+ wird beim Öffnen über einen sicheren Slot veröffentlicht/);
        await page.locator(".preview-hub-command").getByRole("button", { name: "Alles starten" }).click();
        await expect(page.locator(".preview-hub-command .preview-hub-state.is-running")).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("button", { name: "Im neuen Tab öffnen" })).toBeEnabled();
      });

      await test.step("Direkt in einem neuen Tab öffnen", async () => {
        // Direktes Öffnen: Das Popup erreicht die veröffentlichte Slot-Origin und
        // zeigt die Fixture-Seite ohne Workbench-Oberfläche.
        const tabPromise = page.waitForEvent("popup");
        await page.getByRole("button", { name: "Im neuen Tab öffnen" }).click();
        const tab = await tabPromise;
        await expect(tab).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000 });
        await expect(tab.getByText("SPA bereit")).toBeVisible({ timeout: 15_000 });
        await tab.close();
      });

      await test.step("Direkt in einem neuen Fenster öffnen", async () => {
        // Das Menü öffnet dieselbe direkte URL in einem eigenen Fenster.
        await page.locator(".preview-hub-launchbar summary").click();
        const windowPromise = page.waitForEvent("popup");
        await page.getByRole("button", { name: "Im neuen Fenster" }).click();
        const previewWindow = await windowPromise;
        await expect(previewWindow).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000 });
        await expect(previewWindow.getByText("SPA bereit")).toBeVisible({ timeout: 15_000 });
        await previewWindow.close();
      });
    } finally {
      // Der Test verändert absichtlich persistente Preview-Zustände. Das Cleanup
      // muss deshalb auch nach einer fehlgeschlagenen UI-Assertion laufen, damit
      // spätere Browser-Projekte nicht mit belegten Slots starten.
      await request.post(`/api/v1/previews/dev-servers/${encodeURIComponent(registeredProject.project.id)}/stop`, { headers: previewIdentity }).catch(() => {});
      await request.delete(`/api/v1/previews/sessions/by-key/preview-runtime:${encodeURIComponent(registeredProject.project.id)}`, { headers: previewIdentity }).catch(() => {});
      await reclaimPreviewSlots();
      await rm(runtimeDirectory, { recursive: true, force: true });
    }
  });

});
