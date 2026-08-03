import { expect, test, type Page } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;
const skip = () => !workbench;

function row(page: Page, suffix: string) {
  return page.locator(`[data-fm-row][data-path$="${suffix}"]`);
}

test.describe("Dateimanager desktop", () => {
  test.use({
    extraHTTPHeaders: { "tailscale-user-login": "file-manager@example.com" },
    viewport: { width: 1440, height: 960 },
  });

  test("zeigt das Drei-Pane-Layout und navigiert über Breadcrumbs und Baum", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await expect(page.locator(".file-manager")).toBeVisible();
    await expect(page.locator(".file-manager-tree-pane")).toBeVisible();
    await expect(page.locator(".file-manager-content")).toBeVisible();

    await row(page, "/apps").click();
    await expect(page.getByRole("button", { name: "apps", exact: true })).toHaveClass(/is-current/);

    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(row(page, "/apps")).toBeVisible();
  });

  test("öffnet den Quick Look mit Leertaste und wechselt per Pfeiltasten", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await row(page, "/package.json").click();
    await page.keyboard.press(" ");
    const quickLook = page.getByRole("dialog", { name: /Vorschau von package\.json/ });
    await expect(quickLook).toBeVisible();
    await expect(quickLook).toContainText('"name"');

    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("dialog", { name: /Vorschau von / })).not.toHaveAttribute("aria-label", /package\.json/);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Vorschau von / })).toHaveCount(0);
  });

  test("zeigt Code im Vorschau-Panel und schaltet auf Raster um", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await row(page, "/package.json").click();
    const detail = page.locator(".file-manager-detail-pane");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('"name"');

    await page.getByRole("button", { name: "Rasteransicht" }).click();
    await expect(page.locator(".file-manager-grid")).toBeVisible();
    await page.getByRole("button", { name: "Listenansicht" }).click();
    await expect(page.locator(".file-manager-list")).toBeVisible();
  });

  test("öffnet das Kontextmenü mit Dateiaktionen", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await row(page, "/package.json").click({ button: "right" });
    const menu = page.locator(".file-manager-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Herunterladen");
    await expect(menu).toContainText("Im Terminal öffnen");
    await expect(menu).toContainText("Umbenennen");
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });

  test("filtert die Liste über die Suche", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await page.getByPlaceholder("Suchen").fill("package.json");
    await expect(page.locator(".file-manager-row")).toHaveCount(1);
    await expect(row(page, "/package.json")).toContainText("package.json");
  });

  test("öffnet den Dateimanager als Tool-Node im Orbit", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/workbench`);
    await page.getByRole("button", { name: "Files", exact: true }).click();
    const panel = page.locator('[data-panel-type="files"]').filter({ has: page.locator(".file-manager") }).first();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".file-manager-row").first()).toBeVisible();
  });
});

test.describe("Dateimanager iPad hoch", () => {
  test.use({
    extraHTTPHeaders: { "tailscale-user-login": "file-manager@example.com" },
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
  });

  test("öffnet Baum und Vorschau als Drawer", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await page.getByRole("button", { name: "Dateibaum ein- oder ausblenden" }).click();
    const tree = page.locator(".file-manager-tree-pane.is-drawer");
    await expect(tree).toBeVisible();
    await expect(tree).toHaveClass(/is-open/);

    await page.getByRole("button", { name: "Dateibaum schließen" }).click();
    await expect(page.locator(".file-manager-tree-pane")).toHaveCount(0);

    await row(page, "/package.json").click();
    const detail = page.locator(".file-manager-detail-pane.is-drawer");
    await expect(detail).toBeVisible();
    await expect(detail).toHaveClass(/is-open/);
    await expect(detail).toContainText('"name"');
  });

  test("hält auf dem Tablet die Drawer-Breite ein und blendet über den Backdrop", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await page.getByRole("button", { name: "Dateibaum ein- oder ausblenden" }).click();
    const tree = page.locator(".file-manager-tree-pane.is-drawer");
    await expect(tree).toHaveClass(/is-open/);
    const treeBounds = await tree.boundingBox();
    expect(treeBounds!.width).toBeLessThanOrEqual(320);
    const backdrop = page.locator(".file-manager-drawer-backdrop");
    await expect(backdrop).toBeVisible();
    await backdrop.click({ position: { x: 380, y: 400 } });
    await expect(page.locator(".file-manager-tree-pane")).toHaveCount(0);
  });
});

test.describe("Dateimanager Phone", () => {
  test.use({
    extraHTTPHeaders: { "tailscale-user-login": "file-manager@example.com" },
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("zeigt den Quick Look als Bottom Sheet und den Baum als Drawer", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);

    await page.getByRole("button", { name: "Dateibaum ein- oder ausblenden" }).click();
    const tree = page.locator(".file-manager-tree-pane.is-drawer");
    await expect(tree).toBeVisible();
    await expect(tree).toHaveClass(/is-open/);
    await page.getByRole("button", { name: "Dateibaum schließen" }).click();

    await row(page, "/package.json").click();
    const sheet = page.locator(".file-quicklook-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('"name"');
    // Auf dem Handy nimmt die Vorschau die ganze Fläche ein.
    const bounds = await sheet.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBe(390);
    expect(bounds?.y).toBe(0);
    expect(bounds!.y + bounds!.height).toBe(844);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("filtert über die Suche und zeigt den Leerzustand", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    // Die Suche fährt auf dem Handy erst über der Aktionsleiste ein.
    await page.getByRole("button", { name: "Im aktuellen Ordner suchen" }).click();
    await page.getByPlaceholder("Suchen").fill("gibt-es-nicht-123");
    await expect(page.locator(".file-manager-empty")).toContainText("Keine Treffer");
  });

  test("hält Layout-Integrität ein: keine Überlappungen, Touch-Ziele, keine Seiten-Scrollen", async ({ page }) => {
    test.skip(skip(), "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
    await page.goto(`${workbench}/workbench/files`);
    await page.waitForSelector(".file-manager-row");

    // Die Pfadzeile steht oben, die Aktionen liegen darunter am unteren Rand.
    const toolbar = page.locator(".file-manager-toolbar");
    const toolbarBox = await toolbar.boundingBox();
    const breadcrumbs = await page.locator(".file-manager-breadcrumbs").boundingBox();
    const actions = await page.locator(".file-manager-actionbar").boundingBox();
    expect(toolbarBox!.y).toBeLessThanOrEqual(breadcrumbs!.y);
    expect(breadcrumbs!.y + breadcrumbs!.height).toBeLessThanOrEqual(actions!.y + 1);
    // Die Aktionsleiste sitzt in Daumenreichweite in der unteren Bildschirmhälfte.
    expect(actions!.y).toBeGreaterThan(844 / 2);

    // Touch-Ziele mindestens 44 px auf dem Handy.
    for (const button of await page.locator(".file-manager-actionbar button").all()) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    // Kein horizontales Scrollen der Seite; Scrollen passiert nur im Listenbereich.
    const noHorizontal = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noHorizontal).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 9999));
    const pageDidNotScroll = await page.evaluate(() => window.scrollY === 0);
    expect(pageDidNotScroll).toBe(true);

    // Der Sucheingabe hat 16 px Schrift (Safari-Zoom-Schutz).
    await page.getByRole("button", { name: "Im aktuellen Ordner suchen" }).click();
    await expect(page.getByPlaceholder("Suchen")).toHaveCSS("font-size", "16px");
  });
});
