import { expect, test, type Page } from "@playwright/test";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/workbench`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;
const e2eUser = process.env.WRAPT_E2E_USER ?? "user@example.com";
// Playwright läuft vom Repo-Root (pnpm test:e2e); der Testserver sieht
// dasselbe Dateisystem und kann das Fixture über den absoluten Pfad starten.
const fixture = `${process.cwd()}/tests/fixtures/tui-fixture.mjs`;

test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser } });

async function openFirstTerminal(page: Page) {
  const emptyButton = page.locator(".terminal-empty-state button");
  const entries = page.locator(".terminal-tree-entry");
  await expect.poll(async () => (await emptyButton.count()) + (await entries.count()), { timeout: 20_000 }).toBeGreaterThan(0);
  if (await emptyButton.count() > 0 && await emptyButton.isVisible().catch(() => false)) await emptyButton.click();
  await expect(page.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });
}

async function runFixture(page: Page, mode: string) {
  const input = page.locator(".xterm-helper-textarea").last();
  await input.fill("");
  await input.type(`node ${fixture} --${mode}`);
  await input.press("Enter");
}

/** Liest die sichtbaren Terminal-Zeilen ohne ANSI und ohne Leerraum am Rand. */
async function rows(page: Page) {
  return page.locator(".xterm-rows > div").evaluateAll((elements) => elements.map((row) => (row.textContent ?? "").replace(/\s+$/, "")));
}

test("renders a fullscreen TUI identically after reload (no right-shift)", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  await runFixture(page, "alternate");
  await expect(page.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 15_000 });

  const before = await rows(page);
  expect(before.some((row) => row.trimStart().startsWith("┌"))).toBe(true);
  // Alle drei Marker-Zeilen beginnen an derselben Spalte (kein Drift nach rechts).
  const markers = before.filter((row) => row.includes("beginnt Spalte 1"));
  expect(markers.length).toBeGreaterThanOrEqual(2);
  expect(markers.map((row) => row.indexOf("Zeile"))).toEqual([...markers].map(() => markers[0]!.indexOf("Zeile")));

  await page.reload();
  await openFirstTerminal(page);
  await expect(page.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 20_000 });
  const after = await rows(page);
  expect(after.some((row) => row.trimStart().startsWith("┌"))).toBe(true);
  const afterMarkers = after.filter((row) => row.includes("beginnt Spalte 1"));
  expect(afterMarkers.length).toBeGreaterThanOrEqual(2);
  expect(afterMarkers.map((row) => row.indexOf("Zeile"))).toEqual([...afterMarkers].map(() => afterMarkers[0]!.indexOf("Zeile")));
});

test("recreates the browser and resumes the same runtime with intact rendering", async ({ browser }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  const context = await browser.newContext({ viewport: { width: 1_280, height: 800 }, extraHTTPHeaders: { "tailscale-user-login": e2eUser } });
  const page = await context.newPage();
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  await runFixture(page, "alternate");
  await expect(page.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 15_000 });

  await context.close();
  const recreated = await browser.newContext({ viewport: { width: 1_280, height: 800 }, extraHTTPHeaders: { "tailscale-user-login": e2eUser } });
  const secondPage = await recreated.newPage();
  await secondPage.goto(`${workbench}/terminal`);
  await openFirstTerminal(secondPage);
  await expect(secondPage.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 20_000 });
  const after = await rows(secondPage);
  expect(after.some((row) => row.trimStart().startsWith("┌"))).toBe(true);
  await recreated.close();
});

test("keeps a hidden terminal intact when switching back (no black area)", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  await runFixture(page, "alternate");
  await expect(page.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 15_000 });

  // Zweites Terminal öffnen (wechselt den Fokus) und zurückwechseln.
  await page.getByRole("button", { name: "Neues Terminal", exact: true }).click();
  await expect(page.locator(".terminal-tree-entry")).toHaveCount(2);
  await page.locator(".terminal-tree-entry .terminal-tree-row").first().click();
  await expect(page.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 15_000 });
  const after = await rows(page);
  expect(after.some((row) => row.trimStart().startsWith("┌"))).toBe(true);
});

test("shows both terminals in a split without layout corruption", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);
  await runFixture(page, "alternate");
  await expect(page.locator(".xterm-screen")).toContainText("TUI FIXTURE", { timeout: 15_000 });

  await page.getByRole("button", { name: "Neues Terminal rechts teilen", exact: true }).click();
  await expect(page.locator(".terminal-area")).toHaveAttribute("data-split", "true");
  await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(2, { timeout: 10_000 });
  // Der TUI bleibt im linken Pane sichtbar.
  await expect(page.locator(".terminal-session-pane.is-visible").first()).toContainText("TUI FIXTURE");
});

test("uses a touch drawer, focused pane and safe bottom controls on phone portrait", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workbench}/terminal`);
  await openFirstTerminal(page);

  const reopen = page.getByRole("button", { name: "Terminal-Sidebar einblenden" });
  await expect(reopen).toBeVisible();
  await reopen.click();
  const drawer = page.getByRole("complementary", { name: "Terminal-Sidebar" });
  await expect(drawer).toHaveClass(/is-open/);
  const drawerBox = await drawer.boundingBox();
  expect(drawerBox?.width).toBeLessThanOrEqual(350);
  expect(drawerBox?.width).toBeGreaterThanOrEqual(280);

  await drawer.getByRole("button", { name: "Neues Terminal rechts teilen" }).click();
  await expect(page.locator(".terminal-area")).toHaveAttribute("data-split", "true");
  await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(1);

  const keybar = page.locator(".terminal-keybar");
  await expect(keybar).toBeVisible();
  const keybarBox = await keybar.boundingBox();
  expect(keybarBox?.y).toBeGreaterThanOrEqual(0);
  expect((keybarBox?.y ?? 0) + (keybarBox?.height ?? 0)).toBeLessThanOrEqual(845);
  const keyButton = page.locator(".terminal-keybar-keys > button").first();
  const keyButtonBox = await keyButton.boundingBox();
  expect(keyButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(keyButtonBox?.height).toBeGreaterThanOrEqual(44);

  await drawer.getByRole("button", { name: "Terminal-Sidebar ausblenden" }).click();
  await expect(drawer).not.toHaveClass(/is-open/);

  // Das Schrumpfen des sichtbaren Viewports durch die Bildschirmtastatur darf
  // die Geräteorientierung und damit die xterm-Instanz nicht neu aufbauen.
  const terminalInput = page.locator(".xterm-helper-textarea").last();
  await page.locator(".terminal-viewport").click();
  await expect(terminalInput).toBeFocused();
  await page.evaluate(() => {
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 320 });
    document.documentElement.style.setProperty("--app-viewport-height", "320px");
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-orientation", "portrait");
  await expect(terminalInput).toBeFocused();
});
