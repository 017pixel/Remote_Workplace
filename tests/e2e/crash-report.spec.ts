import { expect, test } from "@playwright/test";

// Der Crash-Report ist die letzte Verteidigungslinie: Wenn doch etwas schiefgeht, soll
// ein grosses Pop-Up erscheinen, dessen Inhalt man kopiert und einem KI-Agenten gibt.

test("zeigt bei einem unbehandelten Fehler einen kopierbaren Crash-Report", async ({ page }) => {
  await page.goto("/workbench/");
  await expect(page.locator(".sidebar-shell")).toBeVisible();

  // Ein echter unbehandelter Fehler — nicht über die interne API simuliert.
  await page.evaluate(() => {
    setTimeout(() => { throw new Error("Absichtlicher Testfehler fuer den Crash-Report"); }, 0);
  });

  const dialog = page.locator(".crash-backdrop");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Etwas ist abgestürzt" })).toBeVisible();

  const report = await dialog.locator(".crash-report").innerText();
  expect(report).toContain("Absichtlicher Testfehler");
  expect(report).toContain("# Crash-Report");
  // Die Arbeitsanweisung für den Agenten muss mitkopiert werden.
  expect(report).toContain("Auftrag an den KI-Agenten");
  // Umgebungsdaten helfen bei der Zuordnung. Ob das Backend im Moment des Berichts
  // antwortet, ist bewusst offen — läuft gerade ein Neustart, ist "nein" die richtige
  // Angabe und der Test soll daran nicht scheitern.
  expect(report).toMatch(/Backend erreichbar: (ja|nein)/);
  expect(report).toContain("Route: /workbench/");

  await expect(dialog.getByRole("button", { name: /Bericht kopieren/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Weiterarbeiten" }).click();
  await expect(dialog).toHaveCount(0);
});

// Diese Meldung ist laut Resize-Observer-Spezifikation harmlos und tritt im Orbit
// (@xyflow/react) beim Zoomen und Verschieben auf. Sie darf kein Pop-Up öffnen.
test("öffnet kein Pop-Up für harmlose ResizeObserver-Meldungen", async ({ page }) => {
  await page.goto("/workbench/");
  await expect(page.locator(".sidebar-shell")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", {
      message: "ResizeObserver loop completed with undelivered notifications.",
    }));
  });
  await page.waitForTimeout(300);
  await expect(page.locator(".crash-backdrop")).toHaveCount(0);

  // Ein echter Fehler danach muss weiterhin durchkommen — und die ignorierte
  // Meldung soll in seinem Verlauf auftauchen.
  await page.evaluate(() => {
    setTimeout(() => { throw new Error("Echter Fehler nach harmloser Meldung"); }, 0);
  });
  const dialog = page.locator(".crash-backdrop");
  await expect(dialog).toBeVisible();
  const report = await dialog.locator(".crash-report").innerText();
  expect(report).toContain("Echter Fehler nach harmloser Meldung");
  expect(report).toContain("Ignoriert (harmlos): ResizeObserver");
});

test("überlebt einen Renderfehler in einer Ansicht, ohne die Navigation zu verlieren", async ({ page }) => {
  await page.goto("/workbench/");
  await expect(page.locator(".sidebar-shell")).toBeVisible();

  await page.evaluate(() => {
    void Promise.reject(new Error("Abgelehntes Promise ohne catch"));
  });

  await expect(page.locator(".crash-backdrop")).toBeVisible();
  // Entscheidend: die Sidebar steht noch, die App ist nicht weiss.
  await expect(page.locator(".sidebar-shell")).toBeVisible();
});
