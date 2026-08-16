import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";

const workbench = process.env.WORKBENCH_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("edits, saves and synchronizes a complete Orbit workspace", async ({ page, browser, browserName }) => {
  test.setTimeout(120_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Orbit test server.");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`${message.text()} ${message.location()?.url ?? ""}`); });

  await page.goto(`${workbench}/workbench/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".topbar")).toHaveCount(0);

  const projectsResponse = await page.request.get(new URL("/api/v1/projects", workbench).toString(), { headers: apiIdentityHeaders("user@example.com") });
  const projectsPayload = await projectsResponse.json() as { projects: Array<{ name: string; availability: string }> };
  const projectName = projectsPayload.projects.find((project) => project.availability === "available")?.name;
  expect(projectName).toBeTruthy();
  await page.getByRole("button", { name: `${projectName} ziehen`, exact: true }).click();
  await expect(page.locator(".orbit-project-node").filter({ hasText: projectName! })).toBeVisible();

  await page.getByRole("button", { name: /Neue Notiz/ }).click();
  const marker = `Orbit synchronisiert ${Date.now()}`;
  const note = page.getByLabel("Neue Notiz bearbeiten").last();
  await note.fill(marker, { force: true });
  await expect(page.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel("Neue Notiz bearbeiten").last()).toHaveValue(marker);

  await page.getByRole("button", { name: /To-do-Liste/ }).first().click();
  const task = `Aufgabe ${Date.now()}`;
  await page.getByLabel("Neue Aufgabe").last().fill(task);
  await page.getByLabel("Aufgabe hinzufügen").last().click();
  await expect(page.getByRole("textbox", { name: "Aufgabe 1", exact: true }).last()).toHaveValue(task);
  await page.getByLabel("Aufgabe 1 abhaken").last().check();
  await expect(page.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Aufgabe 1", exact: true }).last()).toHaveValue(task);
  await expect(page.getByLabel("Aufgabe 1 abhaken").last()).toBeChecked();

  const initialLayout = await (await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders("user@example.com") })).json();
  const initialBoard = initialLayout.document.boards.find((candidate: { id: string }) => candidate.id === initialLayout.document.activeBoardId);
  const projectNode = initialBoard.nodes.find((node: { type: string; title: string }) => node.type === "project" && node.title === projectName);
  const noteNode = initialBoard.nodes.find((node: { type: string; content: string }) => node.type === "note" && node.content === marker);
  const separated = projectNode.position.x + projectNode.size.width < noteNode.position.x
    || noteNode.position.x + noteNode.size.width < projectNode.position.x
    || projectNode.position.y + projectNode.size.height < noteNode.position.y
    || noteNode.position.y + noteNode.size.height < projectNode.position.y;
  expect(separated).toBe(true);

  const secondContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(`${workbench}/workbench/workbench`);
  const secondNote = secondPage.getByLabel("Neue Notiz bearbeiten").last();
  await expect(secondNote).toHaveValue(marker);
  const remoteMarker = `${marker} · Gerät 2`;
  await secondNote.fill(remoteMarker, { force: true });
  await expect(secondPage.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Neue Notiz bearbeiten").last()).toHaveValue(remoteMarker, { timeout: 12_000 });

  const nodeCount = await page.locator(".react-flow__node-orbit").count();
  await page.getByRole("button", { name: /Neuer Bereich/ }).dragTo(page.locator(".react-flow__pane"), {
    // Abseits der Bildmitte ablegen: Dort liegen Notiz und Aufgaben; nach
    // „Alles zeigen" überdeckten sie sonst den Bereichstitel (Frames liegen
    // bewusst hinter den übrigen Knoten).
    targetPosition: { x: 200, y: 800 },
  });
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodeCount + 1);
  const frameNode = page.locator(".react-flow__node-orbit").filter({ has: page.locator(".orbit-frame-node") }).last();
  await expect(page.getByRole("button", { name: "Eigenschaften öffnen" })).toBeVisible();
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Eigenschaften öffnen" }).click();
  await expect(page.locator(".orbit-inspector")).toBeVisible();
  await page.getByRole("button", { name: "Eigenschaften einklappen" }).click();
  await page.getByRole("button", { name: "Alles zeigen" }).click();
  await page.waitForTimeout(300);
  const frameBeforeDrag = await frameNode.boundingBox();
  const frameTitleLocator = frameNode.locator(".orbit-frame-title");
  const frameTitle = await frameTitleLocator.boundingBox();
  if (browserName !== "firefox") {
    await frameTitleLocator.hover();
    await page.mouse.down();
    await page.mouse.move((frameTitle?.x ?? 0) + (frameTitle?.width ?? 0) / 2 + 80, (frameTitle?.y ?? 0) + (frameTitle?.height ?? 0) / 2 + 40, { steps: 8 });
    await page.mouse.up();
    const frameAfterDrag = await frameNode.boundingBox();
    expect(frameAfterDrag?.x).toBeGreaterThan((frameBeforeDrag?.x ?? 0) + 30);
  }
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: /Code-Snippet/ }).click();
  await page.getByLabel("Programmiersprache").last().fill("typescript");
  await page.getByLabel("Code-Snippet Code bearbeiten").last().fill("const orbit = true;", { force: true });
  await page.getByRole("button", { name: /Codex Nutzung/ }).click();
  await expect(page.getByText("Aktualisierung alle 60 Sekunden").last()).toBeVisible();

  await expect(page.getByRole("button", { name: /neue-datei\.ts/ })).toHaveCount(0);

  await page.keyboard.press("/");
  const command = page.getByRole("dialog", { name: "Orbit-Befehl" });
  await expect(command).toBeVisible();
  await command.getByPlaceholder("Terminal, Notiz oder Projekt…").fill("terminal");
  await command.getByPlaceholder("Terminal, Notiz oder Projekt…").press("Enter");
  const terminalInput = page.locator(".xterm-helper-textarea").last();
  await expect(page.locator(".xterm-screen").last()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".terminal-connection-status").last()).toHaveText("Verbunden", { timeout: 20_000 });
  await expect(terminalInput).toBeAttached();

  const terminalNode = page.locator(".react-flow__node-orbit").filter({ has: page.locator('[data-panel-type="terminal"]') }).last();
  await expect(terminalNode.locator(".terminal-area-toolbar")).toHaveCount(0);
  await expect(terminalNode.locator(".panel-island")).toHaveCount(0);
  await expect(terminalNode.locator(".orbit-live-dragbar")).toHaveCount(0);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);
  await expect(terminalNode.locator(".orbit-resize-corner")).toHaveCount(8);
  const beforeResize = await terminalNode.boundingBox();
  const resizeHandle = terminalNode.locator(".react-flow__resize-control.handle.bottom.right");
  const resizeHandleBox = await resizeHandle.boundingBox();
  expect(resizeHandleBox).not.toBeNull();
  expect(resizeHandleBox?.width).toBeLessThanOrEqual(40);
  expect(resizeHandleBox?.height).toBeLessThanOrEqual(40);
  expect(resizeHandleBox?.width).toBeGreaterThan(10);
  expect(resizeHandleBox?.height).toBeGreaterThan(10);
  const resizeX = (resizeHandleBox?.x ?? 0) + (resizeHandleBox?.width ?? 0) * .8;
  const resizeY = (resizeHandleBox?.y ?? 0) + (resizeHandleBox?.height ?? 0) * .8;
  const hitClass = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, { x: resizeX, y: resizeY });
  expect(String(hitClass)).toContain("react-flow__resize-control");
  await page.mouse.move(resizeX, resizeY);
  await page.mouse.down();
  await page.mouse.move(resizeX + 80, resizeY + 60, { steps: 8 });
  await page.mouse.up();
  const afterResize = await terminalNode.boundingBox();
  expect(afterResize?.width).toBeGreaterThan((beforeResize?.width ?? 0) + 40);
  expect(afterResize?.height).toBeGreaterThan((beforeResize?.height ?? 0) + 30);
  await expect(page.locator(".orbit-inspector")).toHaveCount(0);

  const zoomRow = await page.locator(".orbit-zoom-row").boundingBox();
  const lastZoomButton = await page.getByRole("button", { name: "Alles zeigen" }).boundingBox();
  expect(zoomRow).not.toBeNull();
  expect(lastZoomButton).not.toBeNull();
  expect(zoomRow!.width).toBeLessThan(150);
  expect((zoomRow!.x + zoomRow!.width) - (lastZoomButton!.x + lastZoomButton!.width)).toBeLessThanOrEqual(6);

  await page.getByRole("button", { name: "Alles zeigen" }).click();
  await page.waitForTimeout(300);
  const edgeCountBeforeFrameConnection = await page.locator(".react-flow__edge").count();
  const sourceHandleBox = await terminalNode.locator(".orbit-handle").last().boundingBox();
  const frameConnectionPoint = await frameNode.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 24; y < bounds.bottom - 24; y += 32) {
      for (let x = bounds.left + 24; x < bounds.right - 24; x += 32) {
        if (document.elementFromPoint(x, y)?.closest(".react-flow__node-orbit") === element) return { x, y };
      }
    }
    return null;
  });
  expect(frameConnectionPoint).not.toBeNull();
  await page.mouse.move((sourceHandleBox?.x ?? 0) + (sourceHandleBox?.width ?? 0) / 2, (sourceHandleBox?.y ?? 0) + (sourceHandleBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move(frameConnectionPoint?.x ?? 0, frameConnectionPoint?.y ?? 0, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCountBeforeFrameConnection + 1);

  await page.locator(".orbit-palette-item").filter({ hasText: /^Codexziehen$/ }).click();
  await expect(page.locator('.orbit-live-node [data-panel-type="codex"]').last()).toBeVisible();
  await page.locator(".orbit-palette-item").filter({ hasText: /^OpenCodeziehen$/ }).click();
  await expect(page.locator('.orbit-live-node [data-panel-type="opencode"]').last()).toBeVisible();
  await page.keyboard.press("/");
  const t3Command = page.getByRole("dialog", { name: "Orbit-Befehl" });
  await t3Command.getByPlaceholder("Terminal, Notiz oder Projekt…").fill("t3 code");
  await t3Command.getByPlaceholder("Terminal, Notiz oder Projekt…").press("Enter");
  const t3Node = page.locator(".react-flow__node-orbit").filter({ has: page.locator('iframe[title="T3 Code"]') }).last();
  await expect(t3Node.locator('iframe[title="T3 Code"]')).toHaveAttribute("src", "/t3");
  await expect(t3Node.locator(".panel-island")).toHaveCount(0);

  const workspaceSelect = page.getByLabel("Arbeitsfläche auswählen");
  await expect(page.getByLabel("Gespeicherte Szene öffnen")).toHaveCount(0);
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen" }).click();
  const renamedWorkspace = `Fokus ${Date.now()}`;
  await page.getByLabel("Name der Arbeitsfläche").fill(renamedWorkspace);
  await page.getByRole("button", { name: "Arbeitsflächenname speichern" }).click();
  await expect(workspaceSelect.locator("option:checked")).toContainText(renamedWorkspace);
  await expect(page.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  const firstBoardId = await workspaceSelect.inputValue();
  const boardCount = await workspaceSelect.locator("option").count();
  const readBoardCount = async () => Number((await (await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders("user@example.com") })).json()).document.boards.length);
  await page.getByRole("button", { name: "Arbeitsfläche hinzufügen" }).click();
  await expect(workspaceSelect.locator("option")).toHaveCount(boardCount + 1);
  await expect(page.locator(".orbit-live-node")).toHaveCount(0);
  await expect.poll(readBoardCount, { timeout: 15_000 }).toBeGreaterThanOrEqual(boardCount + 1);
  const afterBoardSave = await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders("user@example.com") });
  expect((await afterBoardSave.json()).document.boards.length).toBeGreaterThanOrEqual(2);
  await workspaceSelect.selectOption(firstBoardId);
  await expect(page.locator(".orbit-live-node")).not.toHaveCount(0);
  await expect(workspaceSelect.locator("option:checked")).toContainText(renamedWorkspace);

  const noteCountBeforeDelete = await page.locator(".orbit-node-shell").count();
  await page.getByRole("button", { name: "Notiz hinzufügen" }).click();
  const deletableNote = page.locator(".orbit-node-shell").last();
  const dragHeader = deletableNote.locator(".orbit-node-header");
  const dragHeaderBox = await dragHeader.boundingBox();
  const orbitBox = await page.locator(".orbit-page").boundingBox();
  expect(dragHeaderBox).not.toBeNull();
  expect(orbitBox).not.toBeNull();
  if (browserName === "firefox") {
    await dragHeader.click();
    await page.keyboard.press("Delete");
  } else {
    await page.mouse.move((dragHeaderBox?.x ?? 0) + 50, (dragHeaderBox?.y ?? 0) + 18);
    await page.mouse.down();
    await page.mouse.move((dragHeaderBox?.x ?? 0) + 78, (dragHeaderBox?.y ?? 0) + 42, { steps: 4 });
    await expect(page.locator(".orbit-delete-zone")).toHaveClass(/is-visible/);
    await page.mouse.move((orbitBox?.x ?? 0) + (orbitBox?.width ?? 0) / 2, (orbitBox?.y ?? 0) + (orbitBox?.height ?? 0) - 28, { steps: 12 });
    await expect(page.locator(".orbit-delete-zone")).toHaveClass(/is-armed/);
    await page.mouse.up();
  }
  await expect(page.locator(".orbit-node-shell")).toHaveCount(noteCountBeforeDelete);

  const edgeCount = await page.locator(".react-flow__edge").count();
  await page.locator(".react-flow__edge-interaction").first().evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 720, clientY: 420 }));
  });
  const edgeMenu = page.getByRole("dialog", { name: "Verbindung bearbeiten" });
  await expect(edgeMenu).toBeVisible();
  await edgeMenu.getByRole("button", { name: "Löschen" }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(edgeCount - 1);

  const viewport = page.locator(".react-flow__viewport");
  const viewportTransformBefore = await viewport.getAttribute("style");
  const emptyPanePoint = await page.locator(".orbit-page").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 140; y < bounds.bottom - 110; y += 36) {
      for (let x = bounds.left + 36; x < bounds.right - 36; x += 36) {
        if (document.elementFromPoint(x, y)?.classList.contains("react-flow__pane")) return { x, y };
      }
    }
    return null;
  });
  expect(emptyPanePoint).not.toBeNull();
  await page.mouse.move(emptyPanePoint?.x ?? 0, emptyPanePoint?.y ?? 0);
  await page.mouse.down();
  await page.mouse.move((emptyPanePoint?.x ?? 0) + 60, (emptyPanePoint?.y ?? 0) + 50, { steps: 8 });
  await page.mouse.up();
  await expect(viewport).not.toHaveAttribute("style", viewportTransformBefore ?? "");
  await expect(page.locator(".react-flow__selection")).toHaveCount(0);

  await page.screenshot({ path: "/tmp/orbit-workspace-e2e.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".orbit-main-island")).toBeVisible();
  const addButton = page.getByRole("button", { name: "Befehl" });
  await expect(addButton).toBeVisible();
  const addButtonBox = await addButton.boundingBox();
  expect(addButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(addButtonBox?.height).toBeGreaterThanOrEqual(44);
  const mobileNodeCount = await page.locator(".react-flow__node-orbit").count();
  await addButton.click();
  const mobilePalette = page.getByRole("dialog", { name: "Orbit-Befehl" });
  await expect(mobilePalette).toBeVisible();
  const paletteBox = await mobilePalette.boundingBox();
  expect(Math.round((paletteBox?.y ?? 0) + (paletteBox?.height ?? 0))).toBeGreaterThanOrEqual(842);
  await mobilePalette.getByPlaceholder("Terminal, Notiz oder Projekt…").fill("notiz");
  await mobilePalette.getByRole("button", { name: /Neue Notiz/ }).click();
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(mobileNodeCount + 1);
  const mobileBounds = await page.locator(".orbit-page").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(mobileBounds.scrollWidth).toBeLessThanOrEqual(mobileBounds.clientWidth);
  expect(mobileBounds.scrollHeight).toBeLessThanOrEqual(mobileBounds.clientHeight);

  const orbitResponse = await page.request.get(new URL("/api/v1/orbit", workbench).toString(), { headers: apiIdentityHeaders("user@example.com") });
  await expect(orbitResponse).toBeOK();
  const orbit = await orbitResponse.json();
  expect(orbit.revision).toBeGreaterThan(0);
  expect(orbit.document.version).toBe(8);
  expect(orbit.document.boards.length).toBeGreaterThanOrEqual(2);
  expect(orbit.document.boards[0].edges.length).toBeGreaterThan(0);

  await secondContext.close();
  const isolatedLocalOrigin = new URL(workbench).hostname === "127.0.0.1";
  expect(errors.filter((message) => {
    if (/favicon|ResizeObserver loop/i.test(message)) return false;
    if (/Cookie .*_cfuvid.*rejected for invalid domain.*clerk\.t3\.codes/i.test(message)) return false;
    if (isolatedLocalOrigin && /Framing .*server-name.*frame-ancestors|frame-ancestors.*violates|status of 400|ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/terminal/i.test(message)) return false;
    // Die isolierte Instanz hat weder Codexbar noch echte Konten: Die
    // Nutzungs-Panels dürfen dort mit 500 antworten, ohne den Lauf zu färben.
    if (isolatedLocalOrigin && /status of 500.*\/api\/v1\/usage/i.test(message)) return false;
    // Ebenso fehlt der isolierten Instanz der echte T3-Dienst hinter /t3.
    if (isolatedLocalOrigin && /status of 500.*\/t3(\?|$)/i.test(message)) return false;
    return true;
  })).toEqual([]);
});
