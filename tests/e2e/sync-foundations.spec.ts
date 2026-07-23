import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "ui-check@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("shows real recent projects, collapsed separators and shared Notion", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  const projects = await (await page.request.get(new URL("/api/v1/projects", workbench).toString())).json() as {
    projects: Array<{ id: string; name: string; path: string; availability: string; activity: { effectiveAt: string | null } }>;
    recentLimit: number;
  };
  const selectedProject = projects.projects.find((project) => project.availability === "available");
  expect(selectedProject).toBeDefined();

  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.getByRole("button", { name: /neue-datei\.ts/ })).toHaveCount(0);
  const projectSectionButtons = page.locator(".sidebar-section").nth(1).locator("button.orbit-palette-item");
  expect((await projectSectionButtons.count()) - 1).toBeLessThanOrEqual(projects.recentLimit);

  await page.getByRole("button", { name: "Alle Projekte auswählen" }).click();
  const picker = page.getByRole("dialog", { name: "Serverprojekt öffnen" });
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox", { name: "Serverpfad" }).fill(selectedProject!.path);
  await picker.getByRole("button", { name: "Öffnen", exact: true }).click();
  await expect(picker.locator(".orbit-server-tree-row.is-selected")).toHaveAttribute("data-path", selectedProject!.path);
  await picker.getByRole("button", { name: "Im Orbit öffnen" }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".orbit-project-node").filter({ hasText: selectedProject!.name })).toBeVisible();
  await expect(projectSectionButtons.first()).toContainText(selectedProject!.name);

  await page.getByLabel("Sidebar einklappen").click();
  await expect(page.locator(".sidebar-section-divider")).toHaveCount(5);
  await page.getByLabel("Sidebar ausklappen").click();

  await page.locator(".orbit-palette-item").filter({ hasText: /^Notionziehen$/ }).click();
  const notion = page.locator('.orbit-live-node [data-panel-type="notion"]').last();
  await expect(notion).toBeVisible();
  await expect(notion.locator(".chromium-browser")).toBeVisible();
  await expect(notion.locator(".browser-connection.is-ready")).toBeVisible({ timeout: 30_000 });
  await expect(notion.locator(".browser-error")).toHaveCount(0);
});
