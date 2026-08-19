import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { apiErrorSchema } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { createProxyHandler } from "./proxy.js";

let upstream: Server;
let upstreamOrigin: string;

beforeEach(async () => {
  upstream = createServer((request, response) => {
    if (request.url === "/asset.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end("png");
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(
      `<html><body>` +
        `<img src="http://example.invalid:9/ignored.png">` +
        `<img src="${upstreamOrigin}/asset.png">` +
        `<a href="${upstreamOrigin}/link">x</a>` +
        `<img srcset="${upstreamOrigin}/a.png 1x, ${upstreamOrigin}/b.png 2x">` +
        `</body></html>`,
    );
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", () => resolve()));
  const address = upstream.address();
  if (typeof address === "object" && address !== null) {
    upstreamOrigin = `http://127.0.0.1:${address.port}`;
  }
});

afterEach(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function makeApp(allowed: string[]) {
  const app = Fastify();
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(apiErrorSchema.parse({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: request.id,
          retryable: error.retryable,
        },
      }));
    }
    throw error;
  });
  app.get("/proxy/*", { helmet: { contentSecurityPolicy: false } }, createProxyHandler(allowed));
  return app;
}

describe("proxy handler", () => {
  it("proxies an allowed origin and rewrites same-origin asset URLs", async () => {
    const app = makeApp([upstreamOrigin]);
    const response = await app.inject({ url: `/proxy/${encodeURIComponent(upstreamOrigin + "/page")}` });
    expect(response.statusCode).toBe(200);
    const assetProxy = `/api/v1/proxy/${encodeURIComponent(upstreamOrigin + "/asset.png")}`;
    const linkProxy = `/api/v1/proxy/${encodeURIComponent(upstreamOrigin + "/link")}`;
    expect(response.body).toContain(assetProxy);
    expect(response.body).toContain(linkProxy);
    expect(response.body).toContain("http://example.invalid:9");
    expect(response.body).not.toContain("/api/v1/proxy/http%3A%2F%2Fexample.invalid");
    const srcsetProxies = [`/api/v1/proxy/${encodeURIComponent(upstreamOrigin + "/a.png")} 1x`, `/api/v1/proxy/${encodeURIComponent(upstreamOrigin + "/b.png")} 2x`];
    expect(response.body).toContain(srcsetProxies[0]);
    expect(response.body).toContain(srcsetProxies[1]);
    await app.close();
  });

  it("streams non-html responses unchanged", async () => {
    const app = makeApp([upstreamOrigin]);
    const response = await app.inject({ url: `/proxy/${encodeURIComponent(upstreamOrigin + "/asset.png")}` });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("png");
    expect(response.headers["content-type"]).toBe("image/png");
    await app.close();
  });

  it("rejects non-URL targets with 400", async () => {
    const app = makeApp([upstreamOrigin]);
    const response = await app.inject({ url: `/proxy/${encodeURIComponent("not-a-url")}` });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_TARGET" } });
    await app.close();
  });

  it("rejects disallowed origins with 403", async () => {
    const app = makeApp(["http://other.invalid:1"]);
    const response = await app.inject({ url: `/proxy/${encodeURIComponent(upstreamOrigin + "/page")}` });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "PROXY_FORBIDDEN" } });
    await app.close();
  });

  it("strips framing headers from the proxied response", async () => {
    upstream.removeAllListeners("request");
    upstream.on("request", (_request, response) => {
      response.writeHead(200, {
        "content-type": "text/html",
        "x-frame-options": "DENY",
        "content-security-policy": "frame-ancestors 'none'",
      });
      response.end("<html></html>");
    });
    const app = makeApp([upstreamOrigin]);
    const response = await app.inject({ url: `/proxy/${encodeURIComponent(upstreamOrigin + "/page")}` });
    expect(response.headers["x-frame-options"]).toBeUndefined();
    expect(response.headers["content-security-policy"]).toBeUndefined();
    await app.close();
  });
});
