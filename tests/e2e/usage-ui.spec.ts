import { expect, test } from "@playwright/test";
import { hasPrivateWorkbench, privateWorkbenchReason, workbenchUrl } from "./helpers/environment";

// Braucht echte Nutzungsdaten und verbundene Accounts (CodexBar, Profile).
test.skip(() => !hasPrivateWorkbench, privateWorkbenchReason);

const workbench = workbenchUrl;

test("renders usage analytics, charts and account discovery", async ({page}) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${workbench}/usage`);
  await expect(page.getByRole("heading", {name:"Nutzung und Limits"})).toBeVisible();
  await expect(page.getByText("Tokens heute")).toBeVisible({timeout:20_000});
  await expect(page.getByRole("heading", {name:"Claude Code"})).toBeVisible();
  const codex = page.locator(".usage-provider").filter({has:page.getByRole("heading", {name:"Codex"})});
  await expect(codex.locator(".usage-provider-kicker")).toHaveText("Aktuell");
  await expect(codex.locator(".usage-alert")).toHaveCount(0);
  const resetCredits = page.locator(".usage-forecast").filter({has:page.getByRole("heading", {name:"Reset-Guthaben"})});
  await expect(resetCredits.getByText(/\d+ verfügbar/)).toBeVisible();
  await page.getByRole("button", {name:"Verlauf"}).click();
  await expect(page.getByRole("img", {name:"Tokenverbrauch nach Tag"})).toBeVisible();
  await page.getByRole("button", {name:"Projekte & Modelle"}).click();
  await expect(page.getByRole("heading", {name:"Projekte"})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Modelle"})).toBeVisible();
  await page.getByRole("button", {name:"Accounts"}).click();
  await expect(page.getByRole("heading", {name:"Account verbinden"})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Profile und Verwaltung"})).toBeVisible();
  await expect(page.getByRole("option", {name:"Claude Code"})).toBeAttached();
  const firstProfile = page.locator(".managed-account").first();
  await expect(firstProfile).toBeVisible();
  await expect(firstProfile.locator("code")).not.toBeEmpty();
  await expect(page.getByRole("button", {name:"Mit Gerätecode anmelden"})).toBeVisible();
  await expect(page.getByRole("button", {name:"Entfernen"}).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("keeps usage controls usable on mobile", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${workbench}/usage`);
  await expect(page.getByRole("heading", {name:"Nutzung und Limits"})).toBeVisible();
  const pageWidth = await page.locator(".usage-page").evaluate((element) => ({scroll:element.scrollWidth,client:element.clientWidth}));
  expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client);
  await page.getByRole("button", {name:"Accounts"}).click();
  await expect(page.getByRole("button", {name:"Mit Gerätecode anmelden"})).toBeVisible();
  const accountManagerWidth = await page.locator(".account-manager").evaluate((element) => ({scroll:element.scrollWidth,client:element.clientWidth}));
  expect(accountManagerWidth.scroll).toBeLessThanOrEqual(accountManagerWidth.client);
});

test("starts Codex with the remote device login flow", async ({page, browserName}) => {
  test.skip(browserName !== "chromium", "The PTY command only needs one production browser verification.");
  test.skip(workbench.startsWith("http://127.0.0.1"), "The production PTY requires the Tailscale user identity.");
  await page.goto(`${workbench}/usage`);
  await page.getByRole("button", {name:"Accounts"}).click();
  const workAccount = page.locator(".managed-account").filter({hasText:"work@example.com"});
  await workAccount.getByRole("button", {name:"Geräte-Anmeldung"}).click();
  const dialog = page.getByRole("dialog", {name:"work@example.com anmelden"});
  await expect(dialog).toContainText("keinen localhost-Rückruf");
  await expect(dialog.locator(".xterm-rows")).toContainText(/device|Gerät|Code/i, {timeout:15_000});
  await dialog.locator(".xterm-helper-textarea").press("Control+C");
  await dialog.getByRole("button", {name:"Anmeldung schließen"}).click();
  await expect(dialog).toBeHidden();
});

test("removes a registered account from the unified account list", async ({page}) => {
  const accountId = "10000000-0000-4000-8000-000000000001";
  let removed = false;
  const account = {id:accountId,provider:"codex",label:"Test Account",email:null,profilePath:"/home/user/.codex-test",source:"local",enabled:true,createdAt:"2026-07-16T16:00:00.000Z",updatedAt:"2026-07-16T16:00:00.000Z"};
  await page.route("**/api/v1/accounts", async (route) => route.fulfill({json:{accounts:removed?[]:[account]}}));
  await page.route("**/api/v1/accounts/discover", async (route) => route.fulfill({json:{accounts:removed?[]:[{accountId,provider:"codex",label:"Test Account",profilePath:"/home/user/.codex-test",registered:true,authenticated:true,enabled:true,source:"local"}]}}));
  await page.route(`**/api/v1/accounts/${accountId}`, async (route) => {removed=true;await route.fulfill({status:204});});
  await page.goto(`${workbench}/usage`);
  await page.getByRole("button", {name:"Accounts"}).click();
  const card = page.locator(".managed-account").filter({hasText:"Test Account"});
  await card.getByRole("button", {name:"Entfernen"}).click();
  await page.getByRole("dialog", {name:"Account entfernen?"}).getByRole("button", {name:"Account entfernen"}).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("status")).toContainText("wurde aus Workbench und CodexBar entfernt");
  expect(removed).toBe(true);
});
