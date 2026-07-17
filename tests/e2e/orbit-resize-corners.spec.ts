import { expect, test } from "@playwright/test";

const workbench = process.env.WORKBENCH_E2E_URL;

test.use({ viewport: { width: 1440, height: 960 } });

test("keeps every visible resize point centered on its window corner", async ({ page }) => {
  test.skip(!workbench, "Set WORKBENCH_E2E_URL to an isolated Orbit test server.");
  const orbitUrl = new URL("/api/v1/orbit", workbench).toString();
  const current = await (await page.request.get(orbitUrl)).json();
  const nodeId = `corner-${Date.now()}`;
  const activeBoard = current.document.boards.find((board: { id: string }) => board.id === current.document.activeBoardId);
  activeBoard.nodes.push({
    id: nodeId,
    type: "note",
    title: "Eckprüfung",
    position: { x: 260, y: 180 },
    size: { width: 420, height: 260 },
    projectId: null,
    parentId: null,
    runtimeId: null,
    toolType: null,
    previewId: null,
    provider: null,
    content: "",
    language: null,
    locked: false,
    zIndex: Math.max(0, ...activeBoard.nodes.map((node: { zIndex: number }) => node.zIndex)) + 1,
  });
  const saved = await page.request.put(orbitUrl, { data: { expectedRevision: current.revision, document: current.document } });
  await expect(saved).toBeOK();

  await page.goto(`${workbench}/workbench`);
  const node = page.locator(`.react-flow__node-orbit[data-id="${nodeId}"]`);
  await node.locator(".orbit-node-header").click();
  const result = await node.evaluate((element) => {
    const nodeBounds = element.getBoundingClientRect();
    const expected = {
      "top left": { x: nodeBounds.left, y: nodeBounds.top },
      "top right": { x: nodeBounds.right, y: nodeBounds.top },
      "bottom left": { x: nodeBounds.left, y: nodeBounds.bottom },
      "bottom right": { x: nodeBounds.right, y: nodeBounds.bottom },
    };
    return [...element.querySelectorAll<HTMLElement>(".orbit-resize-corner")].map((control) => {
      const dot = control.querySelector<HTMLElement>(".orbit-resize-dot")!.getBoundingClientRect();
      const key = ["top", "bottom", "left", "right"].filter((name) => control.classList.contains(name)).join(" ") as keyof typeof expected;
      return {
        key,
        deltaX: Math.abs(dot.left + dot.width / 2 - expected[key].x),
        deltaY: Math.abs(dot.top + dot.height / 2 - expected[key].y),
      };
    });
  });
  expect(result).toHaveLength(4);
  for (const corner of result) {
    expect(corner.deltaX, `${corner.key} x`).toBeLessThanOrEqual(1);
    expect(corner.deltaY, `${corner.key} y`).toBeLessThanOrEqual(1);
  }
});
