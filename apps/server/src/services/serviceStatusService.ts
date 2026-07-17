import { servicesResponseSchema, type Service, type ServicesResponse } from "@workbench/contracts";
import { execa } from "execa";
import type { ServiceConfig } from "../config/schemas.js";
import { settings } from "../config/settings.js";
import { readTailscaleStatus } from "../system/tailscale.js";
import { createAsyncCache } from "../utils/cache.js";

async function checkService(service: ServiceConfig): Promise<Service> {
  const checkedAt = new Date().toISOString();
  const base = {
    id: service.id,
    name: service.name,
    mode: service.mode,
    publicUrl: service.publicUrl,
    lastChecked: checkedAt,
  };

  try {
    switch (service.check.type) {
      case "self":
        return { ...base, state: "active" };
      case "none":
        return { ...base, state: "inactive", message: service.check.reason };
      case "tailscale": {
        const status = await readTailscaleStatus();
        return {
          ...base,
          state: status.state === "connected" ? "active" : status.state === "disconnected" ? "inactive" : "unknown",
          ...(status.state === "connected" ? {} : { message: "Tailscale ist nicht verbunden oder nicht prüfbar." }),
        };
      }
      case "systemd": {
        const result = await execa("systemctl", ["is-active", service.check.unit], {
          reject: false,
          shell: false,
          timeout: settings.requestTimeoutMilliseconds,
        });
        const state = result.stdout.trim();
        if (state === "active") return { ...base, state: "active" };
        if (state === "inactive" || state === "failed" || state === "deactivating") {
          return { ...base, state: state === "failed" ? "error" : "inactive", message: `systemd: ${state}` };
        }
        return { ...base, state: "unknown", message: `systemd: ${state || "unbekannt"}` };
      }
      case "http": {
        const response = await fetch(service.check.url, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(settings.requestTimeoutMilliseconds),
        });
        return response.ok || (response.status >= 300 && response.status < 400)
          ? { ...base, state: "active" }
          : { ...base, state: "error", message: `Healthcheck HTTP ${response.status}` };
      }
    }
  } catch {
    return { ...base, state: "error", message: "Dienststatus konnte nicht gelesen werden." };
  }
}

export function createServiceStatusService(services: ServiceConfig[]) {
  const cache = createAsyncCache<ServicesResponse>(settings.serviceCacheMilliseconds, async () =>
    servicesResponseSchema.parse({ services: await Promise.all(services.map(checkService)) }),
  );
  return { list: () => cache.get() };
}

