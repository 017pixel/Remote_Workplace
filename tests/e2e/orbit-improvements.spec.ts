import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

function node(id: string, type: "project" | "note" | "todo" | "tool", title: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  return {
    id, type, title, position: { x, y }, size: type === "project" ? { width: 240, height: 170 } : type === "tool" ? { width: 620, height: 380 } : { width: 340, height: 220 },
    projectId: type === "project" ? "chappie" : null, parentId: null, runtimeId: type === "tool" ? `${id}-runtime` : null,
    toolType: type === "tool" ? "terminal" : null, previewId: null, provider: null, content: "", language: null, locked: false, zIndex: type === "project" ? 1 : 2,
    ...extra,
  };
}

test("covers precise canvas chrome, menus, zoom and editable routing", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Orbit test server.");
  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const current = await (await page.request.get(orbitUrl)).json();
  const boardId = `improvements-${Date.now()}`;
  const seed = await page.request.put(orbitUrl, { data: { expectedRevision: current.revision, document: {
    version: 4, activeBoardId: boardId, focusedNodeId: null, boards: [{
      id: boardId, name: "Verbesserungen", viewport: { x: 180, y: 170, zoom: .68 }, worldBounds: { minX: -1_600, minY: -1_000, maxX: 6_400, maxY: 1_400 },
      nodes: [
        node("project", "project", "Sample", -100, 0),
        node("note", "note", "Plan", 440, -120, { projectId: "chappie", content: "Test" }),
        node("terminal", "tool", "Terminal", 1_050, 180),
        node("offscreen-todo", "todo", "Bleibt geladen", 5_200, 0, { size: { width: 390, height: 300 } }),
      ],
      edges: [
        { id: "project-edge", source: "project", target: "note", kind: "project", label: "gehört zu" },
        { id: "manual-edge", source: "note", target: "terminal", kind: "manual", label: "besprechen" },
      ],
    }],
  } } });
  await expect(seed).toBeOK();

  await page.goto(`${workbench}/workbench`);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await expect(page.getByLabel("Gespeicherte Szene öffnen")).toHaveCount(0);
  await page.getByRole("button", { name: "Arbeitsfläche umbenennen" }).click();
  await page.getByLabel("Name der Arbeitsfläche").fill("Dauerhafte Werkzeuge");
  await page.getByRole("button", { name: "Arbeitsflächenname speichern" }).click();
  await expect(page.getByLabel("Arbeitsfläche auswählen").locator("option:checked")).toContainText("Dauerhafte Werkzeuge");
  const offscreenTodo = page.locator('.react-flow__node-orbit[data-id="offscreen-todo"]');
  await expect(offscreenTodo).toBeAttached();
  expect(await offscreenTodo.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.right < 0 || bounds.left > window.innerWidth || bounds.bottom < 0 || bounds.top > window.innerHeight;
  })).toBe(true);
  const offscreenDraft = offscreenTodo.getByLabel("Neue Aufgabe");
  await offscreenDraft.fill("Ungespeicherter Entwurf bleibt erhalten", { force: true });
  const noteNode = page.locator('.react-flow__node-orbit[data-id="note"]');
  await noteNode.locator(".orbit-node-header").click();
  const corner = noteNode.locator(".orbit-resize-corner.top.left");
  await expect(corner).toHaveCSS("width", "32px");
  await expect(corner).toHaveCSS("height", "32px");
  await expect(corner).toHaveCSS("top", "0px");
  await expect(corner).toHaveCSS("left", "0px");
  const [nodeBounds, dotBounds] = await Promise.all([noteNode.boundingBox(), corner.locator(".orbit-resize-dot").boundingBox()]);
  expect(Math.abs((dotBounds!.x + dotBounds!.width / 2) - nodeBounds!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs((dotBounds!.y + dotBounds!.height / 2) - nodeBounds!.y)).toBeLessThanOrEqual(1);

  const inspectorTrigger = page.getByRole("button", { name: "Eigenschaften öffnen" });
  const inspectorBox = await inspectorTrigger.boundingBox();
  expect(inspectorBox!.height).toBeGreaterThan(inspectorBox!.width * 2);

  await noteNode.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "Knotenaktionen" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Eigenschaften bearbeiten" })).toBeVisible();
  await page.keyboard.press("Escape");

  const projectCard = page.locator('.react-flow__node-orbit[data-id="project"] .orbit-project-node');
  const projectPath = page.locator('.react-flow__edge[data-id="project-edge"] .react-flow__edge-path');
  await expect(projectPath).toBeVisible();
  expect(await projectCard.evaluate((card) => {
    const path = document.querySelector('.react-flow__edge[data-id="project-edge"] .react-flow__edge-path');
    if (!path) return false;
    const color = getComputedStyle(card).getPropertyValue("--orbit-project-color").trim();
    const probe = document.createElement("span"); probe.style.color = color; document.body.append(probe);
    const normalized = getComputedStyle(probe).color; probe.remove();
    return normalized === getComputedStyle(path).stroke;
  })).toBe(true);

  const interactionPath = page.locator('.react-flow__edge[data-id="manual-edge"] .react-flow__edge-interaction');
  const edgePoint = await interactionPath.evaluate((path) => {
    const svgPath = path as SVGPathElement;
    const point = svgPath.getPointAtLength(svgPath.getTotalLength() / 2);
    const transformed = new DOMPoint(point.x, point.y).matrixTransform(svgPath.getScreenCTM() ?? new DOMMatrix());
    return { x: transformed.x, y: transformed.y };
  });
  await interactionPath.dispatchEvent("click", { clientX: edgePoint.x, clientY: edgePoint.y, bubbles: true });
  expect(await page.locator(".orbit-edge-waypoint").count()).toBeGreaterThan(3);
  await page.getByRole("button", { name: /Bearbeiten/ }).click();
  await page.getByLabel("Verbindungstext").fill("wird umgesetzt durch");
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page.getByText("wird umgesetzt durch")).toBeVisible();

  const terminalNode = page.locator('.react-flow__node-orbit[data-id="terminal"]');
  await terminalNode.locator(".orbit-live-drag-handle").click();
  const [toolBox, pillBox] = await Promise.all([terminalNode.boundingBox(), terminalNode.locator(".orbit-live-drag-handle").boundingBox()]);
  expect(pillBox!.y + pillBox!.height).toBeLessThanOrEqual(toolBox!.y - 2);
  await expect(terminalNode.locator(".orbit-live-drag-handle > span")).toHaveCSS("width", "30px");
  await expect(terminalNode.locator(".orbit-live-drag-handle > span")).toHaveCSS("height", "3px");

  const dragHandle = terminalNode.locator(".orbit-live-drag-handle");
  const contentBox = await terminalNode.locator(".orbit-tool-content").boundingBox();
  const beforeDrag = await terminalNode.boundingBox();
  const viewportBeforeDrag = await page.locator(".react-flow__viewport").evaluate((element) => getComputedStyle(element).transform);
  expect(contentBox).not.toBeNull();
  expect(beforeDrag).not.toBeNull();
  const dragHandleBox = await dragHandle.boundingBox();
  expect(dragHandleBox).not.toBeNull();
  await page.mouse.move((dragHandleBox?.x ?? 0) + (dragHandleBox?.width ?? 0) / 2, (dragHandleBox?.y ?? 0) + (dragHandleBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((dragHandleBox?.x ?? 0) + (dragHandleBox?.width ?? 0) / 2 + 14, (dragHandleBox?.y ?? 0) + (dragHandleBox?.height ?? 0) / 2 + 18, { steps: 4 });
  await page.mouse.move((contentBox?.x ?? 0) + (contentBox?.width ?? 0) * .68, (contentBox?.y ?? 0) + (contentBox?.height ?? 0) * .62, { steps: 12 });
  const duringDrag = await terminalNode.boundingBox();
  expect(duringDrag?.x).toBeGreaterThan((beforeDrag?.x ?? 0) + 8);
  await page.mouse.up();
  const afterDrag = await terminalNode.boundingBox();
  expect(afterDrag?.x).toBeGreaterThan((beforeDrag?.x ?? 0) + 8);
  await page.mouse.move((contentBox?.x ?? 0) + 180, (contentBox?.y ?? 0) + 70, { steps: 8 });
  await expect.poll(() => terminalNode.boundingBox()).toEqual(afterDrag);
  await expect.poll(() => page.locator(".react-flow__viewport").evaluate((element) => getComputedStyle(element).transform)).toBe(viewportBeforeDrag);

  const viewport = page.locator(".react-flow__viewport");
  const beforeTransform = await viewport.evaluate((element) => getComputedStyle(element).transform);
  const beforePageScale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await terminalNode.locator(".orbit-tool-content").dispatchEvent("wheel", { ctrlKey: true, deltaY: -120, clientX: 700, clientY: 500 });
  await expect.poll(() => viewport.evaluate((element) => getComputedStyle(element).transform)).not.toBe(beforeTransform);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(beforePageScale);

  const pane = page.locator(".react-flow__pane");
  await pane.click({ button: "right", position: { x: 80, y: 700 } });
  const quickMenu = page.getByRole("menu", { name: "Schnellaktionen" });
  await expect(quickMenu).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Neues Terminal" })).toBeVisible();
  await quickMenu.click({ button: "right", position: { x: 24, y: 24 } });
  await expect(quickMenu).toHaveCount(0);
  await pane.click({ button: "right", position: { x: 80, y: 700 } });
  await expect(quickMenu).toBeVisible();
  await pane.click({ button: "right", position: { x: 520, y: 700 } });
  await expect(quickMenu).toHaveCount(0);
  await expect(offscreenDraft).toHaveValue("Ungespeicherter Entwurf bleibt erhalten");
});
