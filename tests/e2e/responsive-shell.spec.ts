import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

const routes = [
  "", "projects", "settings", "usage", "workbench", "tech-tldrs",
  "browser", "terminal", "previews", "code-editor", "t3-code", "codex", "opencode", "notion",
];

test("uses the touch shell without desktop chrome", async ({ page }) => {
  await page.goto("/workbench/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-shell-mode", /compact|tablet/);
  await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
  await expect(page.locator(".status-bar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Navigation öffnen" })).toBeVisible();
  const size = await page.getByRole("button", { name: "Navigation öffnen" }).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
});

test("navigation page manages focus, history and scroll lock", async ({ page }) => {
  await page.goto("/workbench/");
  const trigger = page.getByRole("button", { name: "Navigation öffnen" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".mobile-nav-trigger")).toHaveCount(0);
  await expect(page.locator(".content-column")).toHaveAttribute("inert", "");
  await expect(dialog.getByRole("button", { name: "Navigation schließen" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("keeps route floating controls behind the navigation page", async ({ page }) => {
  const floatingRoutes = ["", "workbench", "tech-tldrs", "browser", "terminal"];
  const floatingSelector = [
    ".news-dynamic-island",
    ".orbit-main-island",
    ".terminal-actions-trigger",
    ".terminal-island",
    ".panel-island",
    ".browser-context-menu",
  ].join(",");

  for (const route of floatingRoutes) {
    await page.goto(`/workbench/${route}`);
    await page.getByRole("button", { name: "Navigation öffnen" }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".mobile-nav-trigger")).toHaveCount(0);

    const layers = await page.locator(floatingSelector).evaluateAll((elements) => elements
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0));
    const navigationLayer = Number.parseInt(await dialog.evaluate((element) => getComputedStyle(element).zIndex), 10);
    expect(navigationLayer).toBe(250);
    expect(layers.every((layer) => layer < navigationLayer), route).toBe(true);

    await dialog.getByRole("button", { name: "Navigation schließen" }).click();
    await expect(dialog).toHaveCount(0);
  }
});

test("keeps all main routes inside the viewport", async ({ page }) => {
  test.setTimeout(90_000);
  for (const route of routes) {
    await page.goto(`/workbench/${route}`);
    await expect(page.locator(".app-shell")).toBeVisible();
    const overflow = await page.locator(".app-shell").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(overflow.scrollWidth, route).toBeLessThanOrEqual(overflow.clientWidth + 1);
    expect(overflow.scrollHeight, route).toBeLessThanOrEqual(overflow.clientHeight + 1);
  }
});

test("uses a reversible touch dialog for destructive settings", async ({ page }) => {
  await page.goto("/workbench/settings");
  const trigger = page.getByRole("button", { name: "Workspace zurücksetzen" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Workspace zurücksetzen?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Abbrechen" })).toBeFocused();
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("preserves an embedded runtime across rotation", async ({ page }) => {
  await page.goto("/workbench/browser");
  const runtime = page.locator(".chromium-browser");
  await expect(runtime).toBeVisible();
  await runtime.evaluate((element) => { (element as HTMLElement).dataset.rotationMarker = "preserved"; });
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await page.setViewportSize({ width: viewport!.height, height: viewport!.width });
  await expect(runtime).toHaveAttribute("data-rotation-marker", "preserved");
});

test("moves focus into content after a navigation choice", async ({ page }) => {
  await page.goto("/workbench/");
  await page.getByRole("button", { name: "Navigation öffnen" }).click();
  await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Projekte" }).click();
  await expect(page).toHaveURL(/\/workbench\/projects$/);
  await expect(page.locator("#main-content")).toBeFocused();
});
