import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "aistudioaccprgrm@gmail.com" },
  viewport: { width: 1440, height: 960 },
});

test("verifies Browser, local ports and direct project tool navigation", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");

  await page.goto(`${workbench}/browser`);
  const address = page.getByLabel("Browser-Adresse");
  await expect(address).toBeVisible();
  await page.getByRole("button", { name: "Neuer Tab" }).click();
  await expect(page.getByText("Laufende lokale Dienste")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".local-port-grid > button")).not.toHaveCount(0);

  await address.fill("example.com");
  await address.press("Enter");
  await expect(address).toHaveValue(/https:\/\/example\.com\/?/, { timeout: 25_000 });
  await expect(page.getByAltText("Gerenderte Chromium-Seite")).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 25_000 });
  await expect.poll(() => page.getByAltText("Gerenderte Chromium-Seite").evaluate((image: HTMLImageElement) => image.naturalWidth / Math.max(1, image.clientWidth))).toBeGreaterThan(1.5);
  await page.reload();
  await expect(page.getByLabel("Browser-Adresse")).toHaveValue(/https:\/\/example\.com\/?/, { timeout: 25_000 });
  await expect(page.getByAltText("Gerenderte Chromium-Seite")).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 25_000 });
  await page.screenshot({ path: "/tmp/workbench-011-browser.png", fullPage: true });

  await page.goto(`${workbench}/projects/remote-workplace`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page).toHaveURL(/\/workbench\/code-editor$/);
  await page.goto(`${workbench}/projects/remote-workplace`);
  await page.getByRole("button", { name: /T3/ }).first().click();
  await expect(page).toHaveURL(/\/workbench\/t3-code$/);

  await page.goto(`${workbench}/projects/tg-vereinsapp`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page).toHaveURL(/\/workbench\/previews\?preview=/);

  await page.goto(`${workbench}/previews`);
  await expect(page.getByText("Laufende lokale Dienste")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".local-port-grid > button")).not.toHaveCount(0);

  const dashboard = await (await page.request.get(new URL("/api/v1/usage/dashboard", workbench).toString())).json() as { forecasts: Array<{ providerId: string; accountId: string; windowId: string }> };
  const forecastKeys = dashboard.forecasts.map((forecast) => `${forecast.providerId}/${forecast.accountId}/${forecast.windowId}`);
  expect(new Set(forecastKeys).size).toBe(forecastKeys.length);
});

