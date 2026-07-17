import { expect, test } from "@playwright/test";

test("health and project APIs remain independently available", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  await expect(health).toBeOK();
  expect(await health.json()).toMatchObject({ status: "ok" });

  const projects = await request.get("/api/v1/projects");
  await expect(projects).toBeOK();
  expect((await projects.json()).projects.length).toBeGreaterThan(0);
});

test("unknown endpoints use the uniform error envelope", async ({ request }) => {
  const response = await request.get("/api/v1/does-not-exist");
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: { code: "NOT_FOUND", message: "Der API-Endpunkt wurde nicht gefunden." },
  });
});
