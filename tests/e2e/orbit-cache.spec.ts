import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";

const workbench = process.env.WORKBENCH_E2E_URL;

test("keeps Orbit revisions out of the PWA cache and recovers one stale save", async ({ page }) => {
  test.setTimeout(45_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated production-build server.");

  await page.goto(`${workbench}/workbench/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("workbench-v7"))).toBe(true);

  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const currentResponse = await page.request.get(orbitUrl, { headers: apiIdentityHeaders("user@example.com") });
  await expect(currentResponse).toBeOK();
  expect(currentResponse.headers()["cache-control"]).toBe("no-store");
  const current = await currentResponse.json();

  const externalSave = await page.request.put(orbitUrl, {
    data: { document: current.document, expectedRevision: current.revision },
    headers: apiIdentityHeaders("user@example.com"),
  });
  await expect(externalSave).toBeOK();
  const external = await externalSave.json();

  const revisionFromControlledPage = await page.evaluate(async () => {
    const response = await fetch("/api/v1/orbit", { cache: "force-cache" });
    return Number((await response.json()).revision);
  });
  expect(revisionFromControlledPage).toBe(external.revision);

  const putStatuses: number[] = [];
  page.on("response", (response) => {
    if (response.request().method() === "PUT" && new URL(response.url()).pathname === "/api/v1/orbit") putStatuses.push(response.status());
  });
  await page.getByRole("button", { name: "Notiz hinzufügen" }).click();
  await expect(page.getByRole("button", { name: "Auf Server gespeichert" })).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => Number((await (await page.request.get(orbitUrl, { headers: apiIdentityHeaders("user@example.com") })).json()).revision), { timeout: 15_000 }).toBeGreaterThan(external.revision);
  expect(putStatuses.filter((status) => status === 409).length).toBeLessThanOrEqual(1);
  expect(putStatuses.at(-1)).toBe(200);

  const settledRequestCount = putStatuses.length;
  await page.waitForTimeout(2_000);
  expect(putStatuses).toHaveLength(settledRequestCount);
});
