import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./same-origin.js";

describe("isSameOriginRequest", () => {
  it("accepts the matching Workbench origin and rejects cross-origin upgrades", async () => {
    const app = Fastify({ trustProxy: ["127.0.0.1"] });
    app.get("/check", (request) => ({ sameOrigin: isSameOriginRequest(request) }));
    expect((await app.inject({ url: "/check", headers: { origin: "https://workbench.example:8443", host: "workbench.example:8443", "x-forwarded-proto": "https" } })).json()).toEqual({ sameOrigin: true });
    expect((await app.inject({ url: "/check", headers: { origin: "https://attacker.example", host: "workbench.example:8443", "x-forwarded-proto": "https" } })).json()).toEqual({ sameOrigin: false });
    expect((await app.inject({ url: "/check", headers: { host: "workbench.example:8443" } })).json()).toEqual({ sameOrigin: false });
    await app.close();
  });
});
