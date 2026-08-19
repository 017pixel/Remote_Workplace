import { expect, test, type Page } from "@playwright/test";

// Regressionstest für den Sidebar-Absturz: Die Hooks der Sektionen standen hinter
// `!collapsed &&` im JSX. Startete die Seite eingeklappt, fehlten alle Einträge unterhalb
// von "Workspace", und beim Ausklappen sprang die Hook-Anzahl — React brach den Baum ab.

const SIDEBAR_KEY = "wrapt.sidebar.v1";

/** Startet die Seite mit einer eingeklappten, persistierten Sidebar — wie nach F5 beim Nutzer. */
async function openCollapsed(page: Page) {
  await page.addInitScript(([key]) => {
    window.localStorage.setItem(key, JSON.stringify({ collapsed: true, width: 256 }));
  }, [SIDEBAR_KEY]);
  await page.goto("/wrapt/");
  await expect(page.locator(".sidebar-shell")).toBeVisible();
}

test("zeigt eingeklappt alle Navigationsebenen, nicht nur die ersten vier", async ({ page }) => {
  await openCollapsed(page);

  const sidebar = page.locator(".sidebar-shell");
  await expect(sidebar).toHaveClass(/is-collapsed/);

  // Werkzeuge und Fußbereich müssen erreichbar bleiben — genau die fehlten vorher.
  await expect(sidebar.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Terminal" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Dateien" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Einstellungen" })).toBeVisible();
});

test("überlebt das Aus- und Einklappen ohne Absturz", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await openCollapsed(page);
  const sidebar = page.locator(".sidebar-shell");

  await sidebar.getByRole("button", { name: "Sidebar ausklappen" }).click();
  await expect(sidebar).not.toHaveClass(/is-collapsed/);
  await expect(sidebar.getByRole("link", { name: "Terminal" })).toBeVisible();

  await sidebar.getByRole("button", { name: "Sidebar einklappen" }).click();
  await expect(sidebar).toHaveClass(/is-collapsed/);

  // Der Crash-Dialog erscheint nur, wenn wirklich etwas abgestürzt ist.
  await expect(page.locator(".crash-backdrop")).toHaveCount(0);
  expect(pageErrors, `Unerwartete Seitenfehler: ${pageErrors.join(" | ")}`).toEqual([]);
});

test("klappt Sektionen zu und wieder auf, ohne Einträge zu verlieren", async ({ page }) => {
  await page.goto("/wrapt/");
  const sidebar = page.locator(".sidebar-shell");
  await expect(sidebar).toBeVisible();

  const werkzeuge = sidebar.getByRole("button", { name: /^Werkzeuge (ein|aus)klappen$/ });
  await werkzeuge.click();
  await expect(sidebar.getByRole("link", { name: "Terminal" })).toHaveCount(0);

  await werkzeuge.click();
  await expect(sidebar.getByRole("link", { name: "Terminal" })).toBeVisible();
});
