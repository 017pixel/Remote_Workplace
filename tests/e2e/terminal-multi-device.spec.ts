import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;

test("keeps a Workbench terminal running while another device resumes it", async ({ browser }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  const firstContext = await browser.newContext({ viewport: { width: 1_280, height: 800 } });
  const firstPage = await firstContext.newPage();
  await firstPage.goto(`${workbench}/terminal`);
  await expect(firstPage.locator(".terminal-state.is-connected")).toBeVisible({ timeout: 20_000 });

  const marker = `__MULTI_DEVICE_TERMINAL_${Date.now()}__`;
  const input = firstPage.locator(".xterm-helper-textarea");
  await input.fill("");
  await input.type(`printf '${marker}\\n'; sleep 30`);
  await input.press("Enter");
  await expect.poll(() => firstPage.locator(".xterm-rows").textContent()).toContain(marker);

  await firstPage.reload();
  await expect(firstPage.locator(".terminal-state.is-connected")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => firstPage.locator(".xterm-rows").textContent()).toContain(marker);

  await firstContext.close();

  const secondContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const secondPage = await secondContext.newPage();
  await secondPage.goto(`${workbench}/terminal`);
  await expect(secondPage.locator(".terminal-state.is-connected")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => secondPage.locator(".xterm-rows").textContent()).toContain(marker);
  await secondPage.locator(".terminal-area").getByRole("button", { name: "Terminal schließen", exact: true }).click();
  await secondContext.close();
});
