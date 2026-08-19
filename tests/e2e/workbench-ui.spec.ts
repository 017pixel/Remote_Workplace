import { expect, test } from "@playwright/test";
import { hasPrivateWrapt, privateWraptReason, workbenchUrl } from "./helpers/environment";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
});

// Diese Tests erwarten die eingerichtete Instanz: benannte Projekte, laufenden
// code-server, T3 Code und eine Tailscale-Identität für die Terminals.
test.skip(() => !hasPrivateWrapt, privateWraptReason);

const privateWrapt = workbenchUrl;

test("shows every local project and navigable breadcrumbs", async ({ page }) => {
  await page.goto(`${privateWrapt}/projects`);
  await expect(page.getByRole("heading", { name: "Projekte", level: 1 })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(21);
  await expect(page.getByRole("link", { name: "Wrapt" })).toBeVisible();

  await page.getByRole("link", { name: "Wrapt" }).click();
  await expect(page).toHaveURL(/\/wrapt$/);
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
});

test("keeps preview alive across device, fullscreen and external-tab actions", async ({ page, context }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(message.text());
  });

  await page.goto(`${privateWrapt}/projects/demo-app`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(page).toHaveURL(/\/wrapt\/previews\?preview=/);

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
  await page.goto(`${privateWrapt}/projects/demo-app`);
  await page.getByRole("button", { name: "Öffnen", exact: true }).click();

  const preview = page.locator('iframe[title="Preview"]');
  await expect(preview).toBeVisible();
  const previewElement = await preview.elementHandle();
  const frame = await previewElement?.contentFrame();
  expect(frame).not.toBeNull();
  const marker = `persistent-${Date.now()}`;
  await frame!.evaluate((value) => {
    (window as Window & { __wraptPersistenceMarker?: string }).__wraptPersistenceMarker = value;
  }, marker);
  const expectSameRuntime = async () => {
    expect(await frame!.evaluate(() =>
      (window as Window & { __wraptPersistenceMarker?: string }).__wraptPersistenceMarker,
    )).toBe(marker);
  };

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
  await page.getByRole("link", { name: "Previews", exact: true }).click();
  await expect(preview).toBeVisible();
  await expectSameRuntime();
});

test("offers code-server as a persistent standalone sidebar tool", async ({ page }) => {
  await page.goto(privateWrapt);
  await page.getByRole("link", { name: "Code-Server" }).click();
  await expect(page).toHaveURL(/\/wrapt\/code-editor$/);
  await expect(page.locator(".project-picker-trigger")).toBeVisible();
  await expect(page.locator('iframe[title="Editor"]')).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.getByRole("link", { name: "Code-Server" }).click();
  await expect(page.locator('iframe[title="Editor"]')).toBeVisible();
});

test("loads code-server and provides a working native terminal", async ({ page }) => {
  await page.goto(`${privateWrapt}/projects/wrapt`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  const editor = page.locator('iframe[title="Editor"]');
  await expect(editor).toHaveAttribute("src", /\/editor\/\?folder=%2Fhome%2Fuser%2Fprojects%2FWrapt/);
  await expect(page.frameLocator('iframe[title="Editor"]').locator("body")).toBeVisible({ timeout: 20_000 });

  await page.goto(`${privateWrapt}/terminal`);
  const emptyButton = page.locator(".terminal-empty-state button");
  if (await emptyButton.count() > 0 && await emptyButton.isVisible().catch(() => false)) await emptyButton.click();
  await expect(page.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 15_000 });
  const terminalInput = page.locator(".xterm-helper-textarea");
  await terminalInput.fill("bad");
  await terminalInput.press("Backspace");
  await terminalInput.press("Backspace");
  await terminalInput.press("Backspace");
  await terminalInput.type("printf '__PLAYWRIGHT_TERMINAL_OK__\\n'");
  await terminalInput.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText("__PLAYWRIGHT_TERMINAL_OK__", { timeout: 10_000 });
});

