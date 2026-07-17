import { hostname, loadavg } from "node:os";
import {
  serverMetricsSchema,
  serverSummarySchema,
  type ServerMetrics,
  type ServerSummary,
} from "@workbench/contracts";
import systeminformation from "systeminformation";
import { readTailscaleStatus } from "../system/tailscale.js";
import { createAsyncCache } from "../utils/cache.js";
import { settings } from "../config/settings.js";

async function loadSummary(): Promise<ServerSummary> {
  const [osInfo, tailscale] = await Promise.all([systeminformation.osInfo(), readTailscaleStatus()]);
  return serverSummarySchema.parse({
    serverName: hostname(),
    status: "online",
    operatingSystem: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
    },
    uptimeSeconds: systeminformation.time().uptime,
    tailscale,
    lastUpdated: new Date().toISOString(),
  });
}

async function loadMetrics(): Promise<ServerMetrics> {
  const [load, memory, fileSystems, temperature] = await Promise.all([
    systeminformation.currentLoad(),
    systeminformation.mem(),
    systeminformation.fsSize(),
    systeminformation.cpuTemperature().catch(() => ({ main: null })),
  ]);
  const systemLoadAverage = loadavg();

  const physicalFileSystems = fileSystems
    .filter((fileSystem) => fileSystem.size > 0 && fileSystem.mount.startsWith("/") && fileSystem.type !== "tmpfs")
    .map((fileSystem) => ({
      mount: fileSystem.mount,
      usedBytes: fileSystem.used,
      totalBytes: fileSystem.size,
      availableBytes: Math.max(0, fileSystem.size - fileSystem.used),
      usedPercent: Math.min(100, Math.max(0, fileSystem.use)),
    }));

  return serverMetricsSchema.parse({
    cpuPercent: Math.min(100, Math.max(0, load.currentLoad)),
    memory: {
      usedBytes: memory.active,
      totalBytes: memory.total,
      availableBytes: memory.available,
    },
    disks: physicalFileSystems,
    loadAverage: [systemLoadAverage[0] ?? 0, systemLoadAverage[1] ?? 0, systemLoadAverage[2] ?? 0],
    temperatureCelsius:
      typeof temperature.main === "number" && Number.isFinite(temperature.main) && temperature.main > 0
        ? temperature.main
        : null,
    lastUpdated: new Date().toISOString(),
  });
}

const summaryCache = createAsyncCache(settings.summaryCacheMilliseconds, loadSummary);
const metricsCache = createAsyncCache(settings.metricsCacheMilliseconds, loadMetrics);

export const systemService = {
  getSummary: () => summaryCache.get(),
  getMetrics: () => metricsCache.get(),
};
