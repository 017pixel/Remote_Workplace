import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("keeps the infinite canvas navigable and usable on mobile", async ({ page, browserName }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Orbit test server.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const currentResponse = await page.request.get(orbitUrl);
  await expect(currentResponse).toBeOK();
  const current = await currentResponse.json();
  const marker = `Mobile Canvas ${Date.now()}`;
  const boardId = `mobile-e2e-${Date.now()}`;
  const seedResponse = await page.request.put(orbitUrl, {
    data: {
      expectedRevision: current.revision,
      document: {
        version: 6,
        activeBoardId: boardId,
        focusedNodeId: null,
        boards: [{
          id: boardId,
          name: "Mobile Arbeitsfläche",
          viewport: { x: 24, y: 210, zoom: 1 },
          worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 },
          nodes: [{
            id: "mobile-note",
            type: "note",
            title: "Mobile Testnotiz",
            position: { x: 0, y: 0 },
            size: { width: 340, height: 220 },
            projectId: null,
            parentId: null,
            runtimeId: null,
            toolType: null,
            previewId: null,
            provider: null,
            content: marker,
            language: null,
            locked: false,
            zIndex: 1,
          }],
          edges: [],
        }],
      },
    },
  });
  await expect(seedResponse).toBeOK();

  await page.goto(`${workbench}/workbench`);
  const orbitPage = page.locator(".orbit-page");
  await expect(orbitPage).toBeVisible();
  await expect(orbitPage).toHaveAttribute("data-mobile-mode", "navigate");
  await expect(page.getByText("Zwei Finger bewegen und zoomen")).toBeVisible();
  await expect(page.getByLabel("Mobile Testnotiz bearbeiten")).toHaveValue(marker);

  const toolbar = page.locator(".orbit-main-island");
  await expect(toolbar).toBeVisible();
  const renameWorkspace = page.getByRole("button", { name: "Arbeitsfläche umbenennen" });
  await renameWorkspace.scrollIntoViewIfNeeded();
  const renameWorkspaceBox = await renameWorkspace.boundingBox();
  expect(renameWorkspaceBox?.width).toBeGreaterThanOrEqual(44);
  expect(renameWorkspaceBox?.height).toBeGreaterThanOrEqual(44);
  await renameWorkspace.click();
  await page.getByLabel("Name der Arbeitsfläche").fill("Mobile Fokusfläche");
  await page.getByRole("button", { name: "Arbeitsflächenname speichern" }).click();
  await expect(page.getByLabel("Arbeitsfläche auswählen").locator("option:checked")).toContainText("Mobile Fokusfläche");
  const toolbarNext = page.getByRole("button", { name: "Steuerleiste weiterscrollen" });
  await expect(toolbarNext).toBeVisible();
  const toolbarScrollBefore = await toolbar.evaluate((element) => element.scrollLeft);
  await toolbarNext.click();
  await expect.poll(() => toolbar.evaluate((element) => element.scrollLeft)).toBeGreaterThan(toolbarScrollBefore);
  await expect(page.getByRole("button", { name: "Steuerleiste zurückscrollen" })).toBeVisible();

  const modeButton = page.getByRole("button", { name: /Canvas-Modus: Navigieren/ });
  const modeButtonBox = await modeButton.boundingBox();
  expect(modeButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(modeButtonBox?.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator(".react-flow__node-orbit").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  await page.screenshot({ path: "/tmp/orbit-mobile-navigate-390.png", fullPage: true });

  if (browserName === "chromium") {
    const viewport = page.locator(".react-flow__viewport");
    const transformBeforePinch = await viewport.getAttribute("style");
    const nodeBox = await page.locator(".react-flow__node-orbit").boundingBox();
    expect(nodeBox).not.toBeNull();
    const centerX = Math.max(100, Math.min(290, (nodeBox?.x ?? 24) + 160));
    const centerY = Math.max(220, Math.min(620, (nodeBox?.y ?? 210) + 110));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
      { x: centerX - 24, y: centerY, radiusX: 6, radiusY: 6, force: 1, id: 1 },
      { x: centerX + 24, y: centerY, radiusX: 6, radiusY: 6, force: 1, id: 2 },
    ] });
    for (const distance of [36, 48, 60]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
        { x: centerX - distance, y: centerY + 20, radiusX: 6, radiusY: 6, force: 1, id: 1 },
        { x: centerX + distance, y: centerY + 20, radiusX: 6, radiusY: 6, force: 1, id: 2 },
      ] });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(viewport).not.toHaveAttribute("style", transformBeforePinch ?? "");
  }

  await modeButton.click();
  await expect(orbitPage).toHaveAttribute("data-mobile-mode", "interact");
  await expect(page.getByRole("button", { name: /Canvas-Modus: Inhalt benutzen/ })).toHaveAttribute("aria-pressed", "true");
  const note = page.getByLabel("Mobile Testnotiz bearbeiten");
  expect(await note.evaluate((element) => getComputedStyle(element).pointerEvents)).not.toBe("none");
  await note.fill("Mobile Inhalte bleiben bedienbar");
  await expect(note).toHaveValue("Mobile Inhalte bleiben bedienbar");
  await expect(page.getByRole("button", { name: "Eigenschaften öffnen" })).toHaveCount(0);

  await page.locator(".orbit-node-header").click();
  await expect(page.getByRole("button", { name: "Eigenschaften öffnen" })).toBeVisible();
  await expect(page.locator(".orbit-resize-corner")).toHaveCount(4);
  await page.getByRole("button", { name: "Eigenschaften öffnen" }).click();
  await expect(page.locator(".orbit-inspector")).toBeVisible();
  await page.getByRole("button", { name: "Eigenschaften einklappen" }).click();
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  await page.getByRole("button", { name: "Befehl" }).click();
  await page.getByRole("button", { name: /Projektordner durchsuchen/ }).click();
  const projectBrowser = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
  await expect(projectBrowser).toBeVisible();
  await expect(projectBrowser.getByRole("textbox", { name: "Serverpfad" })).toBeVisible();
  await expect(projectBrowser.getByRole("button", { name: "Im Orbit öffnen" })).toBeDisabled();
  const projectBrowserBounds = await projectBrowser.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(projectBrowserBounds.scrollWidth).toBeLessThanOrEqual(projectBrowserBounds.clientWidth);
  await projectBrowser.getByRole("button", { name: "Dialog schließen" }).click();
  await expect(projectBrowser).toHaveCount(0);

  const mobileBounds = await orbitPage.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(mobileBounds.scrollWidth).toBeLessThanOrEqual(mobileBounds.clientWidth);
  expect(mobileBounds.scrollHeight).toBeLessThanOrEqual(mobileBounds.clientHeight);

  await page.setViewportSize({ width: 320, height: 568 });
  const compactDockBox = await page.locator(".orbit-quick-panel").boundingBox();
  const compactZoomBox = await page.locator(".orbit-zoom-row").boundingBox();
  const compactZoomLast = await page.getByRole("button", { name: "Alles zeigen" }).boundingBox();
  expect(compactDockBox?.x).toBeGreaterThanOrEqual(7);
  expect((compactDockBox?.x ?? 0) + (compactDockBox?.width ?? 0)).toBeLessThanOrEqual(313);
  expect(compactZoomBox?.width).toBeLessThan(150);
  expect(((compactZoomBox?.x ?? 0) + (compactZoomBox?.width ?? 0)) - ((compactZoomLast?.x ?? 0) + (compactZoomLast?.width ?? 0))).toBeLessThanOrEqual(6);
  await page.screenshot({ path: "/tmp/orbit-mobile-interact-320.png", fullPage: true });

  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator(".sidebar-shell")).toBeHidden();
  const navigationButton = page.getByRole("button", { name: "Navigation öffnen" });
  await expect(navigationButton).toBeVisible();
  await navigationButton.click();
  await expect(page.getByRole("dialog", { name: "Seiten auswählen" })).toBeVisible();
  await page.getByRole("button", { name: "Navigation schließen" }).click();
  await expect(page.getByRole("dialog", { name: "Seiten auswählen" })).toHaveCount(0);

  await page.screenshot({ path: "/tmp/orbit-mobile-e2e.png", fullPage: true });
  expect(errors.filter((message) => !/favicon|ResizeObserver loop/i.test(message))).toEqual([]);
});
