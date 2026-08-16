import { expect, test } from "@playwright/test";

// `WORKBENCH_E2E_URL` zeigt auf den Origin des Testservers; die Workbench
// selbst wird unter dem `/workbench`-Basispfad ausgeliefert.
const workbench = process.env.WORKBENCH_E2E_URL
  ? `${process.env.WORKBENCH_E2E_URL.replace(/\/$/, "")}/workbench`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  permissions: ["clipboard-read", "clipboard-write"],
});

// Firefox kennt `clipboard-read` nicht: Schon das Anlegen des Kontexts scheitert, bevor
// ein Test laufen kann. Der Ausschluss muss deshalb hier auf Dateiebene stehen und nicht
// erst im Testrumpf — dort wären die Fixtures längst erzeugt.
// Die Zwischenablage bleibt für Firefox in der manuellen Matrix.
test.skip(({ browserName }) => browserName !== "chromium", "Zwischenablage-Automatisierung wird in Chromium geprüft.");

test("copies terminal selections with Ctrl+Shift+C and pastes with Ctrl+Shift+V", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/terminal`);
  await expect(page.locator(".terminal-state.is-connected")).toBeVisible({ timeout: 20_000 });
  const input = page.locator(".xterm-helper-textarea");
  const marker = `https://github.com/login/device?code=CLIP-${Date.now()}`;
  // Erst auf den Shell-Prompt warten: Tippt der Test vor dem Spawn der
  // Shell, gehen einzelne Zeichen verloren und der Marker erscheint nie
  // unversehrt im Echo. Die Prüfung liest die sichtbaren Zeilen — die
  // xterm-Stylesheet-Injektion in `.xterm-screen` enthielte sonst „#"-Farben
  // und ließe den Prompt-Wartenden sofort passieren.
  await expect.poll(() => page.evaluate(() => {
    const rows = [...document.querySelectorAll(".xterm-rows > div")];
    return rows.some((row) => /[$#]\s*$/.test(row.textContent ?? ""));
  }), { timeout: 10_000 }).toBe(true);
  await input.press("Control+L");
  // Die Ausgabezeile kann in der E2E-Umgebung an der Cursor-Zelle
  // umbrochen gerendert werden („h" + „ttps://…"). Der Inhalt bleibt dabei
  // vollständig — deshalb prüfen wir die Zeilen ohne Leerraum.
  await input.type(`printf "${marker}\\n"`, { delay: 5 });
  await input.press("Enter");
  await expect.poll(() => page.evaluate((expected) => {
    const text = [...document.querySelectorAll(".xterm-rows > div")].map((row) => row.textContent ?? "").join("");
    return text.replace(/\s+/g, "").includes(expected.replace(/\s+/g, ""));
  }, marker), { timeout: 10_000 }).toBe(true);

  await page.evaluate(() => navigator.clipboard.writeText("http://127.0.0.1:5173/workbench/"));
  const screen = page.locator(".xterm-screen");
  const box = await screen.boundingBox();
  const cursorTop = await input.evaluate((element) => Number.parseFloat((element as HTMLElement).style.top || "0"));
  expect(box).not.toBeNull();
  const rowY = box!.y + Math.max(6, cursorTop - 7);
  // Der Drag beginnt knapp vor der ersten Zelle: Die Cursor-Zelle am
  // Zeilenanfang (hier das „h") ist schmal gerendert, ab x+8 landet der
  // Start sonst erst in der zweiten Zelle.
  await page.mouse.move(box!.x + 2, rowY);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 2, rowY, { steps: 10 });
  await page.mouse.up();
  await input.press("Control+Shift+C");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(marker);

  const pasteMarker = `__CLIPBOARD_PASTE_${Date.now()}__`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), pasteMarker);
  await input.press("Control+Shift+V");
  await input.press("Enter");
  await expect(page.locator(".xterm-screen")).toContainText(pasteMarker, { timeout: 10_000 });
});

