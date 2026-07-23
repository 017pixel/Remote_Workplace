import type { FastifyRequest } from "fastify";

function firstHeader(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
}

export function isSameOriginRequest(request: FastifyRequest): boolean {
  const rawOrigin = firstHeader(request.headers.origin);
  const rawHost = firstHeader(request.headers["x-forwarded-host"]) ?? request.headers.host;
  const rawProtocol = firstHeader(request.headers["x-forwarded-proto"]) ?? request.protocol;
  if (!rawOrigin || !rawHost || (rawProtocol !== "http" && rawProtocol !== "https")) return false;
  try {
    return new URL(rawOrigin).origin === new URL(`${rawProtocol}://${rawHost}`).origin;
  } catch {
    return false;
  }
}
