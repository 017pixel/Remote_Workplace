import { expect, test, type Page } from "@playwright/test";

// Der Kanalwechsel darf NUR gespeichert werden — angewendet wird er über den bestehenden
// Neustart-Flow. Die Antworten sind hier gestellt, damit der Test nicht den echten Kanal
// des laufenden Systems umstellt.

const channelEndpoint = "**/api/v1/system/t3-channel";

interface ChannelStatus {
  configuredChannel: "stable" | "nightly";
  activeChannel: "stable" | "nightly" | null;
  activeVersion: string | null;
  installed: boolean;
  reachable: boolean;
  restartRequired: boolean;
  serviceUnit: string;
  port: number;
  checkedAt: string;
}

function status(overrides: Partial<ChannelStatus> = {}): ChannelStatus {
  return {
    configuredChannel: "stable",
    activeChannel: "stable",
    activeVersion: "0.0.28",
    installed: true,
    reachable: true,
    restartRequired: false,
    serviceUnit: "t3-code.service",
    port: 3773,
    checkedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Stellt GET (Status) und POST (Speichern) und merkt sich die gesendeten Kanäle. */
async function stubChannelApi(page: Page, initial: ChannelStatus, saved: string[]) {
  let current = initial;
  await page.route(channelEndpoint, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { channel: "stable" | "nightly" };
      saved.push(body.channel);
      current = status({
        ...current,
        configuredChannel: body.channel,
        restartRequired: current.activeChannel !== body.channel,
      });
    }
    await route.fulfill({ json: current });
  });
  // Die App wird unter dem Prefix /workbench/ ausgeliefert (siehe app.ts).
  await page.goto("/workbench/settings");
}

test("zeigt aktiven Kanal und Version ohne Neustart-Hinweis", async ({ page }) => {
  await stubChannelApi(page, status(), []);

  const card = page.locator("section.document-section").filter({ hasText: "T3 Code Kanal" });
  await expect(card.getByText("Stable · v0.0.28")).toBeVisible();
  await expect(card.getByRole("radio", { name: /Stable/ })).toHaveAttribute("aria-checked", "true");
  await expect(card.getByText("Neustart erforderlich")).toBeHidden();
});

test("speichert Nightly, startet aber nichts neu und verweist auf die Neustart-Buttons", async ({ page }) => {
  const saved: string[] = [];
  await stubChannelApi(page, status(), saved);

  const card = page.locator("section.document-section").filter({ hasText: "T3 Code Kanal" });
  await card.getByRole("radio", { name: /Nightly/ }).click();

  expect(saved).toEqual(["nightly"]);
  await expect(card.getByText("Neustart erforderlich")).toBeVisible();
  // Aktiv bleibt Stable: Der Wechsel passiert erst beim nächsten Neustart.
  await expect(card.getByText("Stable · v0.0.28")).toBeVisible();

  await card.getByRole("button", { name: "Zu den Neustart-Buttons" }).click();
  const restartCard = page.locator("#restart-controls");
  await expect(restartCard).toHaveClass(/is-active/);
  await expect(restartCard.getByTitle("Server neu bauen & neu starten")).toBeInViewport();
});

test("meldet eine fehlende Installation, lässt den Umschalter aber nutzbar", async ({ page }) => {
  const saved: string[] = [];
  await stubChannelApi(
    page,
    status({ activeChannel: null, activeVersion: null, installed: false, reachable: false, restartRequired: true }),
    saved,
  );

  const card = page.locator("section.document-section").filter({ hasText: "T3 Code Kanal" });
  await expect(card.getByText("nicht installiert")).toBeVisible();
  await expect(card.getByText("nicht erreichbar")).toBeVisible();
  await expect(card.getByText("Neustart erforderlich")).toBeVisible();

  await card.getByRole("radio", { name: /Nightly/ }).click();
  expect(saved).toEqual(["nightly"]);
});