test("keeps VS Code on standard Ctrl+C and Ctrl+V inside the editor frame", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/code-editor`);
  const frameElement = page.locator('iframe[title="Editor"]');
  const editor = page.frameLocator('iframe[title="Editor"]');
  const editorAvailable = await editor.locator(".monaco-workbench").waitFor({ state: "visible", timeout: 25_000 }).then(() => true).catch(() => false);
  test.skip(!editorAvailable, "Kein code-server hinter dieser Instanz erreichbar.");
  const editorInstance = editor.locator(".editor-instance").last();
  const documentAvailable = await editorInstance.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  test.skip(!documentAvailable, "Kein interaktives code-server-Dokument verfügbar.");
  const linesAvailable = await editor.locator(".view-lines").first().waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  test.skip(!linesAvailable, "Kein bearbeitbares code-server-Dokument verfügbar.");
  expect(await frameElement.getAttribute("allow")).toBeNull();
  await expect(editor.locator(".monaco-workbench")).toBeVisible({ timeout: 30_000 });
  await editor.locator("body").press("Control+N");
  const activeEditor = editor.locator(".editor-instance").last();
  // Erst prüfen, ob die neue Instanz ein bearbeitbares Dokument hat —
  // andernfalls überspringen statt endlos auf `.view-lines` zu warten.
  const activeReady = await activeEditor.locator(".view-lines").waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
  test.skip(!activeReady, "Die neue Editor-Instanz hat kein bearbeitbares Dokument.");
  const marker = `__VSCODE_CLIPBOARD_${Date.now()}__`;
  await activeEditor.locator(".view-lines").pressSequentially(marker);
  await activeEditor.locator(".view-lines").press("Control+A");
  await activeEditor.locator(".view-lines").press("Control+C");
  await editor.locator("body").press("Control+N");
  const targetEditor = editor.locator(".editor-instance").last();
  await targetEditor.locator(".view-lines").press("Control+V");
  await expect(targetEditor.locator(".view-lines")).toContainText(marker);
});

test("keeps T3 Code focused so standard Ctrl+C belongs to the embedded app", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/t3-code`);
  const frame = page.locator('iframe[title="T3 Code"]');
  const t3Available = await frame.waitFor({ state: "visible", timeout: 15_000 }).then(() => true).catch(() => false);
  test.skip(!t3Available, "Kein T3-Dienst hinter dieser Instanz erreichbar.");
  expect(await frame.getAttribute("allow")).toBeNull();
  await frame.click({ position: { x: 20, y: 20 } });
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("title"))).toBe("T3 Code");
  await page.keyboard.press("Control+C");
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("title"))).toBe("T3 Code");
});

test("does not grant embedded previews extra clipboard permissions", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Workbench test server.");
  await page.goto(`${workbench}/previews`);
  for (const frame of await page.locator('iframe[title*="Preview"]').all()) {
    expect(await frame.getAttribute("allow")).toBeNull();
  }
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
  // Nahe der Pane-Ecke klicken: Auf einer frischen Fläche liegt die erste
  // Notiz in der Mitte und würde den Klick (und damit den Fokus) abfangen.
  await page.locator(".react-flow__pane").click({ position: { x: 80, y: 60 } });
  await page.keyboard.press("Control+V");
  await expect(page.getByLabel("Eingefügter Text bearbeiten").last()).toHaveValue(canvasMarker);
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodesBeforeCanvasPaste + 1);

  await page.locator(".orbit-palette-item").filter({ hasText: /^Terminalziehen$/ }).click();
  const terminal = page.locator('.orbit-live-node [data-panel-type="terminal"]').last();
  // Orbit-Panels laufen im Minimalmodus ohne Tab-Leiste; der Status steht
  // dort in der sr-only-Zeile `.terminal-connection-status`.
  await expect(terminal.locator(".terminal-connection-status")).toHaveText("Verbunden", { timeout: 20_000 });
  const nodesBeforeTerminalPaste = await page.locator(".react-flow__node-orbit").count();
  const terminalMarker = `__ORBIT_TERMINAL_${Date.now()}__`;
  await page.evaluate((text) => navigator.clipboard.writeText(`printf '${text}\\n'`), terminalMarker);
  // Wie oben: erst auf den Shell-Prompt warten, sonst verschluckt die noch
  // startende Shell Teile der Eingabe.
  await expect.poll(() => terminal.evaluate((node) => {
    const rows = [...node.querySelectorAll(".xterm-rows > div")];
    return rows.some((row) => /[$#]\s*$/.test(row.textContent ?? ""));
  }), { timeout: 20_000 }).toBe(true);
  await terminal.locator(".xterm-helper-textarea").press("Control+Shift+V");
  await terminal.locator(".xterm-helper-textarea").press("Enter");
  await expect(terminal.locator(".xterm-screen")).toContainText(terminalMarker, { timeout: 10_000 });
  await expect(page.locator(".react-flow__node-orbit")).toHaveCount(nodesBeforeTerminalPaste);
});