test("resizes selected Orbit nodes and keeps properties collapsed", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");

  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  const syncStatus = page.getByRole("button", { name: /Server gespeichert/ });
  await expect(syncStatus).toBeVisible({ timeout: 20_000 });
  await syncStatus.click();
  await expect(page.getByText("Alle Änderungen sind gespeichert.")).toBeVisible();
  await expect(page.getByText("Änderungen warten oder werden gespeichert.")).toBeVisible();
  await expect(page.getByText("Die Synchronisierung benötigt Aufmerksamkeit.")).toBeVisible();
  await syncStatus.click();

  await page.locator(".orbit-palette-item").filter({ hasText: "Neue Notiz" }).click();
  const note = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-node-shell") }).last();
  await expect(note).toBeVisible();
  await expect(page.getByRole("button", { name: "Eigenschaften öffnen" })).toBeVisible();
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await expect(note.locator(".orbit-resize-corner")).toHaveCount(4);

  const beforeDrag = await note.boundingBox();
  const header = await note.locator(".orbit-node-header").boundingBox();
  expect(header).not.toBeNull();
  await page.mouse.move(header!.x + 48, header!.y + 16);
  await page.mouse.down();
  await page.mouse.move(header!.x + 118, header!.y + 66, { steps: 8 });
  await page.mouse.up();
  const afterDrag = await note.boundingBox();
  expect(afterDrag!.x).toBeGreaterThan(beforeDrag!.x + 35);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  const beforeResize = await note.boundingBox();
  const resizeHandle = note.locator(".react-flow__resize-control.handle.bottom.right");
  await expect(resizeHandle).toBeVisible();
  const handle = await resizeHandle.boundingBox();
  expect(handle).not.toBeNull();
  expect(await resizeHandle.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(handle!.width).toBeLessThanOrEqual(40);
  expect(handle!.height).toBeLessThanOrEqual(40);
  expect(handle!.width).toBeGreaterThan(10);
  expect(handle!.height).toBeGreaterThan(10);
  await page.mouse.move(handle!.x + handle!.width * .8, handle!.y + handle!.height * .8);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width * .8 + 90, handle!.y + handle!.height * .8 + 65, { steps: 8 });
  await page.mouse.up();
  const afterResize = await note.boundingBox();
  expect(afterResize!.width).toBeGreaterThan(beforeResize!.width + 45);
  expect(afterResize!.height).toBeGreaterThan(beforeResize!.height + 30);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  await page.locator(".orbit-palette-item").filter({ hasText: "Neuer Bereich" }).click();
  const frame = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-frame-node") }).last();
  await expect(frame).toBeVisible();
  await expect(note.locator(".orbit-resize-corner")).toHaveCount(0);
  await expect(frame.locator(".orbit-resize-corner")).toHaveCount(4);
  await page.getByRole("button", { name: "Alles zeigen" }).click();
  await page.waitForTimeout(350);
  const edgeCount = await page.locator(".react-flow__edge").count();
  const source = await note.locator(".orbit-handle").last().boundingBox();
  const target = await frame.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  const sourceHit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return `${element?.tagName ?? ""}.${typeof element?.className === "string" ? element.className : ""}`;
  }, { x: source!.x + source!.width / 2, y: source!.y + source!.height / 2 });
  expect(sourceHit).toContain("react-flow__handle");
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2 + 12, source!.y + source!.height / 2);
  await expect(page.locator(".react-flow__connection")).toHaveCount(1);
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount + 1);

  await page.getByRole("button", { name: /^CHAPPiE ziehen$/ }).click();
  await page.locator(".orbit-palette-item").filter({ hasText: "Neue Notiz" }).click();
  await page.getByRole("button", { name: /^DailyQuest ziehen$/ }).click();
  await page.locator(".orbit-palette-item").filter({ hasText: "Neue Notiz" }).click();
  await page.getByRole("button", { name: "Alles zeigen" }).click();
  await page.waitForTimeout(350);
  const connectionColors = await page.locator(".react-flow__edge-path").evaluateAll((paths) => paths.map((path) => getComputedStyle(path).stroke));
  expect(new Set(connectionColors).size).toBeGreaterThanOrEqual(2);

  const minimap = await page.locator(".orbit-minimap").boundingBox();
  const territory = await page.locator(".orbit-territory-readout").boundingBox();
  expect(minimap).not.toBeNull();
  expect(territory).not.toBeNull();
  expect(territory!.y).toBeGreaterThan(minimap!.y + minimap!.height - 4);
  expect(Math.abs((territory!.x + territory!.width) - (minimap!.x + minimap!.width))).toBeLessThanOrEqual(4);
  const minimapViewport = await page.getByTestId("orbit-minimap-viewport").boundingBox();
  expect(minimapViewport).not.toBeNull();
  expect(Math.abs((minimapViewport!.x + minimapViewport!.width / 2) - (minimap!.x + minimap!.width / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs((minimapViewport!.y + minimapViewport!.height / 2) - (minimap!.y + minimap!.height / 2))).toBeLessThanOrEqual(2);
  await page.screenshot({ path: "/tmp/workbench-011-orbit.png", fullPage: true });
});

test("keeps Browser and Orbit controls usable on mobile", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${workbench}/browser`);
  await page.getByRole("button", { name: "Neuer Tab" }).click();
  await expect(page.getByText("Laufende lokale Dienste")).toBeVisible({ timeout: 20_000 });
  const browserBounds = await page.locator(".app-shell").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(browserBounds.scrollWidth).toBeLessThanOrEqual(browserBounds.clientWidth);
  await expect(page.getByLabel("Browser-Adresse")).toBeVisible();
  await page.screenshot({ path: "/tmp/workbench-011-mobile-browser.png", fullPage: true });

  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.locator(".orbit-minimap")).toBeHidden();
  const command = page.getByRole("button", { name: "Befehl" });
  const commandBox = await command.boundingBox();
  expect(commandBox).not.toBeNull();
  expect(commandBox!.height).toBeGreaterThanOrEqual(44);
  const orbitBounds = await page.locator(".orbit-page").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(orbitBounds.scrollWidth).toBeLessThanOrEqual(orbitBounds.clientWidth);
});
