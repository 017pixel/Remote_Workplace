import { expect, test } from "@playwright/test";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/workbench`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

const e2eUser = process.env.WRAPT_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser } });

test("keeps a Wrapt terminal running while another device resumes it", async ({ browser }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  const authHeaders = { "tailscale-user-login": e2eUser };
  const firstContext = await browser.newContext({
    viewport: { width: 1_280, height: 800 },
    extraHTTPHeaders: authHeaders,
  });
  const firstPage = await firstContext.newPage();
  await firstPage.goto(`${workbench}/terminal`);
  // V2: Beim ersten Besuch öffnet der Empty-State das erste Terminal.
  const emptyButton = firstPage.locator(".terminal-empty-state button");
  if (await emptyButton.count() > 0 && await emptyButton.isVisible().catch(() => false)) await emptyButton.click();
  await expect(firstPage.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });

  const marker = `__MULTI_DEVICE_TERMINAL_${Date.now()}__`;
  const input = firstPage.locator(".xterm-helper-textarea");
  await input.fill("");
  await input.type(`printf '${marker}\\n'`);
  await input.press("Enter");
  await expect.poll(() => firstPage.locator(".xterm-rows").textContent()).toContain(marker);

  await firstPage.reload();
  await expect(firstPage.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => firstPage.locator(".xterm-rows").textContent()).toContain(marker);

  const secondContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: authHeaders,
  });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(`${workbench}/terminal`);
  await expect(secondPage.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => secondPage.locator(".xterm-rows").textContent()).toContain(marker);

  const measureTerminal = async (page: typeof firstPage) => page.locator(".terminal-session-pane.is-visible").evaluate((pane) => {
    const viewport = pane.querySelector<HTMLElement>(".terminal-viewport");
    const paneBox = pane.getBoundingClientRect();
    const viewportBox = viewport?.getBoundingClientRect();
    return {
      paneWidth: paneBox.width,
      paneHeight: paneBox.height,
      viewportWidth: viewportBox?.width ?? 0,
      viewportHeight: viewportBox?.height ?? 0,
      viewportBottom: viewportBox?.bottom ?? 0,
    };
  });
  const firstGeometry = await measureTerminal(firstPage);
  const secondGeometry = await measureTerminal(secondPage);
  expect(firstGeometry.paneWidth).toBeGreaterThan(0);
  expect(firstGeometry.viewportHeight).toBeGreaterThan(0);
  expect(secondGeometry.paneWidth).toBeGreaterThan(0);
  expect(secondGeometry.viewportHeight).toBeGreaterThan(0);
  expect(secondGeometry.viewportBottom).toBeLessThanOrEqual(844);

  await secondPage.evaluate(() => {
    document.documentElement.style.setProperty("--app-viewport-height", "420px");
    // Simuliert die verkleinerte Visual Viewport-Höhe eines geöffneten
    // Android-Keyboards. Der Wert darf nicht zusätzlich als Keybar-Abstand
    // in das Layout eingehen.
    document.documentElement.style.setProperty("--keyboard-inset", "424px");
  });
  await expect.poll(() => secondPage.locator(".terminal-keybar").evaluate((element) => {
    const shell = element.closest(".app-shell")?.getBoundingClientRect();
    const keybar = element.getBoundingClientRect();
    const viewport = element.closest(".terminal-area")?.querySelector<HTMLElement>(".terminal-viewport")?.getBoundingClientRect();
    return keybar.bottom <= (shell?.bottom ?? 0) + 1 && (viewport?.height ?? 0) > 100;
  })).toBe(true);
  const keyboardGeometry = await secondPage.locator(".terminal-keybar").evaluate((element) => {
    const shell = element.closest(".app-shell")?.getBoundingClientRect();
    const keybar = element.getBoundingClientRect();
    const viewport = element.closest(".terminal-area")?.querySelector<HTMLElement>(".terminal-viewport")?.getBoundingClientRect();
    return { shellBottom: shell?.bottom ?? 0, keybarBottom: keybar.bottom, viewportHeight: viewport?.height ?? 0 };
  });
  expect(keyboardGeometry.keybarBottom).toBeLessThanOrEqual(keyboardGeometry.shellBottom + 1);
  expect(keyboardGeometry.viewportHeight).toBeGreaterThan(100);

  const secondMarker = `__MULTI_DEVICE_INPUT_${Date.now()}__`;
  const secondInput = secondPage.locator(".xterm-helper-textarea");
  await secondInput.fill("");
  await secondInput.type(`printf '${secondMarker}\\n'`);
  await secondInput.press("Enter");
  await expect.poll(() => firstPage.locator(".xterm-rows").textContent()).toContain(secondMarker);

  await firstContext.close();
  await expect.poll(() => secondPage.locator(".xterm-rows").textContent()).toContain(marker);
  await secondContext.close();
});
