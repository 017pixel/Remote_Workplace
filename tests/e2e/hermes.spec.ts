import { expect, test } from "@playwright/test";

const e2eUser = process.env.WORKBENCH_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("remote-workplace.hermes.v1"));
});

test("öffnet Hermes als native, klar getrennte Workbench-Oberfläche", async ({ page }) => {
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  await expect(shell).toBeVisible();
  await expect(shell).toHaveAttribute("data-surface", "chat");
  await expect(shell).toHaveAttribute("data-hermes-ui", "native");
  await expect(shell.getByRole("navigation", { name: "Hermes-Bereiche" }).getByRole("button")).toHaveCount(5);
  await expect(shell.locator(".hermes-chat-main")).toBeVisible();
  await expect(shell.locator('iframe[title="Hermes Agent"]')).toHaveCount(0);

  await shell.getByRole("button", { name: "Verwaltung" }).click();
  await expect(shell).toHaveAttribute("data-surface", "admin");
  await expect(shell.locator('iframe[title="Hermes Agent"]')).toBeVisible();

  await page.goto("/workbench/hermes-agent?path=%2Fcron");
  await expect(shell).toHaveAttribute("data-surface", "admin");
  await expect(shell.locator('iframe[title="Hermes Agent"]')).toHaveAttribute("src", "/hermes/cron");
});

test("passt die Navigation an die eigene Flächenbreite statt an das Browserfenster an", async ({ page }) => {
  await page.route("**/api/v1/hermes/sessions**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      sessions: [{
        id: "drawer-session", title: "Mobile Session", source: "acp", status: "idle",
        model: "deepseek-v4-flash", provider: "custom", cwd: null, projectId: null,
        messageCount: 2, createdAt: "2026-08-11T08:00:00.000Z", updatedAt: "2026-08-11T08:05:00.000Z",
      }],
      nextCursor: null,
    }),
  }));
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  await shell.evaluate((element) => {
    element.style.width = "390px";
    element.style.height = "700px";
    element.style.flex = "0 0 auto";
  });

  const nav = shell.getByRole("navigation", { name: "Hermes-Bereiche" });
  const buttons = nav.getByRole("button");
  await expect(buttons).toHaveCount(5);
  await expect(shell.getByRole("button", { name: "Sessionliste öffnen" })).toBeVisible();
  const boxes = await buttons.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  const openSessions = shell.getByRole("button", { name: "Sessionliste öffnen" });
  await openSessions.click();
  const drawer = shell.getByRole("dialog", { name: "Hermes-Sessions" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Sessionliste einklappen" })).toBeFocused();
  await drawer.getByRole("button", { name: "Mobile Session löschen" }).click();
  const confirm = page.getByRole("dialog", { name: "Session löschen?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Abbrechen" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: "Sessionliste einklappen" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(openSessions).toBeFocused();
});

test("Session- und Diagnose-Deep-Links öffnen ihr tatsächliches Ziel", async ({ page }) => {
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  await shell.getByRole("button", { name: "Aufgaben" }).click();
  await expect(shell).toHaveAttribute("data-surface", "tasks");

  await page.goto("/workbench/hermes-agent?session=session-from-deep-link");
  await expect(shell).toHaveAttribute("data-surface", "chat");
  await expect(shell.getByRole("button", { name: "Chat", exact: true })).toHaveAttribute("aria-current", "page");

  await page.goto("/workbench/hermes-agent?diagnostics=1");
  await expect(page.getByRole("dialog", { name: "Hermes-Diagnose" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dialog schließen" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Hermes-Diagnose" })).toHaveCount(0);
});

test("Verlauf bietet eine erreichbare, sichere Löschaktion", async ({ page }) => {
  await page.route("**/api/v1/hermes/sessions**", async (route) => {
    if (route.request().method() !== "GET") return route.fulfill({ status: 204 });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        sessions: [{
          id: "session-1", title: "Nächtlicher Bericht", source: "cron", status: "idle",
          model: "deepseek-v4-flash", provider: "custom", cwd: null, projectId: null,
          messageCount: 3, createdAt: "2026-08-11T07:00:00.000Z", updatedAt: "2026-08-11T07:04:00.000Z",
        }],
        nextCursor: null,
      }),
    });
  });
  await page.goto("/workbench/hermes-agent?surface=history");
  const row = page.locator(".hermes-history-row");
  await expect(row).toContainText("Nächtlicher Bericht");
  const remove = row.getByRole("button", { name: /Nächtlicher Bericht.*löschen/ });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Session löschen?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/hermes-confirm-dialog/);
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("dialog", { name: "Session löschen?" })).toHaveCount(0);
});

test("Cron-Zeilen öffnen den konkreten Job in der Verwaltung", async ({ page }) => {
  await page.route("**/api/v1/hermes/cron", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ jobs: [{
      id: "job-1", name: "Tagesbericht", schedule: "0 6 * * *", enabled: true,
      nextRunAt: "2026-08-12T06:00:00.000Z", lastRunAt: "2026-08-11T06:00:00.000Z",
      lastStatus: "success", adminPath: "/cron/job-1",
    }] }),
  }));
  await page.goto("/workbench/hermes-agent?surface=cron");
  await page.getByRole("button", { name: "Job „Tagesbericht“ in der Verwaltung öffnen" }).click();
  const frame = page.locator('iframe[title="Hermes Agent"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", "/hermes/cron/job-1");
});
