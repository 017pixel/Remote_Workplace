import { monitorEventLoopDelay } from "node:perf_hooks";

interface RouteMetric {
  method: string;
  route: string;
  count: number;
  errorCount: number;
  durations: number[];
}

const MAX_TRACKED_ROUTES = 100;
const MAX_ROUTE_SAMPLES = 256;

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue))] ?? 0;
}

export class OperationalMetrics {
  private readonly eventLoop = monitorEventLoopDelay({ resolution: 20 });
  private readonly starts = new WeakMap<object, bigint>();
  private readonly routes = new Map<string, RouteMetric>();
  private activeRequests = 0;
  private totalRequests = 0;
  private clientErrors = 0;
  private serverErrors = 0;

  constructor() {
    this.eventLoop.enable();
  }

  start(request: object) {
    this.activeRequests += 1;
    this.starts.set(request, process.hrtime.bigint());
  }

  finish(request: object, method: string, route: string, statusCode: number) {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.totalRequests += 1;
    if (statusCode >= 500) this.serverErrors += 1;
    else if (statusCode >= 400) this.clientErrors += 1;
    const startedAt = this.starts.get(request);
    this.starts.delete(request);
    const durationMs = startedAt === undefined
      ? 0
      : Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const key = `${method} ${route}`;
    let metric = this.routes.get(key);
    if (!metric && this.routes.size < MAX_TRACKED_ROUTES) {
      metric = { method, route, count: 0, errorCount: 0, durations: [] };
      this.routes.set(key, metric);
    }
    if (!metric) return;
    metric.count += 1;
    if (statusCode >= 500) metric.errorCount += 1;
    metric.durations.push(durationMs);
    if (metric.durations.length > MAX_ROUTE_SAMPLES) metric.durations.shift();
  }

  snapshot() {
    const memory = process.memoryUsage();
    const p99Ms = this.eventLoop.count > 0 ? this.eventLoop.percentile(99) / 1_000_000 : 0;
    const errorRate = this.totalRequests === 0 ? 0 : this.serverErrors / this.totalRequests;
    const degradedReasons: string[] = [];
    if (p99Ms > 100) degradedReasons.push("EVENT_LOOP_LAG");
    if (this.totalRequests >= 20 && errorRate > 0.05) degradedReasons.push("HTTP_5XX_RATE");
    return {
      capturedAt: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      http: {
        activeRequests: this.activeRequests,
        totalRequests: this.totalRequests,
        clientErrors: this.clientErrors,
        serverErrors: this.serverErrors,
        routes: [...this.routes.values()]
          .sort((left, right) => right.count - left.count)
          .map((metric) => ({
            method: metric.method,
            route: metric.route,
            count: metric.count,
            errorCount: metric.errorCount,
            p95Milliseconds: percentile(metric.durations, 0.95),
            p99Milliseconds: percentile(metric.durations, 0.99),
          })),
      },
      eventLoop: {
        meanMilliseconds: Number.isFinite(this.eventLoop.mean) ? this.eventLoop.mean / 1_000_000 : 0,
        p99Milliseconds: p99Ms,
        maxMilliseconds: this.eventLoop.max / 1_000_000,
      },
      processMemory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },
      degradedReasons,
    };
  }

  close() {
    this.eventLoop.disable();
  }
}
