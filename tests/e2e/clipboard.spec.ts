import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL?.replace(/\/$/, "");

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  permissions: ["clipboard-read", "clipboard-write"],
});

// Firefox kennt `clipboard-read` nicht: Schon das Anlegen des Kontexts scheitert, bevor
// ein Test laufen kann. Der Ausschluss muss deshalb hier auf Dateiebene stehen und nicht
// erst im Testrumpf — dort wären die Fixtures längst erzeugt.
// Die Zwischenablage bleibt für Firefox in der manuellen Matrix.
test.skip(({ browserName }) => browserName !== "chromium", "Zwischenablage-Automatisierung wird in Chromium geprüft.");

test("copies the current terminal selection and pastes plain text instead of stale URLs", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/terminal`);
  await expect(page.locator(".terminal-state.is-connected")).toBeVisible({ timeout: 20_000 });
  const input = page.locator(".xterm-helper-textarea");
  const marker = `__CLIPBOARD_COPY_${Date.now()}__`;
  await input.press("Control+L");
  await input.type(`printf '${marker}\\n'`);
  await input.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText(marker, { timeout: 10_000 });

  await page.evaluate(() => navigator.clipboard.writeText("http://127.0.0.1:5173/workbench/"));
  const screen = page.locator(".xterm-screen");
  const box = await screen.boundingBox();
  const cursorTop = await input.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top || "0"));
  expect(box).not.toBeNull();
  const rowY = box!.y + Math.max(6, cursorTop - 7);
  await page.mouse.move(box!.x + 8, rowY);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 8, rowY, { steps: 10 });
  await page.mouse.up();
  await input.press("Control+Shift+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(marker);

  const pasteMarker = `__CLIPBOARD_PASTE_${Date.now()}__`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), pasteMarker);
  await input.press("Control+Shift+V");
  await input.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText(pasteMarker, { timeout: 10_000 });
});

test("keeps VS Code clipboard events inside the same-origin editor frame", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/code-editor`);
  const frameElement = page.locator('iframe[title="Editor"]');
  await expect(frameElement).toBeVisible({ timeout: 20_000 });
  expect(await frameElement.getAttribute("allow")).toBeNull();
  const editor = page.frameLocator('iframe[title="Editor"]');
  await expect(editor.locator(".monaco-workbench")).toBeVisible({ timeout: 30_000 });
  await editor.locator("body").press("Control+N");
  const activeEditor = editor.locator(".editor-instance").last();
  const marker = `__VSCODE_CLIPBOARD_${Date.now()}__`;
  await activeEditor.locator(".view-lines").pressSequentially(marker);
  await activeEditor.locator(".view-lines").press("Control+A");
  await activeEditor.locator(".view-lines").press("Control+C");
  await editor.locator("body").press("Control+N");
  const targetEditor = editor.locator(".editor-instance").last();
  await targetEditor.locator(".view-lines").press("Control+V");
  await expect(targetEditor.locator(".view-lines")).toContainText(marker);
});

test("does not grant embedded T3 Code or previews extra clipboard permissions", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/t3-code`);
  const frame = page.locator('iframe[title="T3 Code"]');
  await expect(frame).toBeVisible({ timeout: 20_000 });
  expect(await frame.getAttribute("allow")).toBeNull();
  await frame.click({ position: { x: 20, y: 20 } });
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("title"))).toBe("T3 Code");
});

test("routes Orbit paste to the focused editor, canvas or terminal only", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await page.getByRole("button", { name: /Neue Notiz/ }).click();
  const note = page.getByLabel("Neue Notiz bearbeiten").last();
  await note.fill("Vorhanden: ");
  const noteMarker = `NOTIZ_${Date.now()}`;
  await page.evaluate((text) => navigator.clipboard.writeText(text), noteMarker);
  await note.press("Control+V");
  await expect(note).toHaveValue(`Vorhanden: ${noteMarker}`);

  const nodesBeforeCanvasPaste = await page.locator(".react-flow__node-orbit").count();
  const canvasMarker = `CANVAS_${Date.now()}`;
  await page.evaluate((text) => navigator.clipboard.writeText(text), canvasMarker);
  await page.locator(".react-flow__pane").click({ position: { x: 500, y: 300 } });
  await page.keyboard.press("Control+V");
  await expect(page.getByLabel("Eingefügter Text bearbeiten").last()).toHaveValue(canvasMarker);
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodesBeforeCanvasPaste + 1);

  await page.locator(".orbit-palette-item").filter({ hasText: /^Terminalziehen$/ }).click();
  const terminal = page.locator('.orbit-live-node [data-panel-type="terminal"]').last();
  await expect(terminal.locator(".terminal-state.is-connected")).toBeVisible({ timeout: 20_000 });
  const nodesBeforeTerminalPaste = await page.locator(".react-flow__node-orbit").count();
  const terminalMarker = `__ORBIT_TERMINAL_${Date.now()}__`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), terminalMarker);
  await terminal.locator(".xterm-helper-textarea").press("Control+Shift+V");
  await terminal.locator(".xterm-helper-textarea").press("Enter");
  await expect(terminal.locator(".xterm-screen")).toContainText(terminalMarker, { timeout: 10_000 });
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodesBeforeTerminalPaste);
});
