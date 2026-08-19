import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import fastifyStatic from "@fastify/static";
import { apiErrorSchema } from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";

const require = createRequire(import.meta.url);
const devtoolsDirectory = dirname(require.resolve("@chrome-devtools/inspector/inspector.html"));

async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function registerStaticHosting(app: FastifyInstance) {
  const hasWebBuild = await directoryExists(join(settings.webDistDirectory, "index.html"));
  if (hasWebBuild) {
    await app.register(fastifyStatic, {
      root: settings.webDistDirectory,
      prefix: "/wrapt/",
      preCompressed: true,
      setHeaders: (response, filePath) => {
        if (filePath.includes("/assets/")) {
          response.header("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if (filePath.endsWith("index.html") || filePath.endsWith("sw.js")) {
          response.header("Cache-Control", "no-cache");
          // Das gehostete T3-Web-UI (app.t3.codes) wird als Iframe eingebettet und
          // verbindet sich per Private Network Access mit den T3-Backends im
          // Tailnet. Chrome verlangt dafür eine einmalige Bestätigung des
          // lokalen Netzwerkzugriffs (local-network-access), Firefox nutzt die
          // Feature-Policy-Namen local-network/loopback-network. Beide Welten
          // werden an den Iframe delegiert.
          response.header(
            "Permissions-Policy",
            'local-network-access=(self "https://app.t3.codes"); local-network=(self "https://app.t3.codes"); loopback-network=(self "https://app.t3.codes")',
          );
          return;
        }
        if (filePath.includes("/icons/") || filePath.endsWith("favicon.svg")) {
          response.header("Cache-Control", "public, max-age=604800");
        }
      },
    });
    await app.register(fastifyStatic, {
      root: devtoolsDirectory,
      prefix: "/wrapt/devtools/",
      decorateReply: false,
      setHeaders: (response, filePath) => {
        response.header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:; frame-ancestors 'self'");
        response.header("Cache-Control", filePath.endsWith("inspector.html") ? "no-cache" : "public, max-age=31536000, immutable");
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send(
        apiErrorSchema.parse({ error: { code: "NOT_FOUND", message: "Der API-Endpunkt wurde nicht gefunden.", details: null, requestId: request.id, retryable: false } }),
      );
    }
    const legacyUrl = new URL(request.url, "http://wrapt.local");
    if (legacyUrl.pathname === "/workbench" || legacyUrl.pathname.startsWith("/workbench/")) {
      const suffix = legacyUrl.pathname.slice("/workbench".length) || "/";
      return reply.status(308).redirect(`/wrapt${suffix}${legacyUrl.search}`);
    }
    // Nur echte HTML-Navigationen bekommen den SPA-Fallback. Liefert ein
    // fehlender JavaScript-Chunk stattdessen index.html mit Status 200, meldet
    // der Browser nur einen irreführenden Modulfehler und der Prefetch-Promise
    // wird zum unhandledrejection.
    const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
    if (hasWebBuild && request.url.startsWith("/wrapt") && acceptsHtml) {
      // Delegation für den lokalen Netzwerkzugriff an das eingebettete
      // T3-Web-UI (siehe setHeaders oben bei index.html).
      return reply
        .header(
          "Permissions-Policy",
          'local-network-access=(self "https://app.t3.codes"); local-network=(self "https://app.t3.codes"); loopback-network=(self "https://app.t3.codes")',
        )
        .type("text/html")
        .sendFile("index.html");
    }
    if (hasWebBuild) return reply.status(404).send("Nicht gefunden.");
    return reply.status(503).send("Frontend-Build ist noch nicht vorhanden.");
  });
}
