import { expect, test } from "@playwright/test";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/workbench`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("verwaltet Extensions über den lokalen Catalog: installieren, berechtigen, deaktivieren, deinstallieren", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/settings`);

  const extensionsCard = page.locator(".page-frame").getByRole("heading", { name: "Extensions" });
  await expect(extensionsCard).toBeVisible();

  // Retries teilen sich den Testserver: Eine vom ersten Lauf installierte
  // Extension wird vorab entfernt, damit der Ablauf immer frisch startet.
  await page.getByRole("button", { name: /Installiert/ }).click();
  const leftoverRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  if (await leftoverRow.count()) {
    await leftoverRow.getByRole("button", { name: /Deinstallieren/ }).click();
    await page.getByRole("dialog", { name: /deinstallieren/ }).getByRole("button", { name: "Deinstallieren" }).click();
    await expect(leftoverRow).not.toBeVisible();
  }
  await page.getByRole("button", { name: /Entdecken/ }).click();

  // Der Catalog enthält die Demo-Fixture; die Extension ist noch nicht installiert.
  const demoRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  await expect(demoRow).toBeVisible();
  await expect(demoRow.getByRole("button", { name: /Installieren/ })).toBeVisible();

  // Installation fordert die Permission an — der Review-Dialog erscheint.
  await demoRow.getByRole("button", { name: /Installieren/ }).click();
  const reviewDialog = page.getByRole("dialog", { name: /Berechtigungen für Demo Uhr/ });
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog).toContainText("Benachrichtigungen senden");

  // Freigabe aktiviert die Extension.
  await reviewDialog.getByRole("button", { name: "Alle freigeben" }).click();
  await expect(reviewDialog).not.toBeVisible();
  await expect(page.locator(".extension-row", { hasText: "Demo Uhr" }).getByText("Aktiv")).toBeVisible();

  // Der Installierte-Tab zeigt die Extension mit aktivem Zustand.
  await page.getByRole("button", { name: /Installiert/ }).click();
  const installedRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  await expect(installedRow.getByText("Aktiv")).toBeVisible();

  // Deaktivieren und wieder aktivieren über den Umschalter.
  await installedRow.getByRole("switch", { name: /Deaktivieren: Demo Uhr/ }).click();
  await expect(installedRow.getByText("Deaktiviert")).toBeVisible();
  await installedRow.getByRole("switch", { name: /Aktivieren: Demo Uhr/ }).click();
  await expect(installedRow.getByText("Aktiv")).toBeVisible();

  // Deinstallieren mit Bestätigung entfernt die Extension aus der Registry.
  await installedRow.getByRole("button", { name: /Deinstallieren/ }).click();
  const confirmDialog = page.getByRole("dialog", { name: /deinstallieren/ });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Deinstallieren" }).click();
  await expect(page.locator(".extension-row", { hasText: "Demo Uhr" })).not.toBeVisible();
  await expect(page.getByText(/Noch keine Extensions installiert/)).toBeVisible();
});
