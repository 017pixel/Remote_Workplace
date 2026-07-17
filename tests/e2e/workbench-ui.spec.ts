import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "aistudioaccprgrm@gmail.com" },
});

const privateWorkbench = "https://benjaminsserver.tail6494b7.ts.net:8443/workbench";

test("shows every local project and navigable breadcrumbs", async ({ page }) => {
  await page.goto(`${privateWorkbench}/projects`);
  await expect(page.getByRole("heading", { name: "Projekte", level: 1 })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(21);
  await expect(page.getByRole("link", { name: "Remote_Workplace" })).toBeVisible();

  await page.getByRole("link", { name: "Dev Workbench" }).click();
  await expect(page).toHaveURL(/\/workbench$/);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
});

test("keeps preview alive across device, fullscreen and external-tab actions", async ({ page, context }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(message.text());
  });

  await page.goto(`${privateWorkbench}/projects/tg-vereinsapp`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page).toHaveURL(/\/workbench\/previews\?preview=/);

  const preview = page.locator('iframe[title="Preview"]');
  await expect(preview).toHaveAttribute("src", /\/editor\/absproxy\/1234\/anmeldung\/$/);
  await expect(page.frameLocator('iframe[title="Preview"]').locator("#root")).toContainText(/VereinsApp|Kein Zugriff/);

  await page.getByLabel("Preview-Gerät").selectOption("iphone-14-pro-max");
  await expect(page.getByText("iPhone 14 Pro Max · 430 × 932")).toBeVisible();
  await page.getByRole("button", { name: "Ausrichtung drehen" }).click();
  await expect(page.getByText("iPhone 14 Pro Max · 932 × 430")).toBeVisible();

  await page.getByRole("button", { name: "Vollbild" }).click();
  await expect(page.locator(".tool-surface-maximized")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tool-surface-maximized")).toHaveCount(0);

  const popupPromise = context.waitForEvent("page");
  await page.getByTitle("In neuem Tab öffnen").click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup).toHaveURL(/\/editor\/absproxy\/1234\/anmeldung\/$/);
  await popup.close();
  await expect(page.frameLocator('iframe[title="Preview"]').locator("#root")).toContainText(/VereinsApp|Kein Zugriff/);
  expect(browserErrors.filter((message) =>
    /failed to connect to websocket|MIME-Typ|clipboard-(read|write)|Content-Security-Policy/i.test(message),
  )).toEqual([]);
});

