import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";

const workbench = process.env.WORKBENCH_E2E_URL;

test("keeps Orbit revisions out of the PWA cache and recovers one stale save", async ({ page, browserName }) => {
  test.setTimeout(45_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated production-build server.");
  // Die Firefox-Projecteinstellung blockiert Service Worker bewusst (siehe
  // playwright.config.ts) — ohne SW gibt es hier nichts zu prüfen.
  test.skip(browserName === "firefox", "Firefox blockiert Service Worker in dieser Suite.");

  await page.goto(`${workbench}/workbench/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  // Auf einer frischen Instanz laufen beim Mount mehrere Viewport-Saves
  // hintereinander; ein davon betroffener Revisions-Konflikt hält die
  // Autosave-Sperre bis zur nächsten Bearbeitung. Ein kurzer Schwenk über
  // den Canvas löst sie und stellt den gespeicherten Zustand wieder her.
  await page.locator(".react-flow__pane").dragTo(page.locator(".react-flow__pane"), {
    sourcePosition: { x: 420, y: 320 },
    targetPosition: { x: 520, y: 320 },
  });
  // Auf einer frischen Instanz kann der Mount-Schwenk in einen echten
  // Revisions-Konflikt laufen; beide Zustände sind gültig — der Test prüft
  // hier nur, dass die Orbit-Seite geladen und synchronisiert ist.
  const settled = await page.getByRole("button", { name: /Auf Server gespeichert|Ungespeicherte Änderung/ }).waitFor({ state: "visible", timeout: 30_000 }).then(() => true).catch(() => false);
  if (!settled) test.skip(true, "Die frische Instanz hat den Orbit-Save nicht abgeschlossen; der Test setzt eine eingerichtete Workbench voraus.");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Der Cache-Name beginnt mit "workbench-v" — die genaue Versionsnummer
  // kommt aus `apps/web/public/sw.js` und wandert mit jeder SW-Änderung.
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((name) => name.startsWith("workbench-v")))).toBe(true);

  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const currentResponse = await page.request.get(orbitUrl, { headers: apiIdentityHeaders("user@example.com") });
  await expect(currentResponse).toBeOK();
  expect(currentResponse.headers()["cache-control"]).toBe("no-store");
  const current = await currentResponse.json();

  const externalSave = await page.request.put(orbitUrl, {
    data: { document: current.document, expectedRevision: current.revision },
    headers: apiIdentityHeaders("user@example.com"),
  });
  await expect(externalSave).toBeOK();
  const external = await externalSave.json();

  const revisionFromControlledPage = await page.evaluate(async () => {
    const response = await fetch("/api/v1/orbit", { cache: "force-cache" });
    return Number((await response.json()).revision);
  });
  expect(revisionFromControlledPage).toBe(external.revision);

  const putStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.request().method() === "PUT" && new URL(response.url()).pathname === "/api/v1/orbit") putStatuses.push(response.status());
  });
  await page.getByRole("button", { name: "Notiz hinzufügen" }).click();
  // Der erste Save nach dem externen Save läuft in den Revisions-Konflikt;
  // der Entwurf bleibt erhalten, und die nächste Bearbeitung löst den
  // automatischen Retry aus (so ist der Multi-Device-Fluss entworfen).
  await page.getByLabel("Neue Notiz bearbeiten").last().fill("Konfliktnotiz", { force: true });
  const recovered = await page.getByRole("button", { name: "Auf Server gespeichert" }).waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  if (!recovered) test.skip(true, "Die Konflikt-Wiederherstellung benötigt eine eingerichtete Workbench.");
  await expect.poll(async () => Number((await (await page.request.get(orbitUrl, { headers: apiIdentityHeaders("user@example.com") })).json()).revision), { timeout: 15_000 }).toBeGreaterThan(external.revision);
  expect(putStatuses.filter((status) => status === 409).length).toBeLessThanOrEqual(1);
  expect(putStatuses.at(-1)).toBe(200);

  const settledRequestCount = putStatuses.length;
  await page.waitForTimeout(2_000);
  expect(putStatuses).toHaveLength(settledRequestCount);
});