test("creates project-bound terminals and splits them without replacing sessions", async ({ page }) => {
  await page.goto(`${privateWrapt}/terminal`);
  const area = page.locator(".terminal-area");
  const emptyButton = area.locator(".terminal-empty-state button");
  if (await emptyButton.count() > 0 && await emptyButton.isVisible().catch(() => false)) await emptyButton.click();
  await expect(area.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 15_000 });
  await expect(area.locator(".terminal-tree-entry")).toHaveCount(1);

  // Zweites Terminal über die Sidebar: Die erste Session läuft weiter.
  await area.getByRole("button", { name: "Neues Terminal", exact: true }).click();
  await expect(area.locator(".terminal-tree-entry")).toHaveCount(2);
  await expect(area.locator(".terminal-tree-status.is-connected")).toHaveCount(2, { timeout: 15_000 });

  // Projektbindung: Der Project-Picker öffnet ein Terminal im Projekt.
  await page.locator(".project-picker-trigger").click();
  await page.getByLabel("Projekt suchen").fill("Wrapt");
  await page.getByRole("option", { name: /Wrapt/ }).click();
  await expect(area.locator(".terminal-tree-entry")).toHaveCount(3);
  await expect(area.locator(".terminal-tree-status.is-connected")).toHaveCount(3, { timeout: 15_000 });

  // Split: beide Panes sichtbar, danach wieder einzeln.
  await area.getByRole("button", { name: "Neues Terminal rechts teilen", exact: true }).click();
  await expect(area).toHaveAttribute("data-split", "true");
  await area.getByRole("button", { name: "Split schließen", exact: true }).click();
  await expect(area).toHaveAttribute("data-split", "false");

  await expect(area.locator(".terminal-tree-cwd").first()).toContainText("/home/user/projects/Wrapt");

  // Panes schließen: Die Entries (und damit die Sessions) bleiben erhalten.
  for (let remaining = 3; remaining > 0; remaining -= 1) {
    await area.getByRole("button", { name: "Weitere Terminalaktionen", exact: true }).click();
    await area.getByRole("button", { name: "Pane schließen", exact: true }).click();
    await expect(area.locator(".terminal-tree-entry")).toHaveCount(3);
  }
});

test("öffnet die OpenCode-Web-UI über den Workbench-Proxy", async ({ page }) => {
  await page.goto(`${privateWrapt}/opencode`);
  const frame = page.locator('.tool-surface-standalone iframe[title="OpenCode"]');
  await expect(frame).toHaveAttribute("src", "/opencode");
  await expect(frame).toBeVisible();
});

test("keeps T3 Code visibly connected to the selected project", async ({ page }) => {
  await page.goto(`${privateWrapt}/t3-code`);
  await expect(page.locator(".project-picker")).toBeVisible();
  await expect(page.locator('iframe[title="T3 Code"]')).toBeVisible({ timeout: 20_000 });
});

test("runs a real Chromium session from the Browser tool", async ({ page }) => {
  await page.goto(`${privateWrapt}/browser`);
  const address = page.getByLabel("Browser-Adresse");
  await expect(address).toBeVisible();
  await expect(page.getByText("Laufende Projekt-Dienste")).toBeVisible({ timeout: 15_000 });
  await address.fill("example.com");
  await address.press("Enter");
  await expect(address).toHaveValue(/https:\/\/example\.com\/?/, { timeout: 20_000 });
  await expect(page.getByAltText("Gerenderte Chromium-Seite")).toHaveAttribute("src", /^data:image\/jpeg;base64,/, { timeout: 20_000 });
});

test("opens Sample app.py through the stable code-server socket", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") browserErrors.push(message.text());
  });

  await page.goto(`${privateWrapt}/projects/chappie`);
  await page.getByRole("button", { name: "Editor", exact: true }).click();

  const editor = page.frameLocator('iframe[title="Editor"]');
  await expect(editor.locator(".monaco-workbench")).toBeVisible({ timeout: 30_000 });
  await editor.locator("body").press("Control+P");
  const quickOpen = editor.locator(".quick-input-widget input");
  await expect(quickOpen).toBeVisible();
  await quickOpen.fill("/home/user/projects/Sample/app.py");
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
  await page.goto(`${privateWrapt}/projects/demo-app`);
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
  await page.goto(`${privateWrapt}/projects/wrapt`);
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
