import { expect, test, type Page } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

const routes = [
  "", "projects", "inbox", "settings", "usage", "workbench", "tech-tldrs", "files", "ki-skills", "hermes-agent",
  "browser", "terminal", "previews", "code-editor", "t3-code", "codex", "opencode", "claude", "notion",
];

type DeviceMode = "phone" | "tablet-portrait" | "tablet-landscape" | "desktop";

async function deviceMode(page: Page): Promise<DeviceMode> {
  return await page.locator(".app-shell").getAttribute("data-device-mode") as DeviceMode;
}

async function navigationTrigger(page: Page) {
  return await deviceMode(page) === "phone"
    ? page.getByRole("button", { name: "Weitere Bereiche öffnen" })
    : page.getByRole("button", { name: "Navigation öffnen" });
}

async function mockPreviewSlots(page: Page) {
  const slots = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    internalPort: 3_901 + index,
    publicPort: 8_451 + index,
    targetPort: null as number | null,
    publicUrl: `https://preview-${index + 1}.example.test/`,
    updatedAt: null as string | null,
  }));
  await page.route("**/api/v1/previews/slots", async (route) => {
    let assignedSlotId: number | null = null;
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON() as { slotId?: number | null; targetPort: number | null };
      assignedSlotId = input.slotId ?? slots.find((slot) => slot.targetPort === null)?.id ?? null;
      const slot = slots.find((candidate) => candidate.id === assignedSlotId);
      if (slot) {
        slot.targetPort = input.targetPort;
        slot.updatedAt = new Date().toISOString();
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ slots, assignedSlotId }) });
  });
}

test("uses the navigation pattern assigned to the current device mode", async ({ page }) => {
  await page.goto("/workbench/");
  const shell = page.locator(".app-shell");
  await expect(shell).toHaveAttribute("data-shell-mode", /compact|tablet/);
  await expect(page.locator(".status-bar")).toHaveCount(0);
  const mode = await deviceMode(page);
  if (mode === "phone") {
    await expect(page.locator(".workspace-sidebar, .tablet-rail")).toHaveCount(0);
    const bottom = page.getByRole("navigation", { name: "Mobile Hauptnavigation" });
    await expect(bottom).toBeVisible();
    await expect(bottom.locator("a, button")).toHaveCount(5);
  } else if (mode === "tablet-portrait") {
    await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Tablet Hauptnavigation" })).toBeVisible();
    await expect(page.locator(".mobile-bottom-nav")).toHaveCount(0);
  } else {
    await expect(page.locator(".workspace-sidebar")).toBeVisible();
    await expect(page.locator(".sidebar-shell")).toHaveCSS("width", "210px");
    await expect(page.locator(".tablet-rail, .mobile-bottom-nav")).toHaveCount(0);
  }
  const trigger = mode === "tablet-landscape" ? null : await navigationTrigger(page);
  if (trigger) {
    const size = await trigger.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
});

test("navigation page manages focus, history and scroll lock", async ({ page }) => {
  await page.goto("/workbench/");
  const mode = await deviceMode(page);
  test.skip(mode === "tablet-landscape", "Die kompakte Sidebar zeigt alle Ziele direkt.");
  const trigger = await navigationTrigger(page);
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
    ".terminal-island",
    ".panel-island",
    ".browser-context-menu",
  ].join(",");

  for (const route of floatingRoutes) {
    await page.goto(`/workbench/${route}`);
    const mode = await deviceMode(page);
    test.skip(mode === "tablet-landscape", "Die kompakte Sidebar benötigt keine Navigationsseite.");
    await (await navigationTrigger(page)).click();
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
  await mockPreviewSlots(page);
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
  const mode = await deviceMode(page);
  if (mode === "tablet-landscape") {
    await page.getByRole("link", { name: "Projekte" }).click();
  } else {
    await (await navigationTrigger(page)).click();
    await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Projekte" }).click();
  }
  await expect(page).toHaveURL(/\/workbench\/projects$/);
  await expect(page.locator("#main-content")).toBeFocused();
});