test("keeps the same preview runtime across sidebar routes", async ({ page }) => {
  await page.goto(`${privateWorkbench}/projects/tg-vereinsapp`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();

  const preview = page.locator('iframe[title="Preview"]');
  await expect(preview).toBeVisible();
  const previewElement = await preview.elementHandle();
  const frame = await previewElement?.contentFrame();
  expect(frame).not.toBeNull();
  const marker = `persistent-${Date.now()}`;
  await frame!.evaluate((value) => {
    (window as Window & { __workbenchPersistenceMarker?: string }).__workbenchPersistenceMarker = value;
  }, marker);
  const expectSameRuntime = async () => {
    expect(await frame!.evaluate(() =>
      (window as Window & { __workbenchPersistenceMarker?: string }).__workbenchPersistenceMarker,
    )).toBe(marker);
  };

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await page.getByRole("link", { name: "Previews", exact: true }).click();
  await expect(preview).toBeVisible();
  await expectSameRuntime();
});

test("offers code-server as a persistent standalone sidebar tool", async ({ page }) => {
  await page.goto(privateWorkbench);
  await page.getByRole("link", { name: "Code-Server" }).click();
  await expect(page).toHaveURL(/\/workbench\/code-editor$/);
  await expect(page.locator(".project-picker-trigger")).toBeVisible();
  await expect(page.locator('iframe[title="Editor"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.getByRole("link", { name: "Code-Server" }).click();
  await expect(page.locator('iframe[title="Editor"]')).toBeVisible();
});

test("loads code-server and provides a working native terminal", async ({ page }) => {
  await page.goto(`${privateWorkbench}/projects/remote-workplace`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  const editor = page.locator('iframe[title="Editor"]');
  await expect(editor).toHaveAttribute("src", /\/editor\/\?folder=%2Fhome%2Fbbecker%2Fprojects%2FRemote_Workplace/);
  await expect(page.frameLocator('iframe[title="Editor"]').locator("body")).toBeVisible({ timeout: 20_000 });

  await page.goto(`${privateWorkbench}/terminal`);
  await expect(page.locator(".terminal-tab .terminal-state.is-connected")).toBeVisible({ timeout: 15_000 });
  const terminalInput = page.locator(".xterm-helper-textarea");
  await terminalInput.fill("bad");
  await terminalInput.press("Backspace");
  await terminalInput.press("Backspace");
  await terminalInput.press("Backspace");
  await terminalInput.type("printf '__PLAYWRIGHT_TERMINAL_OK__\\n'");
  await terminalInput.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText("__PLAYWRIGHT_TERMINAL_OK__", { timeout: 10_000 });
  await page.locator(".terminal-area").getByRole("button", { name: "Terminal schließen", exact: true }).click();
});

test("creates project-bound terminal tabs and splits them without replacing sessions", async ({ page }) => {
  await page.goto(`${privateWorkbench}/terminal`);
  const area = page.locator(".terminal-area");
  await expect(area.locator(".terminal-tab .terminal-state.is-connected")).toBeVisible({ timeout: 15_000 });

  await area.locator(".terminal-island").getByRole("button", { name: "Neues Terminal", exact: true }).click();
  await expect(area.getByRole("tab")).toHaveCount(2);
  await expect(area.locator(".terminal-tab .terminal-state.is-connected")).toHaveCount(2, { timeout: 15_000 });

  await page.locator(".project-picker-trigger").click();
  await page.getByLabel("Projekt suchen").fill("Remote_Workplace");
  await page.getByRole("option", { name: /Remote_Workplace/ }).click();
  await expect(area.getByRole("tab")).toHaveCount(3);
  await expect(area.locator(".terminal-tab .terminal-state.is-connected")).toHaveCount(3, { timeout: 15_000 });

  await area.getByRole("button", { name: "Terminal teilen", exact: true }).click();
  await expect(area).toHaveAttribute("data-split", "true");
  await area.getByRole("button", { name: "Split schließen", exact: true }).click();
  await expect(area).toHaveAttribute("data-split", "false");

  await area.getByRole("button", { name: "Terminalinformationen", exact: true }).click();
  await expect(area.locator(".terminal-info-popover code")).toContainText("/home/bbecker/projects/Remote_Workplace");

  for (let remaining = 3; remaining > 0; remaining -= 1) {
    await area.getByRole("button", { name: "Terminal schließen", exact: true }).click();
    await expect(area.getByRole("tab")).toHaveCount(remaining - 1);
  }
});

test("keeps T3 Code visibly connected to the selected project", async ({ page }) => {
  await page.goto(`${privateWorkbench}/t3-code`);
  await expect(page.locator(".project-picker")).toBeVisible();
  await expect(page.locator('iframe[title="T3 Code"]')).toBeVisible({ timeout: 20_000 });
});

test("runs a real Chromium session from the Browser tool", async ({ page }) => {
  await page.goto(`${privateWorkbench}/browser`);
  const address = page.getByLabel("Browser-Adresse");
  await expect(address).toBeVisible();
  await expect(page.getByText("Laufende lokale Dienste")).toBeVisible({ timeout: 15_000 });
  await address.fill("example.com");
  await address.press("Enter");
  await expect(address).toHaveValue(/https:\/\/example\.com\/?/, { timeout: 20_000 });
  await expect(page.getByAltText("Gerenderte Chromium-Seite")).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 20_000 });
});

test("opens CHAPPiE app.py through the stable code-server socket", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(message.text());
  });

  await page.goto(`${privateWorkbench}/projects/chappie`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();

  const editor = page.frameLocator('iframe[title="Editor"]');
  await expect(editor.locator(".monaco-workbench")).toBeVisible({ timeout: 30_000 });
  await editor.locator("body").press("Control+P");
  const quickOpen = editor.locator(".quick-input-widget input");
  await expect(quickOpen).toBeVisible();
  await quickOpen.fill("/home/bbecker/projects/CHAPPiE/app.py");
  const appFile = editor.getByRole("option", { name: /app\.py/ });
  await expect(appFile).toBeVisible();
  await appFile.click();

  await expect(editor.getByRole("tab", { name: /app\.py/ })).toBeVisible({ timeout: 15_000 });
  await expect(editor.locator(".editor-instance")).toBeVisible();

  await editor.locator("body").press("Control+N");
  const untitledEditor = editor.locator(".editor-instance").last();
  await untitledEditor.locator(".view-lines").pressSequentially("__PLAYWRIGHT_EDITOR_WRITE_OK__");
  await expect(untitledEditor.locator(".view-lines")).toContainText("__PLAYWRIGHT_EDITOR_WRITE_OK__");
  expect(browserErrors.filter((message) =>
    /failed to connect to websocket|unsupported_message_length|MIME-Typ|clipboard-(read|write)|Content-Security-Policy/i.test(message),
  )).toEqual([]);
});

test("keeps the mobile preview controls compact below the app navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${privateWorkbench}/projects/tg-vereinsapp`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();

  const island = page.locator(".panel-island");
  await expect(island).toBeVisible();
  const box = await island.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { y: bounds.y, height: bounds.height };
  });
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(box.y).toBeGreaterThanOrEqual(100);
  expect(box.y).toBeLessThan(240);
  await expect(page.getByLabel("Preview-Gerät")).toBeVisible();
});

test("gives the mobile editor a full-width usable viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${privateWorkbench}/projects/remote-workplace`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();

  const panel = page.locator('[data-panel-type="code-server"]');
  await expect(panel).toBeVisible();
  const regularBox = await panel.boundingBox();
  expect(regularBox).not.toBeNull();
  expect(regularBox!.width).toBe(390);
  await expect(page.getByTitle("In neuem Tab öffnen")).toBeVisible();

  await page.getByRole("button", { name: "Vollbild" }).click();
  const fullBox = await panel.boundingBox();
  expect(fullBox).not.toBeNull();
  expect(fullBox!.width).toBe(390);
  expect(fullBox!.height).toBe(844);
});
