import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const workbench = (process.env.WORKBENCH_E2E_URL ?? "http://127.0.0.1:3010/workbench").replace(/\/$/, "");
const origin = new URL(workbench).origin;

test.describe("T3-Performance", () => {
  test.skip(process.env.WORKBENCH_T3_E2E !== "true", "Setze WORKBENCH_T3_E2E=true für den Test gegen die laufende T3-Instanz.");
  test.use({
    extraHTTPHeaders: { "tailscale-user-login": "aistudioaccprgrm@gmail.com" },
    viewport: { width: 1440, height: 960 },
  });

  test("behält T3 beim Wechsel durch alle Hauptseiten montiert", async ({ page }) => {
    test.setTimeout(120_000);
    const pairing = JSON.parse(execFileSync("t3", [
      "auth", "pairing", "create", "--base-dir", "/home/bbecker/.t3", "--ttl", "10m", "--label", "e2e-performance", "--json",
    ], { encoding: "utf8" })) as { credential?: unknown };
    expect(typeof pairing.credential).toBe("string");

    const failingT3Requests: string[] = [];
    const authErrors: string[] = [];
    const t3DocumentRequests: string[] = [];
    let standaloneT3FrameObject: import("@playwright/test").Frame | null = null;
    let currentRoute = "initial";
    page.on("request", (request) => {
      if (request.resourceType() !== "document") return;
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith("/t3") && (!standaloneT3FrameObject || request.frame() === standaloneT3FrameObject)) {
        t3DocumentRequests.push(`${currentRoute}: ${request.url()}`);
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      const pathname = new URL(url).pathname;
      if (response.status() >= 400 && (pathname.startsWith("/api/orchestration/") || pathname === "/ws")) failingT3Requests.push(`${response.status()} ${url}`);
    });
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("WebSocket connection to 'ws://127.0.0.1:3010/ws' failed")) authErrors.push(message.text());
    });

    await page.goto(`${origin}/t3/pair#token=${encodeURIComponent(String(pairing.credential))}`);
    await expect(page.getByTestId("sidebar-add-project-trigger")).toBeVisible({ timeout: 15_000 });
    const ticketResponse = await page.request.post(`${origin}/api/auth/websocket-ticket`);
    expect(ticketResponse.ok()).toBe(true);
    await page.evaluate(() => localStorage.clear());

    await page.goto(`${workbench}/`);
    await page.evaluate(() => {
      const sample = { longTasks: [] as number[] };
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) sample.longTasks.push(entry.duration);
      });
      observer.observe({ type: "longtask" });
      (window as unknown as { __t3Performance?: { sample: typeof sample; observer: PerformanceObserver } }).__t3Performance = { sample, observer };
    });
    const startedAt = Date.now();
    await page.getByRole("link", { name: "T3 Code", exact: true }).click();
    await expect(page).toHaveURL(/\/workbench\/t3-code$/);
    const standaloneT3Frame = '.tool-surface-standalone iframe[title="T3 Code"]';
    const frame = page.frameLocator(standaloneT3Frame);
    await expect(frame.getByText("Projects", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByRole("button", { name: "Change project", exact: true })).toBeVisible({ timeout: 15_000 });
    standaloneT3FrameObject = await page.locator(standaloneT3Frame).contentFrame();
    expect(standaloneT3FrameObject).not.toBeNull();
    await page.locator(standaloneT3Frame).click({ button: "right", position: { x: 120, y: 120 } });

    // Pairing und das erste Öffnen gehören nicht zum Wechseltest. Ab hier
    // darf kein neues T3-Dokument mehr angefordert werden.
    t3DocumentRequests.length = 0;
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>('.tool-surface-standalone iframe[title="T3 Code"]');
      (window as Window & { __t3IframeElement?: HTMLIFrameElement }).__t3IframeElement = frame ?? undefined;
    });

    const routes = [
      ["Inbox", "/workbench/inbox"],
      ["Workbench", "/workbench/workbench"],
      ["Tech TLDRs", "/workbench/tech-tldrs"],
      ["Projekte", "/workbench/projects"],
      ["Dateien", "/workbench/files"],
      ["KI-Skills", "/workbench/ki-skills"],
      ["Hermes Agent", "/workbench/hermes-agent"],
      ["Code-Server", "/workbench/code-editor"],
      ["Previews", "/workbench/previews"],
      ["Browser", "/workbench/browser"],
      ["Terminal", "/workbench/terminal"],
      ["OpenCode", "/workbench/opencode"],
      ["Codex", "/workbench/codex"],
      ["Claude Code", "/workbench/claude"],
      ["Nutzung", "/workbench/usage"],
      ["Einstellungen", "/workbench/settings"],
    ] as const;
    const returnToT3 = async () => {
      const t3Link = page.getByRole("link", { name: "T3 Code", exact: true });
      if (await t3Link.count() > 0) {
        await t3Link.click();
        return;
      }
      // Die Workbench-Route zeigt im Sidebar-Bereich die Orbit-Palette statt
      // der Standalone-Links. Über das Dashboard bleibt der Wechsel trotzdem
      // clientseitig und der Routenspeicher wird weiter geprüft.
      await page.getByRole("link", { name: "Dashboard", exact: true }).click();
      await page.getByRole("link", { name: "T3 Code", exact: true }).click();
    };
    for (const [label, path] of routes) {
      currentRoute = label;
      const routeLink = page.getByRole("link", { name: label, exact: true });
      if (await routeLink.count() > 0) {
        await routeLink.click();
      } else {
        await page.evaluate((nextPath) => {
          window.history.pushState({}, "", nextPath);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, path);
      }
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`));
      const warmReturnStartedAt = Date.now();
      await returnToT3();
      await expect(page).toHaveURL(/\/workbench\/t3-code$/);
      await expect(page.locator(standaloneT3Frame)).toBeVisible();
      expect(Date.now() - warmReturnStartedAt).toBeLessThan(10_000);
      expect(await page.evaluate(() => {
        const current = document.querySelector<HTMLIFrameElement>('.tool-surface-standalone iframe[title="T3 Code"]');
        return (window as Window & { __t3IframeElement?: HTMLIFrameElement }).__t3IframeElement === current;
      })).toBe(true);
    }

    const performance = await page.evaluate(() => {
      const state = (window as unknown as { __t3Performance?: { sample: { longTasks: number[] }; observer: PerformanceObserver } }).__t3Performance;
      state?.observer.disconnect();
      return { longTaskMax: Math.max(0, ...(state?.sample.longTasks ?? [])) };
    });
    expect(Date.now() - startedAt).toBeLessThan(45_000);
    expect(performance.longTaskMax).toBeLessThan(1_000);
    expect(t3DocumentRequests, `Unerwartete T3-Dokumentanforderungen:\n${t3DocumentRequests.join("\n")}`).toHaveLength(0);
    expect(failingT3Requests.length).toBeLessThanOrEqual(1);
    expect(new Set(failingT3Requests).size).toBe(failingT3Requests.length);
    expect(authErrors).toEqual([]);
  });
});
