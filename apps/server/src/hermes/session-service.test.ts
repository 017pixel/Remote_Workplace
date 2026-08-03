import { describe, expect, it } from "vitest";
import { HermesSessionService } from "./session-service.js";

describe("Hermes-Session-Service", () => {
  it("normalisiert den realen String-Modellkatalog des Dashboards", async () => {
    const client = {
      get: async (path: string) => path === "/api/model/info"
        ? { model: "custom:active" }
        : { providers: [{ slug: "custom", models: ["active", "alternative"] }] },
      post: async () => null,
    } as never;
    const service = new HermesSessionService(client, { sessionsSnapshot: () => [] } as never);
    const result = await service.models();
    expect(result.current?.id).toBe("custom:active");
    expect(result.models.map((model) => model.id)).toEqual(["custom:active", "custom:alternative"]);
  });
});
