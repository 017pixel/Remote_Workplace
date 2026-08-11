import { expect, test } from "@playwright/test";

const e2eUser = process.env.WORKBENCH_E2E_USER ?? "user@example.com";
test.use({ extraHTTPHeaders: { "tailscale-user-login": e2eUser }, viewport: { width: 390, height: 844 }, hasTouch: true });

test("ordnet Hermes mobil ohne Überlagerung und mit erreichbarer Navigation an", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("remote-workplace.hermes.v1"));
  await page.goto("/workbench/hermes-agent");
  const shell = page.locator(".hermes-shell");
  const nav = shell.getByRole("navigation", { name: "Hermes-Bereiche" });
  const buttons = nav.getByRole("button");
  await expect(shell).toBeVisible();
  await expect(buttons).toHaveCount(5);
  await expect(shell.getByRole("button", { name: "Sessionliste öffnen" })).toBeVisible();
  await expect(shell.locator(".hermes-session-sidebar")).toHaveCount(0);

  const boxes = await buttons.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
  }));
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index]!.left).toBeGreaterThanOrEqual(boxes[index - 1]!.right - 1);
  }

  const shellBox = await shell.boundingBox();
  const navBox = await nav.boundingBox();
  expect((navBox?.y ?? 0) + (navBox?.height ?? 0)).toBeGreaterThanOrEqual((shellBox?.y ?? 0) + (shellBox?.height ?? 0) - 1);
  const overflow = await shell.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
