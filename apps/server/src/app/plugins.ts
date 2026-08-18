import { constants as zlibConstants } from "node:zlib";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";
import { requestIdentity } from "../security/workbench-identity.js";
import type { AppDependencies } from "./dependencies.js";

export async function registerCorePlugins(app: FastifyInstance, deps: AppDependencies) {
  await app.register(compress, {
    global: true,
    globalDecompression: false,
    threshold: settings.compressionThresholdBytes,
    encodings: ["br", "gzip"],
    brotliOptions: {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: settings.brotliQuality },
    },
  });
  await app.register(helmet, {
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: [...deps.frameSources, "https://www.youtube-nocookie.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameAncestors: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, {
    max: settings.apiRateLimitMax,
    timeWindow: "1 minute",
    // Vite and code-server legitimately load hundreds of assets and maintain
    // several sockets. Only the Workbench API belongs behind this limiter.
    //
    // `/health` bleibt ausgenommen: Jeder offene Tab fragt es alle 10 Sekunden ab,
    // der Neustart-Flow pollt es sekündlich, und es liefert nur Version und
    // Neustart-Marker. Es ist damit der billigste und häufigste Endpunkt — als
    // Erstes das Limit zu reißen, obwohl der Schutz teuren Endpunkten gilt, hat
    // schon den E2E-Lauf rot gefärbt. Das Limit zählt pro IP, und hinter dem
    // Tailscale-Proxy sehen alle Anfragen wie 127.0.0.1 aus: Es ist praktisch ein
    // gemeinsames Budget für sämtliche Tabs.
    allowList: (request) => !request.url.startsWith("/api/") || request.url.startsWith("/api/v1/health"),
    keyGenerator: (request) => {
      const identity = requestIdentity(request);
      // Ein beliebiger Headerwert darf keine neue Rate-Limit-Bucket eröffnen.
      // Nicht zugelassene Identitäten bleiben deshalb im IP-Bucket, während
      // bekannte Benutzer getrennt voneinander bewertet werden.
      const allowedUsers = settings.terminalAllowedUsers;
      if (identity && (allowedUsers.length === 0 || allowedUsers.includes(identity))) return identity;
      return request.ip;
    },
  });
  await app.register(websocket, {
    // code-server sends initialisation frames larger than 64 KiB. Terminal
    // input remains independently restricted by its Zod protocol schema.
    options: { maxPayload: settings.webSocketMaxPayloadBytes },
  });
  await app.register(multipart, { limits: { files: 1, fileSize: settings.orbitAssetMaxFileBytes } });
}
