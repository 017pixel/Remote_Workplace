import { expect, test } from "@playwright/test";
import { apiIdentityHeaders } from "./helpers/environment";

test("health and project APIs remain independently available", async ({ request }) => {
  const health = await request.get("/api/v1/health");
  await expect(health).toBeOK();
  expect(await health.json()).toMatchObject({ status: "ok" });

  const projects = await request.get("/api/v1/projects", { headers: apiIdentityHeaders("user@example.com") });
  await expect(projects).toBeOK();
  expect((await projects.json()).projects.length).toBeGreaterThan(0);
});

test("unknown endpoints use the uniform error envelope", async ({ request }) => {
  const response = await request.get("/api/v1/does-not-exist", { headers: apiIdentityHeaders("user@example.com") });
  expect(response.status()).toBe(404);
  const body = await response.json();
  expect(body).toMatchObject({
    error: {
      code: "NOT_FOUND",
      message: "Der API-Endpunkt wurde nicht gefunden.",
      details: null,
      retryable: false,
    },
  });
  expect(body.error.requestId).toEqual(expect.any(String));
});
