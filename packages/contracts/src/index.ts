import { z } from "zod";

export const isoDateSchema = z.iso.datetime({ offset: true });
export const serviceModeSchema = z.enum(["embedded", "external", "hybrid"]);
export const serviceStateSchema = z.enum([
  "active",
  "inactive",
  "error",
  "unknown",
  "checking",
]);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).nullable().default(null),
    requestId: z.string().min(1),
    retryable: z.boolean(),
  }),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string().min(1),
  appName: z.string().min(1),
  timestamp: isoDateSchema,
  // Zufalls-ID pro Serverprozess. Wechselt der Wert, wurde das Backend neu gestartet.
  bootId: z.string().min(1),
  // mtime (ms) von apps/web/dist/index.html. Wechselt der Wert, wurde das Frontend neu gebaut.
  webBuildId: z.number().int().nullable(),
});

export const dashboardSectionSchema = z.enum([
  "quickActions",
  "server",
  "metrics",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "news",
  "commands",
]);

export const dashboardConfigSchema = z.object({
  sections: z.object({
    quickActions: z.boolean().default(true),
    server: z.boolean().default(true),
    metrics: z.boolean().default(true),
    services: z.boolean().default(true),
    runtime: z.boolean().default(true),
    diagnostics: z.boolean().default(true),
    usage: z.boolean().default(true),
    news: z.boolean().default(true),
    commands: z.boolean().default(true),
  }).prefault({}),
  refresh: z.object({
    healthMilliseconds: z.number().int().min(1_000).max(300_000).default(5_000),
    summaryMilliseconds: z.number().int().min(1_000).max(300_000).default(30_000),
    metricsMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    servicesMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    localPortsMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    terminalSessionsMilliseconds: z.number().int().min(1_000).max(30_000).default(3_000),
    operationalMetricsMilliseconds: z.number().int().min(1_000).max(120_000).default(5_000),
    usageMilliseconds: z.number().int().min(10_000).max(600_000).default(60_000),
    newsMilliseconds: z.number().int().min(10_000).max(600_000).default(60_000),
  }).prefault({}),
}).prefault({});

export const readinessResponseSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  timestamp: isoDateSchema,
  checks: z.array(z.object({
    name: z.string().min(1),
    status: z.enum(["ok", "failed"]),
  })),
});

export const operationalMetricsSchema = z.object({
  capturedAt: isoDateSchema,
  uptimeSeconds: z.number().nonnegative(),
  http: z.object({
    activeRequests: z.number().int().nonnegative(),
    totalRequests: z.number().int().nonnegative(),
    clientErrors: z.number().int().nonnegative(),
    serverErrors: z.number().int().nonnegative(),
    routes: z.array(z.object({
      method: z.string().min(1),
      route: z.string().min(1),
      count: z.number().int().nonnegative(),
      errorCount: z.number().int().nonnegative(),
      p95Milliseconds: z.number().nonnegative(),
      p99Milliseconds: z.number().nonnegative(),
    })),
  }),
  eventLoop: z.object({
    meanMilliseconds: z.number().nonnegative(),
    p99Milliseconds: z.number().nonnegative(),
    maxMilliseconds: z.number().nonnegative(),
  }),
  processMemory: z.object({
    rssBytes: z.number().int().nonnegative(),
    heapUsedBytes: z.number().int().nonnegative(),
    heapTotalBytes: z.number().int().nonnegative(),
    externalBytes: z.number().int().nonnegative(),
  }),
  degradedReasons: z.array(z.string().min(1)),
  audit: z.object({
    valid: z.boolean(),
    entries: z.number().int().nonnegative(),
    latestAt: isoDateSchema.nullable(),
  }),
  orbit: z.object({
    pendingBackups: z.number().int().nonnegative(),
    oldestPendingAt: isoDateSchema.nullable(),
    lastError: z.string().nullable(),
    failedAt: isoDateSchema.nullable(),
  }),
  preview: z.object({
    totalSlots: z.number().int().nonnegative(),
    freeSlots: z.number().int().nonnegative(),
    resettingSlots: z.number().int().nonnegative(),
    quarantinedSlots: z.number().int().nonnegative(),
  }),
});

export const restartTargetSchema = z.enum(["frontend", "backend", "both"]);
export const restartRequestSchema = z.object({ target: restartTargetSchema });
export const restartResponseSchema = z.object({
  status: z.literal("accepted"),
  jobId: z.string().uuid(),
  target: restartTargetSchema,
  // Basiswerte zum Zeitpunkt des Auslösens, damit der Client den Abschluss erkennen kann.
  bootId: z.string().min(1),
  webBuildId: z.number().int().nullable(),
  logFile: z.string().min(1),
});

export const restartPhaseSchema = z.enum(["idle", "running", "succeeded", "failed"]);
// Fortschritt des letzten Neustarts. Das Skript schreibt den Zustand nach
// data/restart-logs/last-status.json; das UI pollt ihn und zeigt bei Fehlern
// direkt den Build-Ausschnitt statt nur „Zeitüberschreitung".
export const restartStatusResponseSchema = z.object({
  jobId: z.string().uuid().nullable(),
  phase: restartPhaseSchema,
  target: restartTargetSchema.nullable(),
  exitCode: z.number().int().nullable(),
  // Der zuletzt begonnene Schritt, z. B. "Baue Frontend (@workbench/web) …".
  step: z.string(),
  message: z.string(),
  startedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  // Ende des Build-Logs, ANSI-bereinigt — das ist die eigentliche Fehlermeldung.
  logTail: z.string(),
  logFile: z.string().nullable(),
  bootId: z.string().min(1),
  webBuildId: z.number().int().nullable(),
});

// T3 Code läuft als genau eine Instanz hinter dem /t3-Proxy. Der Kanal bestimmt nur,
// welches npm-Paket (t3@latest bzw. t3@nightly) beim nächsten Neustart installiert wird —
// beide Kanäle teilen sich dasselbe Datenverzeichnis (~/.t3/userdata).
// ── Open-in-Editor (T3-Code-Shim) ─────────────────────────────────────────────
// T3 Code ruft beim „Open in Editor" (Command O) auf dem Server `code <pfad>`
// auf. Das Shim-Skript meldet den Pfad per HTTP an die Workbench; diese leitet
// ihn per WebSocket an den Browser, der den code-server mit dem Ordner öffnet.
// Der Pfad bleibt dabei ein Serverwert — er wird nie vom Browser gesetzt.
export const editorOpenRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096).startsWith("/"),
});
export const editorOpenEventSchema = z.object({
  type: z.literal("editor.open"),
  path: z.string().startsWith("/").max(4_096),
});
export type EditorOpenEvent = z.infer<typeof editorOpenEventSchema>;

export const t3ChannelSchema = z.enum(["stable", "nightly"]);
export const t3ChannelRequestSchema = z.object({ channel: t3ChannelSchema });
export const t3ChannelStatusResponseSchema = z.object({
  // In der Config hinterlegter Wunschkanal. Greift erst nach einem Neustart.
  configuredChannel: t3ChannelSchema,
  // Aus der installierten Version abgeleitet; null, wenn T3 nicht installiert ist.
  activeChannel: t3ChannelSchema.nullable(),
  activeVersion: z.string().nullable(),
  installed: z.boolean(),
  // Antwortet die Instanz auf 127.0.0.1:<port>? Nur Anzeige, kein Kriterium für den Wechsel.
  reachable: z.boolean(),
  // configured ≠ active — das UI zeigt dann den Hinweis auf die Neustart-Buttons.
  restartRequired: z.boolean(),
  serviceUnit: z.string().min(1),
  port: z.number().int().positive(),
  checkedAt: isoDateSchema,
});

export const tailscaleSummarySchema = z.object({
  state: z.enum(["connected", "disconnected", "unknown"]),
  hostname: z.string().nullable(),
  dnsName: z.string().nullable(),
});

export const serverSummarySchema = z.object({
  serverName: z.string().min(1),
  status: z.enum(["online", "offline"]),
  operatingSystem: z.object({
    platform: z.string(),
    distro: z.string(),
    release: z.string(),
    kernel: z.string(),
  }),
  uptimeSeconds: z.number().nonnegative(),
  tailscale: tailscaleSummarySchema,
  lastUpdated: isoDateSchema,
});

export const serverMetricsSchema = z.object({
  cpuPercent: z.number().min(0).max(100),
  memory: z.object({
    usedBytes: z.number().nonnegative(),
    totalBytes: z.number().positive(),
    availableBytes: z.number().nonnegative(),
  }),
  disks: z.array(
    z.object({
      mount: z.string(),
      usedBytes: z.number().nonnegative(),
      totalBytes: z.number().nonnegative(),
      availableBytes: z.number().nonnegative(),
      usedPercent: z.number().min(0).max(100),
    }),
  ),
  loadAverage: z.tuple([z.number(), z.number(), z.number()]),
  temperatureCelsius: z.number().nullable(),
  lastUpdated: isoDateSchema,
});

export const serviceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  mode: serviceModeSchema,
  state: serviceStateSchema,
  publicUrl: z.url().nullable(),
  message: z.string().optional(),
  lastChecked: isoDateSchema,
});

export const servicesResponseSchema = z.object({ services: z.array(serviceSchema) });

export const localPortSchema = z.object({
  port: z.number().int().min(1).max(65_535),
  address: z.string().min(1),
  process: z.string().min(1).nullable(),
  pid: z.number().int().positive().nullable().default(null),
  projectId: z.string().min(1).nullable().default(null),
  projectName: z.string().min(1).nullable().default(null),
  protocol: z.enum(["http", "https", "unknown"]),
  localUrl: z.url().nullable(),
  proxyUrl: z.string().startsWith("/").nullable(),
});

export const localPortsResponseSchema = z.object({
  ports: z.array(localPortSchema),
  scannedAt: isoDateSchema,
});

// Lebenszyklus einer Slot-Origin. `resetting` und `quarantined` verhindern, dass ein
// fremdes Storage-Profil eine Origin übernimmt, deren Speicher noch nicht nachweislich
// geleert wurde.
export const previewSlotStateSchema = z.enum(["free", "active", "resetting", "quarantined"]);
export const previewAffinityStatusSchema = z.enum(["none", "own", "foreign", "quarantined"]);

export const previewSlotSchema = z.object({
  id: z.number().int().min(1).max(32),
  internalPort: z.number().int().min(1).max(65_535),
  publicPort: z.number().int().min(1).max(65_535),
  targetPort: z.number().int().min(1).max(65_535).nullable(),
  publicUrl: z.url(),
  updatedAt: isoDateSchema.nullable(),
  state: previewSlotStateSchema.default("free"),
  // Storage-Profil des aktuellen Eigentümers. Fremde Profile sehen hier `null`;
  // der interne `storageOwnerKey` verlässt den Server nie.
  storageProfileId: z.string().uuid().nullable().default(null),
  slotGeneration: z.number().int().nonnegative().default(0),
  routingRevision: z.number().int().nonnegative().default(0),
  affinityStatus: previewAffinityStatusSchema.default("none"),
  // Aggregierter Fremdzustand: andere Benutzer erscheinen nur als „belegt“.
  busy: z.boolean().default(false),
});

export const previewSlotsResponseSchema = z.object({
  slots: z.array(previewSlotSchema).max(32),
  assignedSlotId: z.number().int().min(1).max(32).nullable().default(null),
  routingRevision: z.number().int().nonnegative().default(0),
});

export const previewDependencySchema = z.object({
  port: z.number().int().min(1).max(65_535),
  label: z.string().trim().min(1).max(80),
  protocol: z.enum(["auto", "http", "https"]).default("auto"),
  enabled: z.boolean().default(true),
});

export const previewDependenciesResponseSchema = z.object({
  projectId: z.string().min(1),
  primaryPort: z.number().int().min(1).max(65_535),
  dependencies: z.array(previewDependencySchema).max(11),
});

export const previewSessionRequestSchema = z.object({
  sessionKey: z.string().trim().min(1).max(160),
  projectId: z.string().trim().min(1).max(160).nullable().default(null),
  primaryPort: z.number().int().min(1).max(65_535),
  primaryProtocol: z.enum(["http", "https"]).default("http"),
  requestedSlotId: z.number().int().min(1).max(32).nullable().optional(),
  isolate: z.boolean().default(true),
  // Stabile Identität des Preview-Slots im Orbit-Dokument. Sie entscheidet, ob eine
  // Slot-Origin ohne Storage-Reset wiederverwendet werden darf.
  storageProfileId: z.string().uuid().nullable().default(null),
  expectedRoutingRevision: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().trim().min(1).max(160).optional(),
});

export const previewSessionBindingSchema = z.object({
  role: z.enum(["primary", "dependency"]),
  label: z.string().min(1).max(80),
  targetPort: z.number().int().min(1).max(65_535),
  targetProtocol: z.enum(["http", "https"]),
  slotId: z.number().int().min(1).max(32),
  publicUrl: z.url(),
});

// Was die Laufzeit in dieser Session wirklich kann, und was sie ausdrücklich nicht
// kann. Beides wird in der Oberfläche angezeigt, statt Vollständigkeit zu behaupten.
export const previewCapabilitySchema = z.enum([
  "bridge",
  "diagnostics",
  "storage-snapshot",
  "slot-reset",
  "websocket",
  "event-source",
]);
export const previewLimitationSchema = z.enum([
  "cookies-share-host",
  "no-indexeddb-sync",
  "no-service-worker-sync",
  "no-session-storage-sync",
  "approximate-device-metrics",
  "bridge-unavailable",
  "partial-network-visibility",
]);

export const previewSessionResponseSchema = z.object({
  id: z.string().uuid(),
  sessionKey: z.string().min(1),
  projectId: z.string().nullable(),
  primaryPort: z.number().int().min(1).max(65_535),
  bindings: z.array(previewSessionBindingSchema).min(1).max(12),
  leaseExpiresAt: isoDateSchema,
  routingRevision: z.number().int().nonnegative().default(0),
  bridgeVersion: z.string().min(1).default("v1"),
  capabilities: z.array(previewCapabilitySchema).max(16).default([]),
  limitations: z.array(previewLimitationSchema).max(16).default([]),
  storageProfileId: z.string().uuid().nullable().default(null),
  slotGeneration: z.number().int().nonnegative().default(0),
});

export const previewSlotAssignmentRequestSchema = z.object({
  slotId: z.number().int().min(1).max(32).nullable().optional(),
  targetPort: z.number().int().min(1).max(65_535).nullable(),
  expectedTargetPort: z.number().int().min(1).max(65_535).optional(),
  isolate: z.boolean().default(true),
}).superRefine((input, context) => {
  if (input.targetPort === null && input.slotId == null) {
    context.addIssue({ code: "custom", message: "Zum Freigeben muss ein Preview-Slot angegeben werden." });
  }
  if (input.targetPort !== null && input.expectedTargetPort !== undefined) {
    context.addIssue({ code: "custom", message: "Der erwartete Zielport ist nur beim Freigeben erlaubt." });
  }
});

// ── Gerätepräferenz ────────────────────────────────────────────────────────────
// Die Benutzeridentität kommt aus dem vertrauenswürdigen Tailscale-Header und wird
// bewusst nicht vom Client übertragen.
export const previewDevicePreferenceSchema = z.object({
  deviceId: z.string().trim().min(1).max(80),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  updatedAt: isoDateSchema.nullable().default(null),
});
export const previewDevicePreferenceRequestSchema = previewDevicePreferenceSchema.pick({
  deviceId: true,
  orientation: true,
});

// Preview Hub: beaufsichtigte Projektlaufzeiten laufen getrennt von interaktiven
// Terminals. Erkannte oder explizit konfigurierte Dienste werden gemeinsam geführt.
export const previewDevServerStateSchema = z.enum(["stopped", "starting", "running", "stopping", "failed", "unknown"]);
export const previewExternalOpenModeSchema = z.enum(["window", "tab"]);
export const previewRuntimeServiceRoleSchema = z.enum(["frontend", "backend", "api", "database", "socket", "worker", "other"]);
export const previewRuntimeProfileSourceSchema = z.enum(["configured", "detected"]);
export const previewRuntimePortModeSchema = z.enum(["argument", "environment", "none"]);
export const previewRuntimeLogLevelSchema = z.enum(["error", "warning", "success", "info"]);
export const previewRuntimeServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  role: previewRuntimeServiceRoleSchema,
  command: z.string().min(1).max(1_000),
  workingDirectory: z.string().min(1).max(4_096),
  port: z.number().int().min(1).max(65_535).nullable(),
  portMode: previewRuntimePortModeSchema,
  source: previewRuntimeProfileSourceSchema,
  frameworkHints: z.array(z.string().min(1).max(60)).max(12).default([]),
});
export const previewRuntimeProfileSchema = z.object({
  projectId: z.string().min(1).max(160),
  source: previewRuntimeProfileSourceSchema,
  mainServiceId: z.string().min(1).max(120).nullable(),
  services: z.array(previewRuntimeServiceSchema).max(10),
  allowedPorts: z.array(z.number().int().min(1).max(65_535)).min(1).max(32),
  warnings: z.array(z.string().min(1).max(400)).max(24).default([]),
  detectedAt: isoDateSchema,
});
export const previewRuntimeServiceStatusSchema = previewRuntimeServiceSchema.extend({
  state: previewDevServerStateSchema,
  pid: z.number().int().positive().nullable(),
  startedAt: isoDateSchema.nullable(),
  exitCode: z.number().int().nullable(),
  message: z.string().max(600).nullable(),
});
export const previewDevServerStatusSchema = z.object({
  projectId: z.string().min(1).max(160),
  state: previewDevServerStateSchema,
  command: z.string().min(1).max(120).default("npm run dev"),
  mainPort: z.number().int().min(1).max(65_535).nullable(),
  mainServiceId: z.string().min(1).max(120).nullable().default(null),
  profileSource: previewRuntimeProfileSourceSchema.default("detected"),
  services: z.array(previewRuntimeServiceStatusSchema).max(10).default([]),
  allowedPorts: z.array(z.number().int().min(1).max(65_535)).max(32).default([]),
  warnings: z.array(z.string().min(1).max(400)).max(24).default([]),
  publicUrl: z.url().nullable().default(null),
  pid: z.number().int().positive().nullable(),
  startedAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema,
  exitCode: z.number().int().nullable(),
  message: z.string().max(600).nullable(),
});
export const previewDevServersResponseSchema = z.object({
  runtimes: z.array(previewDevServerStatusSchema).max(32),
});
export const previewRuntimeLogLineSchema = z.object({
  serviceId: z.string().min(1).max(120),
  level: previewRuntimeLogLevelSchema,
  text: z.string().max(4_000),
});
export const previewRuntimeServiceLogsSchema = z.object({
  serviceId: z.string().min(1).max(120),
  name: z.string().min(1).max(80),
  role: previewRuntimeServiceRoleSchema,
  port: z.number().int().min(1).max(65_535).nullable(),
  state: previewDevServerStateSchema,
  output: z.string().max(262_144),
  lines: z.array(previewRuntimeLogLineSchema).max(4_000),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export const previewDevServerLogsSchema = z.object({
  projectId: z.string().min(1).max(160),
  output: z.string().max(262_144),
  truncated: z.boolean(),
  services: z.array(previewRuntimeServiceLogsSchema).max(10).default([]),
  errorCount: z.number().int().nonnegative().default(0),
  warningCount: z.number().int().nonnegative().default(0),
  capturedAt: isoDateSchema,
});
export const previewDevServerMainPortRequestSchema = z.object({
  mainPort: z.number().int().min(1).max(65_535).nullable(),
});
export const previewHubPreferenceSchema = z.object({
  externalOpenMode: previewExternalOpenModeSchema.default("tab"),
  updatedAt: isoDateSchema.nullable(),
});
export const previewHubPreferenceRequestSchema = previewHubPreferenceSchema.pick({ externalOpenMode: true });
export const previewRuntimeLaunchSchema = z.object({
  status: previewDevServerStatusSchema,
  url: z.url(),
  sessionId: z.string().uuid(),
});

// ── Slot-Reset ─────────────────────────────────────────────────────────────────
export const previewSlotResetRequestSchema = z.object({
  expectedGeneration: z.number().int().nonnegative(),
  storageProfileId: z.string().uuid().nullable(),
});
export const previewSlotResetResponseSchema = z.object({
  slotId: z.number().int().min(1).max(32),
  nonce: z.string().min(16).max(120),
  state: previewSlotStateSchema,
  slotGeneration: z.number().int().nonnegative(),
  resetUrl: z.url(),
  expiresAt: isoDateSchema,
});
export const previewSlotResetReportSchema = z.object({
  nonce: z.string().min(16).max(120),
  // Die Workbench meldet, was die Bridge nach dem Löschen noch gefunden hat.
  serviceWorkers: z.number().int().nonnegative().max(1_000),
  cacheStorages: z.number().int().nonnegative().max(1_000),
  localStorageKeys: z.number().int().nonnegative().max(100_000),
  sessionStorageKeys: z.number().int().nonnegative().max(100_000),
  indexedDatabases: z.number().int().nonnegative().max(1_000),
  // `false`, wenn der Browser keine Inventur erlaubt (z. B. indexedDB.databases fehlt).
  verifiable: z.boolean(),
});
export const previewSlotResetVerificationResponseSchema = z.object({
  slotId: z.number().int().min(1).max(32),
  state: previewSlotStateSchema,
  slotGeneration: z.number().int().nonnegative(),
  verifiedAt: isoDateSchema.nullable(),
  message: z.string().min(1).max(400),
});

// ── Service-Graph ──────────────────────────────────────────────────────────────
export const previewServiceRoleSchema = z.enum(["primary", "api", "socket", "asset", "other"]);
export const previewServiceProtocolSchema = z.enum(["http", "https", "ws", "wss"]);
export const previewProbeStatusSchema = z.enum(["reachable", "unreachable", "unknown"]);

export const previewServiceCandidateSchema = z.object({
  serviceId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(160).nullable(),
  port: z.number().int().min(1).max(65_535),
  process: z.string().max(160).nullable(),
  pid: z.number().int().positive().nullable(),
  // Kanonischer Arbeitsordner des Prozesses; nur zur Projektzuordnung.
  cwd: z.string().max(4_096).nullable(),
  protocol: previewServiceProtocolSchema,
  probeStatus: previewProbeStatusSchema,
  // Rein statisch gelesene Hinweise; es wird niemals fremde Konfiguration ausgeführt.
  scripts: z.array(z.string().max(120)).max(24).default([]),
  frameworkHints: z.array(z.string().max(60)).max(12).default([]),
  supportsWebSocket: z.boolean().default(false),
  suggestedRole: previewServiceRoleSchema.default("other"),
  detectedAt: isoDateSchema,
});
export const previewServiceCandidatesResponseSchema = z.object({
  projectId: z.string().min(1).max(160).nullable(),
  candidates: z.array(previewServiceCandidateSchema).max(64),
  scannedAt: isoDateSchema,
});

export const previewServiceEdgeSchema = z.object({
  serviceId: z.string().min(1).max(120),
  projectId: z.string().min(1).max(160).nullable(),
  port: z.number().int().min(1).max(65_535),
  protocol: previewServiceProtocolSchema,
  role: previewServiceRoleSchema,
  label: z.string().trim().min(1).max(80),
  probeStatus: previewProbeStatusSchema.default("unknown"),
  source: z.enum(["manual", "detected"]).default("detected"),
  confirmedAt: isoDateSchema,
});
export const previewServiceGraphSchema = z.object({
  projectId: z.string().min(1).max(160),
  primaryServiceId: z.string().min(1).max(120),
  edges: z.array(previewServiceEdgeSchema).max(11),
  updatedAt: isoDateSchema.nullable().default(null),
});
export const previewServiceGraphRequestSchema = previewServiceGraphSchema.pick({ edges: true });

// Kapazität wird vor dem Speichern angezeigt; ein zu großer Graph wird nie teilweise aktiviert.
export const previewCapacityPreviewSchema = z.object({
  requiredSlots: z.number().int().nonnegative(),
  reusableSlots: z.number().int().nonnegative(),
  freeSlots: z.number().int().nonnegative(),
  totalSlots: z.number().int().nonnegative(),
  fits: z.boolean(),
  limitations: z.array(previewLimitationSchema).max(16).default([]),
});
export const previewServiceGraphResponseSchema = z.object({
  graph: previewServiceGraphSchema,
  capacity: previewCapacityPreviewSchema,
});

// ── Diagnose ───────────────────────────────────────────────────────────────────
export const previewDiagnosticSourceSchema = z.enum(["client", "gateway", "socket", "system", "inferred"]);
export const previewDiagnosticCategorySchema = z.enum([
  "console",
  "error",
  "network",
  "routing",
  "navigation",
  "storage",
  "lifecycle",
  "performance",
]);
export const previewDiagnosticSeveritySchema = z.enum(["debug", "info", "warn", "error"]);
export const previewDiagnosticCompletenessSchema = z.enum(["complete", "partial", "inferred"]);

export const PREVIEW_DIAGNOSTIC_LIMITS = {
  maxEventsPerBatch: 100,
  maxBatchBytes: 262_144,
  maxEventBytes: 65_536,
  clientRingBuffer: 2_000,
  maxRetentionDays: 7,
} as const;

export const previewDiagnosticEventSchema = z.object({
  id: z.string().uuid(),
  at: isoDateSchema,
  source: previewDiagnosticSourceSchema,
  category: previewDiagnosticCategorySchema,
  severity: previewDiagnosticSeveritySchema,
  completeness: previewDiagnosticCompletenessSchema.default("complete"),
  previewNodeId: z.string().max(120).nullable().default(null),
  sessionId: z.string().uuid().nullable().default(null),
  slotId: z.number().int().min(1).max(32).nullable().default(null),
  routingRevision: z.number().int().nonnegative().nullable().default(null),
  bridgeSessionId: z.string().max(120).nullable().default(null),
  epoch: z.number().int().nonnegative().default(0),
  sequence: z.number().int().nonnegative().default(0),
  route: z.string().max(2_048).nullable().default(null),
  message: z.string().max(8_192),
  // Bereits redigierte, größenbegrenzte Zusatzdaten. Bodies gehören hier nie hinein.
  metadata: z.record(z.string().max(80), z.unknown()).default({}),
});
export const previewDiagnosticBatchSchema = z.object({
  previewNodeId: z.string().max(120).nullable().default(null),
  sessionId: z.string().uuid().nullable().default(null),
  bridgeSessionId: z.string().max(120).nullable().default(null),
  droppedSinceLastBatch: z.number().int().nonnegative().max(1_000_000).default(0),
  events: z.array(previewDiagnosticEventSchema).min(1).max(PREVIEW_DIAGNOSTIC_LIMITS.maxEventsPerBatch),
});
export const previewDiagnosticsResponseSchema = z.object({
  events: z.array(previewDiagnosticEventSchema).max(500),
  dropped: z.number().int().nonnegative().default(0),
  logFile: z.string().max(255).nullable().default(null),
  retentionDays: z.number().int().min(1).max(7).default(7),
  truncated: z.boolean().default(false),
});

// Zeitlich begrenzte Rohdiagnose. Cookies und Authorization bleiben auch dann ausgeschlossen.
export const previewCaptureSessionRequestSchema = z.object({
  previewNodeId: z.string().min(1).max(120),
  durationMinutes: z.number().int().min(1).max(15).default(15),
});
export const previewCaptureSessionSchema = z.object({
  id: z.string().uuid(),
  previewNodeId: z.string().min(1).max(120),
  startedAt: isoDateSchema,
  expiresAt: isoDateSchema,
  active: z.boolean(),
});

// ── localStorage-Snapshots ─────────────────────────────────────────────────────
export const PREVIEW_STORAGE_LIMITS = {
  maxKeys: 1_000,
  maxBytes: 262_144,
  maxHistory: 3,
} as const;

export const previewLocalStorageEntrySchema = z.object({
  key: z.string().max(1_024),
  value: z.string().max(PREVIEW_STORAGE_LIMITS.maxBytes),
});
export const previewLocalStorageSnapshotSchema = z.object({
  storageProfileId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  keyCount: z.number().int().nonnegative().max(PREVIEW_STORAGE_LIMITS.maxKeys),
  byteCount: z.number().int().nonnegative().max(PREVIEW_STORAGE_LIMITS.maxBytes),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  bridgeVersion: z.string().min(1).max(40),
  // `unavailable`, wenn der Snapshot-Schlüssel fehlt oder wechselte.
  status: z.enum(["ready", "unavailable"]).default("ready"),
});
export const previewLocalStorageStateSchema = z.object({
  storageProfileId: z.string().uuid(),
  enabled: z.boolean().default(false),
  current: previewLocalStorageSnapshotSchema.nullable().default(null),
  history: z.array(previewLocalStorageSnapshotSchema).max(PREVIEW_STORAGE_LIMITS.maxHistory).default([]),
});
export const previewLocalStorageSnapshotRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative().nullable(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  bridgeVersion: z.string().min(1).max(40),
  entries: z.array(previewLocalStorageEntrySchema).max(PREVIEW_STORAGE_LIMITS.maxKeys),
});
export const previewLocalStorageRestoreRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
});
export const previewLocalStorageRestoreResponseSchema = z.object({
  snapshot: previewLocalStorageSnapshotSchema,
  entries: z.array(previewLocalStorageEntrySchema).max(PREVIEW_STORAGE_LIMITS.maxKeys),
});
export const previewLocalStorageConflictSchema = z.object({
  serverRevision: z.number().int().nonnegative(),
  serverHash: z.string().regex(/^[0-9a-f]{64}$/),
  serverKeyCount: z.number().int().nonnegative(),
  serverByteCount: z.number().int().nonnegative(),
});

// ── Reparatur ──────────────────────────────────────────────────────────────────
// Bewusst nur feste, validierte Aktionen. Shell, Dateisystem und Projektcode bleiben tabu.
export const previewRepairActionSchema = z.enum([
  "probe-services",
  "rebuild-suggestions",
  "renew-own-session",
  "release-own-session",
  "reset-slot-storage",
  "clear-quarantine",
]);
export const previewRepairRequestSchema = z.object({
  action: previewRepairActionSchema,
  projectId: z.string().min(1).max(160).nullable().default(null),
  sessionId: z.string().uuid().nullable().default(null),
  slotId: z.number().int().min(1).max(32).nullable().default(null),
  // Reset und Quarantäneaufhebung verlangen eine sichtbare Bestätigung im UI.
  confirmed: z.boolean().default(false),
});
export const previewRepairJobSchema = z.object({
  id: z.string().uuid(),
  action: previewRepairActionSchema,
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  startedAt: isoDateSchema,
  finishedAt: isoDateSchema.nullable().default(null),
  message: z.string().max(600),
  details: z.record(z.string().max(80), z.unknown()).default({}),
});

export const previewPathSchema = z.string().startsWith("/").max(4_096).refine(
  (value) => !value.startsWith("//") && !value.includes("\\") && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127),
  "Preview-Pfade müssen relative Root-Pfade ohne Backslashes oder Steuerzeichen sein.",
);

export const previewSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  url: z.url().nullable().default(null),
  targetPort: z.number().int().min(1).max(65_535).nullable().default(null),
  path: previewPathSchema.default("/"),
  mode: serviceModeSchema,
  runtime: z.enum(["iframe", "shared-browser"]).default("iframe"),
  dependencies: z.array(previewDependencySchema).max(11).default([]),
});

export const projectAvailabilitySchema = z.enum([
  "available",
  "missing",
  "inaccessible",
  "symlink",
]);

export const projectActivitySchema = z.object({
  lastWorkbenchUseAt: isoDateSchema.nullable(),
  lastFilesystemChangeAt: isoDateSchema.nullable(),
  lastGitCommitAt: isoDateSchema.nullable(),
  effectiveAt: isoDateSchema.nullable(),
});

export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  path: z.string().startsWith("/"),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  availability: projectAvailabilitySchema,
  activity: projectActivitySchema,
  previews: z.array(previewSchema),
  links: z.object({
    t3Code: z.url().nullable(),
    codeServer: z.url().nullable(),
  }),
});

export const projectsResponseSchema = z.object({
  projects: z.array(projectSchema),
  projectsRoot: z.string().startsWith("/"),
  recentLimit: z.number().int().min(3).max(20).default(8),
});
export const projectResponseSchema = z.object({ project: projectSchema });
export const projectActivityTouchResponseSchema = z.object({
  projectId: z.string().min(1),
  lastUsedAt: isoDateSchema,
});

export const filesystemEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  kind: z.enum(["directory", "file", "symlink", "other"]),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: isoDateSchema.nullable(),
  readable: z.boolean(),
});
export const filesystemTreeResponseSchema = z.object({
  root: z.string().startsWith("/"),
  path: z.string().startsWith("/"),
  entries: z.array(filesystemEntrySchema),
  nextCursor: z.string().min(1).nullable(),
});

// --- Dateimanager -----------------------------------------------------------
export const fileManagerViewModeSchema = z.enum(["list", "grid"]);
export const fileManagerSortKeySchema = z.enum(["name", "size", "modified"]);
export const fileManagerSortDirectionSchema = z.enum(["asc", "desc"]);

export const fileManagerStateSchema = z.object({
  currentPath: z.string().startsWith("/").max(4_096),
  history: z.array(z.string().startsWith("/").max(4_096)).max(30),
  favorites: z.array(z.string().startsWith("/").max(4_096)).max(50),
  viewMode: fileManagerViewModeSchema,
  sortKey: fileManagerSortKeySchema,
  sortDirection: fileManagerSortDirectionSchema,
});
export const fileManagerStateResponseSchema = z.object({
  document: fileManagerStateSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
});
export const saveFileManagerStateRequestSchema = z.object({
  document: fileManagerStateSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export const fileManagerTextPreviewResponseSchema = z.object({
  path: z.string().startsWith("/"),
  name: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  modifiedAt: isoDateSchema,
  mimeType: z.string().min(1),
  text: z.string().max(400_000),
  truncated: z.boolean(),
  lineCount: z.number().int().nonnegative(),
});

export const fileManagerRenameRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  name: z.string().trim().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..", "Ungültiger Dateiname."),
});
export const fileManagerMoveRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  targetDirectory: z.string().trim().min(1).max(4_096),
});
export const fileManagerDeleteRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  confirmed: z.boolean().refine((value) => value, "Löschen muss bestätigt werden."),
});
export const fileManagerMkdirRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  name: z.string().trim().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..", "Ungültiger Ordnername."),
});
export const fileManagerOperationResponseSchema = z.object({
  path: z.string().startsWith("/"),
  ok: z.literal(true),
});

export const fileManagerSearchResponseSchema = z.object({
  query: z.string().min(1).max(200),
  root: z.string().startsWith("/"),
  entries: z.array(filesystemEntrySchema).max(250),
  truncated: z.boolean(),
});
// --- KI-Skills (Skill-Editor) -----------------------------------------------
// Der Editor arbeitet direkt auf dem globalen Harness-Ordner. Skills liegen dort
// als Symlinks auf das Skills-Repository, deshalb tragen Baumeinträge eigene
// Kennzeichen für Verweis und kaputten Verweis.
export const skillNameSchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche.");

export const skillEditorFileSchema = z.object({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  kind: z.enum(["file", "directory"]),
  sizeBytes: z.number().int().nonnegative().nullable(),
  modifiedAt: isoDateSchema.nullable(),
  symlink: z.boolean(),
  broken: z.boolean(),
  editable: z.boolean(),
});
export const skillEditorNodeSchema = z.object({
  name: z.string().min(1),
  path: z.string().startsWith("/"),
  description: z.string().nullable(),
  modifiedAt: isoDateSchema.nullable(),
  symlink: z.boolean(),
  broken: z.boolean(),
  files: z.array(skillEditorFileSchema),
});
export const skillEditorTreeResponseSchema = z.object({
  rootDirectory: z.string().startsWith("/"),
  agentsFile: skillEditorFileSchema.nullable(),
  skills: z.array(skillEditorNodeSchema),
});
export const skillEditorRepositoryStatusSchema = z.object({
  branch: z.string(),
  dirtyCount: z.number().int().nonnegative(),
});
export const skillEditorStatusResponseSchema = z.object({
  rootDirectory: z.string().startsWith("/"),
  repositoryConfigured: z.boolean(),
  repository: skillEditorRepositoryStatusSchema.nullable(),
  propagationTargets: z.array(z.string().startsWith("/")),
  autosaveDebounceMs: z.number().int().min(500).max(15_000),
  maxFileBytes: z.number().int().positive(),
});
export const skillEditorReadResponseSchema = z.object({
  path: z.string().startsWith("/"),
  name: z.string().min(1),
  content: z.string(),
  modifiedAt: isoDateSchema,
  sizeBytes: z.number().int().nonnegative(),
});
export const skillEditorWriteRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
  content: z.string().max(2_097_152),
  expectedModifiedAt: isoDateSchema.nullable(),
});
export const skillEditorCreateRequestSchema = z.object({
  name: skillNameSchema,
  description: z.string().trim().min(1).max(1_024),
  license: z.string().trim().min(1).max(120).optional(),
});
export const skillEditorCreateResponseSchema = z.object({
  path: z.string().startsWith("/"),
  name: skillNameSchema,
  propagated: z.array(z.string().startsWith("/")),
  readmeUpdated: z.boolean(),
  notice: z.string().nullable(),
});
export const skillEditorRenameRequestSchema = z.object({
  name: skillNameSchema,
  newName: skillNameSchema,
});
export const skillEditorDeleteRequestSchema = z.object({ name: skillNameSchema });
export const skillEditorGitChangeSchema = z.object({
  name: z.string().min(1),
  action: z.enum(["hinzugefuegt", "geaendert", "entfernt"]),
});
export const skillEditorGitResponseSchema = z.object({
  committed: z.boolean(),
  pushed: z.boolean(),
  message: z.string().nullable(),
  changedSkills: z.array(skillEditorGitChangeSchema),
  errorTail: z.string().nullable(),
  notice: z.string().nullable(),
});

export const registerProjectRequestSchema = z.object({
  path: z.string().trim().min(1).max(4_096),
});
export const registerProjectResponseSchema = z.object({
  project: projectSchema,
  created: z.boolean(),
});

export const commandSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  command: z.string().min(1),
});
export const commandsResponseSchema = z.object({ commands: z.array(commandSchema) });

export const usageWindowSchema = z.object({
  id: z.enum(["primary", "secondary", "tertiary"]),
  label: z.string().min(1),
  usedPercent: z.number().min(0).max(100),
  remainingPercent: z.number().min(0).max(100),
  windowMinutes: z.number().int().positive().nullable(),
  resetsAt: isoDateSchema.nullable(),
});

export const accountUsageSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  email: z.string().email().nullable(),
  plan: z.string().min(1).nullable(),
  windows: z.array(usageWindowSchema),
});

export const providerUsageSchema = z.object({
  providerId: z.enum(["codex", "opencode", "claude"]),
  providerName: z.string().min(1),
  // `disabled` bedeutet: Die Limitüberwachung für diesen Anbieter ist über die
  // Einstellungen pauschal ausgeschaltet — kein Fehler, sondern eine bewusste Wahl.
  status: z.enum(["available", "partial", "unavailable", "disabled"]),
  updatedAt: isoDateSchema.nullable(),
  accounts: z.array(accountUsageSchema),
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
});

export const usageResponseSchema = z.object({
  providers: z.array(providerUsageSchema),
  fetchedAt: isoDateSchema,
  lastSuccessfulFetchAt: isoDateSchema.nullable(),
  cached: z.boolean(),
});

export const usageProviderIdSchema = z.enum(["codex", "opencode", "claude"]);
export const usageRangeSchema = z.enum(["7d", "30d", "90d", "365d", "all"]);

// Limitüberwachung je Werkzeug. Steht ein Anbieter auf false, werden seine
// Limitfenster weder abgerufen noch gespeichert und in der Oberfläche als
// deaktiviert ausgewiesen. Defaults: alle drei überwacht.
export const usageMonitoringSchema = z.object({
  codex: z.boolean().default(true),
  opencode: z.boolean().default(true),
  claude: z.boolean().default(true),
});
export const usageMonitoringResponseSchema = z.object({
  monitoring: usageMonitoringSchema,
});
export type UsageMonitoring = z.infer<typeof usageMonitoringSchema>;
export const usageDailyPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
});
export const usageBreakdownSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  totalTokens: z.number().int().nonnegative(),
  totalCost: z.number().nonnegative(),
  quality: z.enum(["exact", "derived", "unknown"]).default("exact"),
});
export const usageForecastSchema = z.object({
  providerId: usageProviderIdSchema,
  accountId: z.string().min(1),
  accountLabel: z.string().min(1),
  windowId: z.enum(["primary", "secondary", "tertiary"]),
  windowLabel: z.string().min(1),
  resetsAt: isoDateSchema,
  predictedUsedPercentAtReset: z.number().min(0),
  reachesLimitAt: isoDateSchema.nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  sampleCount: z.number().int().nonnegative(),
  message: z.string().min(1),
});
export const resetCreditSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  status: z.string().min(1),
  grantedAt: isoDateSchema.nullable(),
  expiresAt: isoDateSchema.nullable(),
});
export const usageDashboardResponseSchema = z.object({
  live: usageResponseSchema,
  range: usageRangeSchema,
  daily: z.array(usageDailyPointSchema),
  projects: z.array(usageBreakdownSchema),
  projectRange: z.union([z.literal("365d"), z.literal("all")]),
  models: z.array(usageBreakdownSchema),
  forecasts: z.array(usageForecastSchema),
  resetCredits: z.record(z.string(), z.array(resetCreditSchema)),
  totals: z.object({
    totalTokens: z.number().int().nonnegative(),
    totalCost: z.number().nonnegative(),
    todayTokens: z.number().int().nonnegative(),
    projected30DayTokens: z.number().int().nonnegative(),
    projected30DayCost: z.number().nonnegative(),
  }),
  historyStartedAt: isoDateSchema.nullable(),
});

export const managedAccountSchema = z.object({
  id: z.string().uuid(),
  provider: usageProviderIdSchema,
  label: z.string().trim().min(1).max(80),
  email: z.string().email().nullable(),
  profilePath: z.string().startsWith("/"),
  source: z.enum(["local", "login", "codexbar"]),
  enabled: z.boolean(),
  // Serverweit aktiver Account des Anbieters. Bei Codex ergibt sich der Wert aus dem
  // Symlink des gemeinsamen Codex-Homes, ist also immer der tatsächlich genutzte Stand.
  active: z.boolean().default(false),
  plan: z.string().min(1).nullable().default(null),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export const accountsResponseSchema = z.object({ accounts: z.array(managedAccountSchema) });
export const discoveredAccountSchema = z.object({
  accountId: z.string().uuid().nullable(),
  provider: usageProviderIdSchema,
  label: z.string().min(1),
  profilePath: z.string().startsWith("/"),
  registered: z.boolean(),
  authenticated: z.boolean(),
  enabled: z.boolean().nullable(),
  source: z.enum(["local", "login", "codexbar"]).nullable(),
  active: z.boolean().default(false),
  email: z.string().email().nullable().default(null),
  plan: z.string().min(1).nullable().default(null),
});
export const discoveredAccountsResponseSchema = z.object({ accounts: z.array(discoveredAccountSchema) });
export const createAccountRequestSchema = z.object({
  provider: usageProviderIdSchema,
  label: z.string().trim().min(1).max(80),
  profilePath: z.string().startsWith("/").optional(),
  source: z.enum(["local", "login"]).default("local"),
});
export const updateAccountRequestSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0);
export const accountResponseSchema = z.object({ account: managedAccountSchema });
export const activateAccountResponseSchema = z.object({
  account: managedAccountSchema,
  // Gesetzt, wenn beim Umschalten eine noch reguläre Anmeldedatei aus dem gemeinsamen
  // Home in einen Anmeldespeicher übernommen oder beiseitegelegt wurde.
  adoptedInto: z.string().startsWith("/").nullable(),
  backupPath: z.string().startsWith("/").nullable(),
  // Gesetzt, wenn der Account bisher direkt auf das gemeinsame Home zeigte und dafür
  // einen eigenen Anmeldespeicher bekommen hat.
  migratedTo: z.string().startsWith("/").nullable().default(null),
});
export const loginSessionResponseSchema = z.object({
  account: managedAccountSchema,
  terminalKind: z.enum(["codex", "opencode", "claude"]),
  command: z.string().min(1),
});

// Timeline-Lane für die Multi-Account-Limitübersicht. Jede Lane steht für genau
// einen Account eines Providers. Die Limitfenster nutzen die bestehende
// UsageWindow-Struktur unverändert, damit es kein zweites Fenstermodell gibt.
export const usageTimelineStatusSchema = z.enum(["available", "partial", "stale", "unavailable", "disabled"]);
export const usageTimelineLaneSchema = z.object({
  providerId: usageProviderIdSchema,
  // ManagedAccount-ID oder bei reinen CodexBar-Daten ein deterministischer Hash
  // aus Provider, Profilpfad, Label und E-Mail — niemals positionsabhängig.
  accountId: z.string().min(1),
  accountLabel: z.string().min(1),
  email: z.string().email().nullable(),
  plan: z.string().min(1).nullable(),
  active: z.boolean(),
  windows: z.array(usageWindowSchema),
  resetCredits: z.array(resetCreditSchema),
  status: usageTimelineStatusSchema,
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
  updatedAt: isoDateSchema.nullable(),
});
export const usageTimelineResponseSchema = z.object({
  lanes: z.array(usageTimelineLaneSchema),
  fetchedAt: isoDateSchema,
  lastSuccessfulFetchAt: isoDateSchema.nullable(),
});

export const usageSyncStatusSchema = z.object({
  running: z.boolean(),
  lastCompletedAt: isoDateSchema.nullable(),
});
export type UsageSyncStatus = z.infer<typeof usageSyncStatusSchema>;

export const WORKBENCH_LIMITS = {
  maxResidentTools: 10,
  maxVisibleGroups: 4,
  maxWorkspaces: 8,
  // Geparkte Routen im Browser (PersistentOutlet). Zehn decken jeden üblichen
  // Wechsel ab, ohne dass beliebig viele iframes und WebSockets offen bleiben.
  maxCachedRoutes: 10,
} as const;

export const terminalKindSchema = z.enum(["shell", "codex", "opencode", "claude"]);
export const terminalSessionStatusSchema = z.enum(["starting", "running", "exited", "interrupted", "closed"]);
export const terminalSessionSchema = z.object({
  id: z.string().uuid(),
  runtimeId: z.string().uuid(),
  kind: terminalKindSchema,
  mode: z.enum(["agent", "login"]),
  projectId: z.string().nullable(),
  cwd: z.string().startsWith("/"),
  pid: z.number().int().nonnegative(),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(1).max(300),
  status: terminalSessionStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  exitCode: z.number().int().nullable(),
  exitSignal: z.number().int().nullable(),
  supervisor: z.enum(["tmux", "direct"]),
  managed: z.boolean(),
  connectedClients: z.number().int().nonnegative(),
});
export const terminalSessionsResponseSchema = z.object({ sessions: z.array(terminalSessionSchema), updatedAt: isoDateSchema });
export const terminalTabSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().nullable(),
  kind: terminalKindSchema,
  initialCwd: z.string().startsWith("/").nullable().default(null),
});
const canonicalTerminalAreaSchema = z.object({
  id: z.string().min(1).max(160),
  tabs: z.array(terminalTabSchema).max(12),
  activeTabId: z.string().uuid().nullable(),
  splitTabIds: z.tuple([z.string().uuid(), z.string().uuid()]).nullable(),
  splitSizes: z.tuple([z.number().min(20).max(80), z.number().min(20).max(80)]),
});
export const terminalAreaSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || "splitTabIds" in input) return input;
  const legacy = input as { activeTabId?: unknown; splitTabId?: unknown };
  const activeTabId = typeof legacy.activeTabId === "string" ? legacy.activeTabId : null;
  const splitTabId = typeof legacy.splitTabId === "string" ? legacy.splitTabId : null;
  return {
    ...input,
    splitTabIds: activeTabId && splitTabId && activeTabId !== splitTabId
      ? [activeTabId, splitTabId]
      : null,
  };
}, canonicalTerminalAreaSchema);
export const terminalWorkspaceSchema = z.object({
  version: z.literal(1),
  areas: z.record(z.string(), terminalAreaSchema),
}).superRefine((workspace, context) => {
  const tabIds = new Set<string>();
  for (const [areaKey, area] of Object.entries(workspace.areas)) {
    if (area.id !== areaKey) {
      context.addIssue({ code: "custom", path: ["areas", areaKey, "id"], message: "Bereichsschlüssel und Bereichs-ID müssen übereinstimmen." });
    }
    const ownIds = new Set<string>();
    for (const tab of area.tabs) {
      if (ownIds.has(tab.id) || tabIds.has(tab.id)) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "tabs"], message: "Terminal-Tab-IDs müssen global eindeutig sein." });
      }
      ownIds.add(tab.id);
      tabIds.add(tab.id);
    }
    if (area.activeTabId !== null && !ownIds.has(area.activeTabId)) {
      context.addIssue({ code: "custom", path: ["areas", areaKey, "activeTabId"], message: "Der aktive Tab gehört nicht zu diesem Bereich." });
    }
    if (area.splitTabIds !== null) {
      if (area.splitTabIds[0] === area.splitTabIds[1]) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "splitTabIds"], message: "Die beiden Terminal-Panes müssen verschieden sein." });
      }
      if (!area.splitTabIds.every((tabId) => ownIds.has(tabId))) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "splitTabIds"], message: "Ein geteilter Tab gehört nicht zu diesem Bereich." });
      }
      if (area.activeTabId !== null && !area.splitTabIds.includes(area.activeTabId)) {
        context.addIssue({ code: "custom", path: ["areas", areaKey, "activeTabId"], message: "Der fokussierte Tab muss in einem sichtbaren Pane liegen." });
      }
    }
    if (Math.abs(area.splitSizes[0] + area.splitSizes[1] - 100) > 0.5) {
      context.addIssue({ code: "custom", path: ["areas", areaKey, "splitSizes"], message: "Die Splitgrößen müssen zusammen 100 ergeben." });
    }
  }
});
export const terminalWorkspaceResponseSchema = z.object({
  document: terminalWorkspaceSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
});
export const saveTerminalWorkspaceRequestSchema = z.object({
  document: terminalWorkspaceSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});
// `notion` bleibt als lesbarer Legacy-Typ erhalten. Neue Knoten werden dafür
// nicht mehr angeboten, bestehende Arbeitsflächen dürfen ihn aber nie verlieren.
export const panelTypeSchema = z.enum(["t3-code", "code-server", "preview", "browser", "terminal", "codex", "opencode", "files", "hermes", "notion"]);
export const panelSchema = z.object({
  id: z.string().min(1),
  type: panelTypeSchema,
  projectId: z.string().nullable(),
  previewId: z.string().nullable(),
  reloadKey: z.number().int().nonnegative(),
  // Wird nur für Browser-Aufrufe aus eingebetteten Werkzeugen gesetzt.
  // Optional, damit bestehende gespeicherte Arbeitsflächen kompatibel bleiben.
  browserUrl: z.string().trim().min(1).max(2_048).optional(),
  // Tiefenlink-Ziel für T3-Panels: Pfad hinter dem Proxy-Präfix `/t3`,
  // z. B. `/umgebung/thread`. Optional, damit gespeicherte Arbeitsflächen
  // kompatibel bleiben. Leer steht für die T3-Startseite.
  t3Path: z.string().startsWith("/").max(512).optional(),
  // Zielordner für Code-Server-Panels, die aus eingebetteten Werkzeugen
  // (z. B. dem T3-„Open in VS Code"-Button) geöffnet werden. Ohne Wert öffnet
  // das Panel wie bisher das Projektverzeichnis. Optional, damit gespeicherte
  // Arbeitsflächen kompatibel bleiben.
  codeServerFolder: z.string().startsWith("/").min(1).max(2_048).optional(),
  // Der interne Pfad der offiziellen Hermes-SPA bleibt optional, damit alte
  // localStorage-Dokumente ohne Migration weiter gültig sind.
  hermesAdminPath: z.string().startsWith("/").max(512).optional(),
});

export const hermesServiceStateSchema = z.enum(["active", "inactive", "failed", "activating", "unknown"]);
export const hermesUpdateResultSchema = z.enum(["success", "failed", "deferred", "none"]);
export const hermesSessionSourceSchema = z.enum(["web", "cli", "telegram", "cron", "acp", "other"]);
export const hermesSessionStatusSchema = z.enum(["idle", "running", "failed", "unknown"]);
export const hermesStatusSchema = z.object({
  enabled: z.boolean(),
  installed: z.boolean(),
  reachable: z.boolean(),
  version: z.string().nullable(),
  commit: z.string().max(40).nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  dashboard: z.object({
    state: hermesServiceStateSchema,
    reachable: z.boolean(),
    url: z.string().nullable(),
  }),
  gateway: z.object({
    state: hermesServiceStateSchema,
    telegramConnected: z.boolean().nullable(),
    lastError: z.string().max(500).nullable(),
  }),
  chat: z.object({
    transport: z.enum(["acp", "unavailable"]),
    ready: z.boolean(),
    activeSessions: z.number().int().nonnegative(),
  }),
  update: z.object({
    available: z.boolean(),
    pending: z.boolean(),
    running: z.boolean(),
    currentVersion: z.string().nullable(),
    latestVersion: z.string().nullable(),
    lastCheckedAt: isoDateSchema.nullable(),
    lastUpdatedAt: isoDateSchema.nullable(),
    lastResult: hermesUpdateResultSchema,
  }),
  checkedAt: isoDateSchema,
});

export const hermesSessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(200),
  source: hermesSessionSourceSchema,
  model: z.string().nullable(),
  provider: z.string().nullable(),
  cwd: z.string().nullable(),
  projectId: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema.nullable(),
  updatedAt: isoDateSchema.nullable(),
  status: hermesSessionStatusSchema,
});
export const hermesSessionsResponseSchema = z.object({
  sessions: z.array(hermesSessionSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative().optional(),
});
export const hermesTaskSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  title: z.string().max(200),
  source: hermesSessionSourceSchema,
  model: z.string().nullable(),
  startedAt: isoDateSchema,
  runtimeSeconds: z.number().int().nonnegative(),
  cancellable: z.boolean(),
});
export const hermesTasksResponseSchema = z.object({ tasks: z.array(hermesTaskSchema) });
export const hermesResultSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  source: hermesSessionSourceSchema,
  status: z.enum(["success", "failed"]),
  title: z.string().max(200),
  preview: z.string().max(400),
  finishedAt: isoDateSchema,
  cronJobId: z.string().nullable(),
});
export const hermesResultsResponseSchema = z.object({
  results: z.array(hermesResultSchema),
  nextCursor: z.string().nullable(),
});
export const hermesCronJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  schedule: z.string().max(120),
  enabled: z.boolean(),
  nextRunAt: isoDateSchema.nullable(),
  lastRunAt: isoDateSchema.nullable(),
  lastStatus: z.enum(["success", "failed", "running", "unknown"]),
  adminPath: z.string().startsWith("/"),
});
export const hermesCronResponseSchema = z.object({ jobs: z.array(hermesCronJobSchema) });
export const hermesModelSchema = z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(200), provider: z.string().max(120).nullable(), active: z.boolean() });
export const hermesModelsResponseSchema = z.object({ models: z.array(hermesModelSchema), current: hermesModelSchema.nullable() });

export const hermesToolKindSchema = z.enum(["terminal", "edit", "read", "search", "browser", "other"]);
export const hermesToolStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export const hermesToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160),
  kind: hermesToolKindSchema,
  status: hermesToolStatusSchema,
  title: z.string().max(240),
  arguments: z.record(z.string(), z.unknown()).nullable(),
  result: z.string().max(8_192).nullable(),
  command: z.string().max(8_192).nullable(),
  cwd: z.string().max(2_048).nullable(),
  exitCode: z.number().int().nullable(),
  startedAt: isoDateSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  truncated: z.boolean(),
});
export const hermesMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(200_000),
  toolCalls: z.array(hermesToolCallSchema).default([]),
  createdAt: isoDateSchema,
  truncated: z.boolean().default(false),
});
export const hermesApprovalSchema = z.object({
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  toolCallId: z.string().min(1).nullable(),
  title: z.string().max(240),
  description: z.string().max(2_000),
  command: z.string().max(8_192).nullable(),
  risk: z.enum(["low", "medium", "high"]),
  options: z.array(z.enum(["allow_once", "allow_session", "deny"])).min(1),
  expiresAt: isoDateSchema,
});
export const hermesSlashCommandSchema = z.object({ name: z.string().min(1).max(80), description: z.string().max(240), inputHint: z.string().max(160).nullable() });
export const hermesUsageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), totalTokens: z.number().int().nonnegative(), contextSize: z.number().int().nonnegative().nullable() });
export const hermesErrorCodeSchema = z.enum([
  "HERMES_DISABLED", "HERMES_NOT_INSTALLED", "DASHBOARD_UNREACHABLE", "ACP_UNAVAILABLE", "ACP_CRASHED",
  "SESSION_NOT_FOUND", "SESSION_BUSY", "PROJECT_NOT_FOUND", "PROJECT_FORBIDDEN", "APPROVAL_EXPIRED",
  "RATE_LIMITED", "UPDATE_RUNNING", "INVALID_MESSAGE", "INTERNAL_ERROR",
]);
export const HERMES_CHAT_PROTOCOL_VERSION = 1 as const;
export const hermesClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("session.create"), projectId: z.string().nullable(), title: z.string().max(200).optional() }),
  z.object({ v: z.literal(1), type: z.literal("session.attach"), sessionId: z.string().min(1) }),
  z.object({ v: z.literal(1), type: z.literal("session.detach") }),
  z.object({ v: z.literal(1), type: z.literal("message.send"), sessionId: z.string().min(1), clientMessageId: z.uuid(), content: z.string().min(1).max(200_000) }),
  z.object({ v: z.literal(1), type: z.literal("task.cancel"), sessionId: z.string().min(1) }),
  z.object({ v: z.literal(1), type: z.literal("approval.respond"), requestId: z.string().min(1), option: z.enum(["allow_once", "allow_session", "deny"]) }),
  z.object({ v: z.literal(1), type: z.literal("model.set"), sessionId: z.string().min(1), model: z.string().min(1).max(200) }),
  z.object({ v: z.literal(1), type: z.literal("ping") }),
]);
export const hermesServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ v: z.literal(1), type: z.literal("session.ready"), session: hermesSessionSchema, replayComplete: z.boolean() }),
  z.object({ v: z.literal(1), type: z.literal("message.appended"), sessionId: z.string(), message: hermesMessageSchema }),
  z.object({ v: z.literal(1), type: z.literal("message.delta"), sessionId: z.string(), messageId: z.string(), delta: z.string() }),
  z.object({ v: z.literal(1), type: z.literal("message.complete"), sessionId: z.string(), message: hermesMessageSchema }),
  z.object({ v: z.literal(1), type: z.literal("thought.delta"), sessionId: z.string(), delta: z.string() }),
  z.object({ v: z.literal(1), type: z.literal("tool.update"), sessionId: z.string(), toolCall: hermesToolCallSchema }),
  z.object({ v: z.literal(1), type: z.literal("approval.requested"), request: hermesApprovalSchema }),
  z.object({ v: z.literal(1), type: z.literal("approval.resolved"), requestId: z.string(), option: z.string(), reason: z.enum(["answered", "expired", "cancelled"]) }),
  z.object({ v: z.literal(1), type: z.literal("commands.available"), sessionId: z.string(), commands: z.array(hermesSlashCommandSchema) }),
  z.object({ v: z.literal(1), type: z.literal("task.state"), sessionId: z.string(), state: z.enum(["idle", "running", "cancelling"]) }),
  z.object({ v: z.literal(1), type: z.literal("usage"), sessionId: z.string(), usage: hermesUsageSchema }),
  z.object({ v: z.literal(1), type: z.literal("error"), code: hermesErrorCodeSchema, message: z.string().max(500), sessionId: z.string().nullable() }),
  z.object({ v: z.literal(1), type: z.literal("pong") }),
]);
export const hermesServiceActionRequestSchema = z.object({ target: z.enum(["dashboard", "gateway"]), action: z.enum(["start", "stop", "restart"]) });
export const hermesDiagnosticSchema = z.object({ id: z.string().min(1), label: z.string().min(1), status: z.enum(["ok", "warn", "fail", "skipped"]), detail: z.string().max(500), hint: z.string().max(500) });
export const hermesDiagnosticsResponseSchema = z.object({ checkedAt: isoDateSchema, items: z.array(hermesDiagnosticSchema) });
export const hermesUpdateStateSchema = z.object({
  phase: z.enum(["idle", "checking", "pending", "running", "succeeded", "failed"]),
  pending: z.boolean(), lastCheckedAt: isoDateSchema.nullable(), lastStartedAt: isoDateSchema.nullable(), lastFinishedAt: isoDateSchema.nullable(),
  lastResult: hermesUpdateResultSchema, previousVersion: z.string().nullable(), previousCommit: z.string().max(40).nullable(),
  newVersion: z.string().nullable(), newCommit: z.string().max(40).nullable(), deferredSince: isoDateSchema.nullable(),
  lastFullBackupAt: isoDateSchema.nullable(), logTail: z.array(z.string().max(500)).max(40),
});
export const notificationCategorySchema = z.enum(["hermes", "coding-agent", "terminal"]);
export const notificationSourceIconSchema = z.enum(["t3", "hermes", "opencode", "codex", "claude", "terminal", "workbench"]);
export const notificationSourceSchema = z.enum(["hermes", "t3", "opencode", "codex", "claude", "terminal", "workbench", "update"]);
export const notificationSeveritySchema = z.enum(["info", "success", "warning", "error"]);
export const notificationStateSchema = z.enum(["active", "resolved", "dismissed"]);
export const notificationReportSchema = z.object({
  message: z.string().min(1).max(4_000),
  stack: z.string().max(20_000).nullable().default(null),
  context: z.record(z.string(), z.string().max(2_000)).default({}),
  logs: z.array(z.string().max(2_000)).max(100).default([]),
  environment: z.record(z.string(), z.string().max(2_000)).default({}),
});
export const notificationSchema = z.object({
  id: z.uuid(), source: notificationSourceSchema, kind: z.string().min(1).max(64), severity: notificationSeveritySchema,
  category: notificationCategorySchema, sourceIcon: notificationSourceIconSchema, state: notificationStateSchema,
  title: z.string().min(1).max(200), body: z.string().max(1_000), link: z.string().startsWith("/").max(512).nullable(),
  remoteId: z.string().max(200).nullable(), createdAt: isoDateSchema, readAt: isoDateSchema.nullable(), acknowledgedAt: isoDateSchema.nullable(),
  deletedAt: isoDateSchema.nullable(), resolvedAt: isoDateSchema.nullable(),
  meta: z.record(z.string(), z.unknown()), report: notificationReportSchema.nullable(),
});
export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema), unreadCount: z.number().int().nonnegative(),
  unacknowledgedErrorCount: z.number().int().nonnegative(), nextCursor: z.string().nullable(),
});
export const notificationPatchSchema = z.object({ read: z.boolean().optional(), acknowledged: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);
export const notificationPresenceItemSchema = z.object({
  source: notificationSourceSchema,
  threadId: z.string().max(200).nullish(),
  sessionId: z.string().max(200).nullish(),
});
// Mehrere gleichzeitig sichtbare Chat-Ansichten (aktive Route plus offene
// Panels). Nur Einträge mit Referenz (threadId/sessionId) wirken auf Inbox
// und Push; eine Quelle ohne Referenz passt zu keiner Benachrichtigung.
export const notificationPresenceSchema = z.array(notificationPresenceItemSchema).max(32);
// Der Server akzeptiert weiterhin die frühere Einzel-Form, damit alte Browser
// die Presence ohne Neuladen melden können.
export const notificationPresenceInputSchema = z.union([notificationPresenceSchema, notificationPresenceItemSchema]).nullable();
export const notificationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notification.created"), notification: notificationSchema }),
  z.object({ type: z.literal("notification.updated"), notification: notificationSchema }),
  z.object({ type: z.literal("notification.removed"), id: z.uuid() }),
  z.object({ type: z.literal("notification.sync") }),
]);
export const notificationSourcePreferencesSchema = z.object({ toast: z.boolean().default(true), push: z.boolean().default(false) });
export const notificationPreferencesSchema = z.object({
  toastsEnabled: z.boolean().default(true),
  pushEnabled: z.boolean().default(false),
  sources: z.object({
    hermes: notificationSourcePreferencesSchema.prefault({ toast: false, push: false }),
    t3: notificationSourcePreferencesSchema.prefault({ toast: true, push: true }),
    opencode: notificationSourcePreferencesSchema.prefault({ toast: true, push: false }),
    codex: notificationSourcePreferencesSchema.prefault({ toast: true, push: false }),
    claude: notificationSourcePreferencesSchema.prefault({ toast: true, push: false }),
    terminal: notificationSourcePreferencesSchema.prefault({ toast: true, push: false }),
    workbench: notificationSourcePreferencesSchema.prefault({ toast: true, push: true }),
    update: notificationSourcePreferencesSchema.prefault({ toast: false, push: false }),
  }).prefault({}),
});
export const notificationSettingsResponseSchema = z.object({
  preferences: notificationPreferencesSchema,
  pushSupported: z.boolean(),
  vapidPublicKey: z.string().nullable(),
  subscriptionCount: z.number().int().nonnegative(),
  serverPushEnabled: z.boolean(),
});
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2_048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});
export const pushSubscriptionRegistrationSchema = pushSubscriptionSchema.extend({
  deviceName: z.string().trim().min(1).max(80).optional(),
  platform: z.string().trim().min(1).max(80).optional(),
  userAgent: z.string().trim().min(1).max(512).optional(),
});
export const pushEndpointRequestSchema = z.object({ endpoint: z.url().max(2_048) });
export const pushSubscriptionResponseSchema = z.object({
  registered: z.literal(true),
  subscriptionCount: z.number().int().positive(),
});
export const pushTestResponseSchema = z.object({ sent: z.literal(true) });
export const notificationPushPayloadSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  title: z.string().min(1).max(200),
  body: z.string().max(1_000),
  link: z.string().startsWith("/").max(512),
  source: notificationSourceSchema,
  severity: notificationSeveritySchema,
  createdAt: isoDateSchema,
});

export const workbenchGroupSchema = z.object({
  id: z.string().min(1),
  panelIds: z.array(z.string().min(1)).max(WORKBENCH_LIMITS.maxResidentTools),
  activePanelId: z.string().nullable(),
});

export const workbenchLayoutSchema = z.enum(["single", "columns", "rows", "main-left", "grid"]);

export const workbenchPageSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(48),
  groups: z.array(workbenchGroupSchema).min(1).max(WORKBENCH_LIMITS.maxVisibleGroups),
  focusedGroupId: z.string().min(1),
  layout: workbenchLayoutSchema,
  layoutSizes: z.record(
    z.string(),
    z.tuple([z.number().min(10).max(90), z.number().min(10).max(90)]),
  ),
});

export const workspaceSchema = z
  .object({
    version: z.literal(3),
    selectedProjectId: z.string().nullable(),
    panels: z.array(panelSchema).max(WORKBENCH_LIMITS.maxResidentTools),
    workspaces: z.array(workbenchPageSchema).min(1).max(WORKBENCH_LIMITS.maxWorkspaces),
    activeWorkspaceId: z.string().min(1),
    maximizedPanelId: z.string().nullable(),
    focusedPanelId: z.string().nullable(),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.panels.map((panel) => panel.id));
    if (ids.size !== value.panels.length) {
      context.addIssue({ code: "custom", message: "Panel IDs müssen eindeutig sein." });
    }
    if (value.maximizedPanelId !== null && !ids.has(value.maximizedPanelId)) {
      context.addIssue({ code: "custom", message: "Maximiertes Panel ist nicht geöffnet." });
    }
    if (value.focusedPanelId !== null && !ids.has(value.focusedPanelId)) {
      context.addIssue({ code: "custom", message: "Fokussiertes Panel ist nicht geöffnet." });
    }

    const workspaceIds = new Set(value.workspaces.map((workspace) => workspace.id));
    if (workspaceIds.size !== value.workspaces.length || !workspaceIds.has(value.activeWorkspaceId)) {
      context.addIssue({ code: "custom", message: "Arbeitsflächen müssen eindeutig sein und eine aktive Fläche besitzen." });
    }

    const assignedPanelIds = new Set<string>();
    const groupIds = new Set<string>();
    for (const workspace of value.workspaces) {
      const ownGroupIds = new Set(workspace.groups.map((group) => group.id));
      if (!ownGroupIds.has(workspace.focusedGroupId)) {
        context.addIssue({ code: "custom", message: "Die fokussierte Gruppe gehört nicht zur Arbeitsfläche." });
      }
      for (const group of workspace.groups) {
        if (groupIds.has(group.id)) {
          context.addIssue({ code: "custom", message: "Gruppen-IDs müssen eindeutig sein." });
        }
        groupIds.add(group.id);
        if (group.activePanelId !== null && !group.panelIds.includes(group.activePanelId)) {
          context.addIssue({ code: "custom", message: "Der aktive Tab gehört nicht zu seiner Gruppe." });
        }
        for (const panelId of group.panelIds) {
          if (!ids.has(panelId) || assignedPanelIds.has(panelId)) {
            context.addIssue({ code: "custom", message: "Jedes Panel muss genau einer Gruppe zugeordnet sein." });
          }
          assignedPanelIds.add(panelId);
        }
      }
      for (const sizes of Object.values(workspace.layoutSizes)) {
        if (Math.abs(sizes[0] + sizes[1] - 100) > 0.5) {
          context.addIssue({ code: "custom", message: "Gespeicherte Panelgrößen müssen zusammen 100 ergeben." });
        }
      }
    }
    if (assignedPanelIds.size !== ids.size) {
      context.addIssue({ code: "custom", message: "Alle Panels müssen einer Arbeitsfläche zugeordnet sein." });
    }
  });

export const ORBIT_LIMITS = {
  maxBoards: 8,
  maxNodesPerBoard: 600,
  maxEdgesPerBoard: 1_200,
  maxToolNodesPerBoard: 96,
  maxDocumentBytes: 4 * 1024 * 1024,
} as const;

// Gemeinsame Grenzen für die sichtbare Orbit-Geometrie. UI und API müssen dieselbe
// Obergrenze verwenden, damit große Arbeitsflächen nicht erst lokal funktionieren
// und anschließend beim Autosave abgelehnt werden.
export const ORBIT_SIZE_LIMITS = {
  minWidth: 160,
  minHeight: 96,
  maxWidth: 20_000,
  maxHeight: 20_000,
} as const;

export const ORBIT_ASSET_LIMITS = {
  maxFileBytes: 100 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024 * 1024,
} as const;

export const orbitNodeTypeSchema = z.enum([
  "project",
  "tool",
  "previewGroup",
  "previewSlot",
  "note",
  "todo",
  "snippet",
  "file",
  "asset",
  "gallery",
  "fileGallery",
  "frame",
  "usage",
  "hermesStatus",
  "hermesTasks",
  "hermesCron",
  "hermesResults",
  "extension",
]);
export const orbitEdgeKindSchema = z.enum(["project", "manual", "runtime"]);
export const orbitPointSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});
export const orbitSizeSchema = z.object({
  width: z.number().finite().min(ORBIT_SIZE_LIMITS.minWidth).max(ORBIT_SIZE_LIMITS.maxWidth),
  height: z.number().finite().min(ORBIT_SIZE_LIMITS.minHeight).max(ORBIT_SIZE_LIMITS.maxHeight),
});
export const orbitBoundsSchema = z.object({
  minX: z.number().finite().min(-100_000).max(100_000),
  minY: z.number().finite().min(-100_000).max(100_000),
  maxX: z.number().finite().min(-100_000).max(100_000),
  maxY: z.number().finite().min(-100_000).max(100_000),
}).refine((bounds) => bounds.maxX > bounds.minX && bounds.maxY > bounds.minY, {
  message: "Orbit-Grenzen müssen eine positive Fläche bilden.",
});

export const orbitNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: orbitNodeTypeSchema,
  title: z.string().trim().min(1).max(120),
  position: orbitPointSchema,
  size: orbitSizeSchema,
  projectId: z.string().max(120).nullable(),
  parentId: z.string().max(100).nullable(),
  runtimeId: z.string().max(100).nullable(),
  toolType: panelTypeSchema.nullable(),
  previewId: z.string().max(120).nullable(),
  previewLayout: z.enum(["1", "2", "3", "6"]).nullable().default(null),
  previewTarget: z.string().max(4_096).nullable().default(null),
  previewPath: previewPathSchema.default("/"),
  // `null` bedeutet ab Orbit v7 „Benutzerpräferenz verwenden“; ein expliziter Wert
  // bleibt slotgebunden. Dokumente bis v6 werden beim Laden auf "responsive" gehoben.
  previewDeviceId: z.string().max(80).nullable().default(null),
  previewOrientation: z.enum(["portrait", "landscape"]).default("portrait"),
  previewSlotId: z.number().int().min(1).max(32).nullable().default(null),
  // Stabile Storage-Identität eines Preview-Slots. Sie entscheidet serverseitig, ob eine
  // Slot-Origin ohne Reset wiederverwendet werden darf.
  previewStorageProfileId: z.string().uuid().nullable().default(null),
  previewIsolation: z.boolean().default(true),
  previewRuntime: z.enum(["iframe", "shared-browser"]).default("iframe"),
  previewReferenceId: z.string().max(100).nullable().default(null),
  previewLastUsedAt: isoDateSchema.nullable().default(null),
  assetId: z.string().uuid().nullable().default(null),
  assetMimeType: z.string().max(160).nullable().default(null),
  assetBytes: z.number().int().nonnegative().nullable().default(null),
  provider: usageProviderIdSchema.nullable(),
  content: z.string().max(200_000),
  language: z.string().trim().max(40).nullable(),
  // Selbst gewählte Farbe (Hex). null = automatische Farbe aus der Projekt-ID.
  // Färbt den Knoten und die von ihm ausgehenden Verbindungen.
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  hermesSourceFilter: z.enum(["all", "web", "telegram", "cron"]).default("all"),
  hermesStatusFilter: z.enum(["all", "success", "failed"]).default("all"),
  // Generischer Extension-Knoten (Phase 4): Extension- und Contribution-ID
  // bilden die Identität, der State bleibt vollständig erhalten, auch wenn
  // der Code fehlt oder deaktiviert ist.
  extensionId: z.string().max(128).nullable().default(null),
  contributionId: z.string().max(192).nullable().default(null),
  stateVersion: z.number().int().positive().nullable().default(null),
  state: z.record(z.string(), z.unknown()).default({}),
  locked: z.boolean(),
  zIndex: z.number().int().min(0).max(10_000),
}).superRefine((node, context) => {
  if (node.type === "tool" && node.toolType === null) {
    context.addIssue({ code: "custom", message: "Werkzeugknoten benötigen einen Werkzeugtyp." });
  }
  if (node.type !== "tool" && node.toolType !== null) {
    context.addIssue({ code: "custom", message: "Nur Werkzeugknoten dürfen einen Werkzeugtyp besitzen." });
  }
  if (node.type === "usage" && node.provider === null) {
    context.addIssue({ code: "custom", message: "Nutzungsknoten benötigen einen Provider." });
  }
  if (node.type === "extension" && (node.extensionId === null || node.contributionId === null || node.stateVersion === null)) {
    context.addIssue({ code: "custom", message: "Extension-Knoten benötigen Extension-ID, Contribution-ID und State-Version." });
  }
  if (node.type !== "extension" && (node.extensionId !== null || node.contributionId !== null || node.stateVersion !== null)) {
    context.addIssue({ code: "custom", message: "Nur Extension-Knoten dürfen Extension-Metadaten besitzen." });
  }
  if (node.type === "asset" && (node.assetId === null || node.assetMimeType === null || node.assetBytes === null)) {
    context.addIssue({ code: "custom", message: "Medienknoten benötigen vollständige Asset-Metadaten." });
  }
  if (node.type !== "asset" && (node.assetId !== null || node.assetMimeType !== null || node.assetBytes !== null)) {
    context.addIssue({ code: "custom", message: "Nur Medienknoten dürfen Asset-Metadaten besitzen." });
  }
  if (node.hermesSourceFilter !== "all" && node.type !== "hermesTasks" && node.type !== "hermesResults") {
    context.addIssue({ code: "custom", path: ["hermesSourceFilter"], message: "Die Hermes-Quellenfilter gehören nur zu Hermes-Aufgaben oder -Ergebnissen." });
  }
  if (node.hermesStatusFilter !== "all" && node.type !== "hermesResults") {
    context.addIssue({ code: "custom", path: ["hermesStatusFilter"], message: "Der Hermes-Statusfilter gehört nur zu Hermes-Ergebnissen." });
  }
});

export const orbitEdgeSchema = z.object({
  id: z.string().min(1).max(100),
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  kind: orbitEdgeKindSchema,
  label: z.string().trim().max(80).nullable(),
  sourceSide: z.enum(["left", "right"]).nullable().default(null),
  targetSide: z.enum(["left", "right"]).nullable().default(null),
  waypoints: z.array(orbitPointSchema).max(32).default([]),
});

export const orbitBoardSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(80),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().min(0.1).max(2.5),
  }),
  worldBounds: orbitBoundsSchema,
  nodes: z.array(orbitNodeSchema).max(ORBIT_LIMITS.maxNodesPerBoard),
  edges: z.array(orbitEdgeSchema).max(ORBIT_LIMITS.maxEdgesPerBoard),
}).superRefine((board, context) => {
  const nodeIds = new Set(board.nodes.map((node) => node.id));
  if (nodeIds.size !== board.nodes.length) {
    context.addIssue({ code: "custom", message: "Orbit-Knoten-IDs müssen eindeutig sein." });
  }
  if (board.nodes.filter((node) => node.type === "tool").length > ORBIT_LIMITS.maxToolNodesPerBoard) {
    context.addIssue({ code: "custom", message: "Zu viele Werkzeugknoten auf einer Arbeitsfläche." });
  }
  const edgeIds = new Set<string>();
  for (const edge of board.edges) {
    if (edgeIds.has(edge.id) || !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target) {
      context.addIssue({ code: "custom", message: "Orbit-Verbindungen müssen eindeutig und vollständig sein." });
    }
    edgeIds.add(edge.id);
  }
});

export const ORBIT_DOCUMENT_VERSION = 8;

export const orbitWorkspaceSchema = z.object({
  // Version 6 und 7 bleiben lesbar; geschrieben wird v8. Die neuen Node-Felder
  // besitzen Defaults und benötigen keinen destruktiven Migrationsschritt.
  version: z.union([z.literal(6), z.literal(7), z.literal(8)]),
  activeBoardId: z.string().min(1).max(100),
  focusedNodeId: z.string().max(100).nullable(),
  boards: z.array(orbitBoardSchema).min(1).max(ORBIT_LIMITS.maxBoards),
}).superRefine((workspace, context) => {
  const boardIds = new Set(workspace.boards.map((board) => board.id));
  if (boardIds.size !== workspace.boards.length || !boardIds.has(workspace.activeBoardId)) {
    context.addIssue({ code: "custom", message: "Orbit-Arbeitsflächen müssen eindeutig sein und eine aktive Fläche besitzen." });
  }
  if (workspace.focusedNodeId !== null) {
    const activeBoard = workspace.boards.find((board) => board.id === workspace.activeBoardId);
    if (!activeBoard?.nodes.some((node) => node.id === workspace.focusedNodeId)) {
      context.addIssue({ code: "custom", message: "Der fokussierte Orbit-Knoten gehört nicht zur aktiven Fläche." });
    }
  }
});

export const orbitDocumentResponseSchema = z.object({
  document: orbitWorkspaceSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
  initialized: z.boolean(),
  syncIntervalMilliseconds: z.number().int().min(1_000).max(60_000),
});
export const saveOrbitDocumentRequestSchema = z.object({
  document: orbitWorkspaceSchema,
  expectedRevision: z.number().int().nonnegative().nullable(),
});

export const orbitAssetSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  bytes: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  folderId: z.string().uuid().nullable().default(null),
});
export const orbitAssetResponseSchema = z.object({ asset: orbitAssetSchema });
export const orbitAssetListResponseSchema = z.object({
  assets: z.array(orbitAssetSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const galleryFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  createdAt: isoDateSchema,
  fileCount: z.number().int().nonnegative().default(0),
});
export const galleryFolderResponseSchema = z.object({ folder: galleryFolderSchema });
export const galleryFolderListResponseSchema = z.object({
  folders: z.array(galleryFolderSchema),
});
export const createGalleryFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateGalleryFolderRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateGalleryFileRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

// Die Dateigalerie teilt sich das Metadaten-Format mit den Orbit-Assets
// (Mediengalerie). Eigene Alias-Namen halten die API-Semantik lesbar.
export const galleryFileSchema = orbitAssetSchema;
export const galleryFileResponseSchema = z.object({ file: galleryFileSchema });
export const galleryFileListResponseSchema = z.object({
  files: z.array(galleryFileSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const createProjectFileRequestSchema = z.object({
  path: z.string().trim().min(1).max(512),
  content: z.string().max(1_000_000),
  overwrite: z.boolean().default(false),
  expectedVersion: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
export const projectFileResponseSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  created: z.boolean(),
  version: z.string().regex(/^[0-9a-f]{64}$/),
});

export const newsCategorySchema = z.enum([
  "ai-models", "benchmarks", "developer-tools", "security", "tech-policy",
  "open-source", "infrastructure", "research", "startups", "general",
]);
export const newsMediaTypeSchema = z.enum(["article", "video"]);
export const newsImportanceBandSchema = z.enum(["top", "important", "relevant", "more"]);
export const newsSourceSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), homepageUrl: z.url(), kind: z.enum(["rss", "atom", "hacker-news", "youtube"]), priority: z.number().int().min(1).max(4),
});
export const newsItemSchema = z.object({
  id: z.string().uuid(), source: newsSourceSchema, url: z.url(), title: z.string().min(1),
  tldr: z.string().min(1), longSummary: z.string().min(1), content: z.string(), author: z.string().nullable(),
  category: newsCategorySchema, importanceScore: z.number().int().min(0).max(100), importanceBand: newsImportanceBandSchema,
  importanceReason: z.string().min(1), mediaType: newsMediaTypeSchema, coverUrl: z.url().nullable(), videoId: z.string().nullable(),
  publishedAt: isoDateSchema, fetchedAt: isoDateSchema, processedAt: isoDateSchema.nullable(), language: z.string().min(2).max(8),
  read: z.boolean(), saved: z.boolean(), collectionIds: z.array(z.string().uuid()), aiProcessed: z.boolean(),
});
export const newsListResponseSchema = z.object({
  items: z.array(newsItemSchema), nextCursor: z.string().nullable(), total: z.number().int().nonnegative(),
  sync: z.object({ running: z.boolean(), lastSyncedAt: isoDateSchema.nullable(), lastError: z.string().nullable(), aiEnabled: z.boolean() }),
});
export const newsItemResponseSchema = z.object({ item: newsItemSchema });
export const newsCollectionSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(80), itemCount: z.number().int().nonnegative(), createdAt: isoDateSchema, updatedAt: isoDateSchema });
export const newsCollectionsResponseSchema = z.object({ collections: z.array(newsCollectionSchema) });
export const createNewsCollectionRequestSchema = z.object({ name: z.string().trim().min(1).max(80) });
export const newsCollectionResponseSchema = z.object({ collection: newsCollectionSchema });
export const saveNewsItemRequestSchema = z.object({ collectionIds: z.array(z.string().uuid()).max(20) });
export const markNewsReadRequestSchema = z.object({ read: z.boolean() });
export const newsSyncResponseSchema = z.object({ accepted: z.boolean(), running: z.boolean() });
export const newsChatMessageSchema = z.object({ question: z.string().trim().min(1).max(2_000), answer: z.string().trim().min(1).max(8_000) });
/* Auswählbare Mistral-Modelle für den Nachrichten-Chat. "auto" überlässt die Wahl der Server-Konfiguration. */
export const newsChatModelSchema = z.enum(["auto", "mistral-large-2512", "mistral-medium-2604", "magistral-medium-2509", "mistral-small-2603"]);
export const newsChatModelOptions = [
  { id: "auto", label: "Automatisch", hint: "Wählt je nach Frage das passende Modell" },
  { id: "mistral-large-2512", label: "Mistral Large", hint: "Höchste Qualität, etwas langsamer" },
  { id: "mistral-medium-2604", label: "Mistral Medium", hint: "Ausgewogen zwischen Tempo und Tiefe" },
  { id: "magistral-medium-2509", label: "Magistral", hint: "Denkt Schritt für Schritt, gut für Analysen" },
  { id: "mistral-small-2603", label: "Mistral Small", hint: "Schnellste Antworten" },
] as const satisfies ReadonlyArray<{ id: z.infer<typeof newsChatModelSchema>; label: string; hint: string }>;
export const newsChatRequestSchema = z.object({ question: z.string().trim().min(2).max(2_000), itemId: z.string().uuid().nullable().default(null), history: z.array(newsChatMessageSchema).max(10).default([]), model: newsChatModelSchema.default("auto") });
export const newsCitationSchema = z.object({ itemId: z.string().uuid(), title: z.string().min(1), url: z.url(), excerpt: z.string() });
export const newsChatResponseSchema = z.object({ answer: z.string().min(1), citations: z.array(newsCitationSchema), model: z.string().min(1), grounded: z.boolean() });

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type DashboardSection = z.infer<typeof dashboardSectionSchema>;
export type DashboardConfig = z.infer<typeof dashboardConfigSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
export type OperationalMetricsResponse = z.infer<typeof operationalMetricsSchema>;
export type RestartTarget = z.infer<typeof restartTargetSchema>;
export type RestartRequest = z.infer<typeof restartRequestSchema>;
export type RestartResponse = z.infer<typeof restartResponseSchema>;
export type RestartPhase = z.infer<typeof restartPhaseSchema>;
export type RestartStatusResponse = z.infer<typeof restartStatusResponseSchema>;
export type T3Channel = z.infer<typeof t3ChannelSchema>;
export type T3ChannelRequest = z.infer<typeof t3ChannelRequestSchema>;
export type T3ChannelStatusResponse = z.infer<typeof t3ChannelStatusResponseSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type ServerMetrics = z.infer<typeof serverMetricsSchema>;
export type ServiceMode = z.infer<typeof serviceModeSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServicesResponse = z.infer<typeof servicesResponseSchema>;
export type LocalPort = z.infer<typeof localPortSchema>;
export type LocalPortsResponse = z.infer<typeof localPortsResponseSchema>;
export type PreviewSlot = z.infer<typeof previewSlotSchema>;
export type PreviewSlotsResponse = z.infer<typeof previewSlotsResponseSchema>;
export type PreviewSlotAssignmentRequest = z.infer<typeof previewSlotAssignmentRequestSchema>;
export type PreviewDependency = z.infer<typeof previewDependencySchema>;
export type PreviewDependenciesResponse = z.infer<typeof previewDependenciesResponseSchema>;
export type PreviewSessionRequest = z.infer<typeof previewSessionRequestSchema>;
export type PreviewSessionBinding = z.infer<typeof previewSessionBindingSchema>;
export type PreviewSessionResponse = z.infer<typeof previewSessionResponseSchema>;
export type PreviewSlotState = z.infer<typeof previewSlotStateSchema>;
export type PreviewAffinityStatus = z.infer<typeof previewAffinityStatusSchema>;
export type PreviewCapability = z.infer<typeof previewCapabilitySchema>;
export type PreviewLimitation = z.infer<typeof previewLimitationSchema>;
export type PreviewDevicePreference = z.infer<typeof previewDevicePreferenceSchema>;
export type PreviewDevicePreferenceRequest = z.infer<typeof previewDevicePreferenceRequestSchema>;
export type PreviewDevServerState = z.infer<typeof previewDevServerStateSchema>;
export type PreviewExternalOpenMode = z.infer<typeof previewExternalOpenModeSchema>;
export type PreviewRuntimeServiceRole = z.infer<typeof previewRuntimeServiceRoleSchema>;
export type PreviewRuntimeProfileSource = z.infer<typeof previewRuntimeProfileSourceSchema>;
export type PreviewRuntimePortMode = z.infer<typeof previewRuntimePortModeSchema>;
export type PreviewRuntimeLogLevel = z.infer<typeof previewRuntimeLogLevelSchema>;
export type PreviewRuntimeService = z.infer<typeof previewRuntimeServiceSchema>;
export type PreviewRuntimeProfile = z.infer<typeof previewRuntimeProfileSchema>;
export type PreviewRuntimeServiceStatus = z.infer<typeof previewRuntimeServiceStatusSchema>;
export type PreviewRuntimeLogLine = z.infer<typeof previewRuntimeLogLineSchema>;
export type PreviewRuntimeServiceLogs = z.infer<typeof previewRuntimeServiceLogsSchema>;
export type PreviewRuntimeLaunch = z.infer<typeof previewRuntimeLaunchSchema>;
export type PreviewDevServerStatus = z.infer<typeof previewDevServerStatusSchema>;
export type PreviewDevServersResponse = z.infer<typeof previewDevServersResponseSchema>;
export type PreviewDevServerLogs = z.infer<typeof previewDevServerLogsSchema>;
export type PreviewDevServerMainPortRequest = z.infer<typeof previewDevServerMainPortRequestSchema>;
export type PreviewHubPreference = z.infer<typeof previewHubPreferenceSchema>;
export type PreviewHubPreferenceRequest = z.infer<typeof previewHubPreferenceRequestSchema>;
export type PreviewSlotResetRequest = z.infer<typeof previewSlotResetRequestSchema>;
export type PreviewSlotResetResponse = z.infer<typeof previewSlotResetResponseSchema>;
export type PreviewSlotResetReport = z.infer<typeof previewSlotResetReportSchema>;
export type PreviewSlotResetVerificationResponse = z.infer<typeof previewSlotResetVerificationResponseSchema>;
export type PreviewServiceRole = z.infer<typeof previewServiceRoleSchema>;
export type PreviewServiceProtocol = z.infer<typeof previewServiceProtocolSchema>;
export type PreviewProbeStatus = z.infer<typeof previewProbeStatusSchema>;
export type PreviewServiceCandidate = z.infer<typeof previewServiceCandidateSchema>;
export type PreviewServiceCandidatesResponse = z.infer<typeof previewServiceCandidatesResponseSchema>;
export type PreviewServiceEdge = z.infer<typeof previewServiceEdgeSchema>;
export type PreviewServiceGraph = z.infer<typeof previewServiceGraphSchema>;
export type PreviewServiceGraphRequest = z.infer<typeof previewServiceGraphRequestSchema>;
export type PreviewServiceGraphResponse = z.infer<typeof previewServiceGraphResponseSchema>;
export type PreviewCapacityPreview = z.infer<typeof previewCapacityPreviewSchema>;
export type PreviewDiagnosticSource = z.infer<typeof previewDiagnosticSourceSchema>;
export type PreviewDiagnosticCategory = z.infer<typeof previewDiagnosticCategorySchema>;
export type PreviewDiagnosticSeverity = z.infer<typeof previewDiagnosticSeveritySchema>;
export type PreviewDiagnosticCompleteness = z.infer<typeof previewDiagnosticCompletenessSchema>;
export type PreviewDiagnosticEvent = z.infer<typeof previewDiagnosticEventSchema>;
export type PreviewDiagnosticBatch = z.infer<typeof previewDiagnosticBatchSchema>;
export type PreviewDiagnosticsResponse = z.infer<typeof previewDiagnosticsResponseSchema>;
export type PreviewCaptureSession = z.infer<typeof previewCaptureSessionSchema>;
export type PreviewCaptureSessionRequest = z.infer<typeof previewCaptureSessionRequestSchema>;
export type PreviewLocalStorageEntry = z.infer<typeof previewLocalStorageEntrySchema>;
export type PreviewLocalStorageSnapshot = z.infer<typeof previewLocalStorageSnapshotSchema>;
export type PreviewLocalStorageState = z.infer<typeof previewLocalStorageStateSchema>;
export type PreviewLocalStorageSnapshotRequest = z.infer<typeof previewLocalStorageSnapshotRequestSchema>;
export type PreviewLocalStorageRestoreRequest = z.infer<typeof previewLocalStorageRestoreRequestSchema>;
export type PreviewLocalStorageRestoreResponse = z.infer<typeof previewLocalStorageRestoreResponseSchema>;
export type PreviewLocalStorageConflict = z.infer<typeof previewLocalStorageConflictSchema>;
export type PreviewRepairAction = z.infer<typeof previewRepairActionSchema>;
export type PreviewRepairRequest = z.infer<typeof previewRepairRequestSchema>;
export type PreviewRepairJob = z.infer<typeof previewRepairJobSchema>;
export type Preview = z.infer<typeof previewSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectActivity = z.infer<typeof projectActivitySchema>;
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectActivityTouchResponse = z.infer<typeof projectActivityTouchResponseSchema>;
export type FilesystemEntry = z.infer<typeof filesystemEntrySchema>;
export type FilesystemTreeResponse = z.infer<typeof filesystemTreeResponseSchema>;
export type FileManagerState = z.infer<typeof fileManagerStateSchema>;
export type FileManagerStateResponse = z.infer<typeof fileManagerStateResponseSchema>;
export type FileManagerTextPreviewResponse = z.infer<typeof fileManagerTextPreviewResponseSchema>;
export type FileManagerSearchResponse = z.infer<typeof fileManagerSearchResponseSchema>;
export type SkillEditorFile = z.infer<typeof skillEditorFileSchema>;
export type SkillEditorNode = z.infer<typeof skillEditorNodeSchema>;
export type SkillEditorTreeResponse = z.infer<typeof skillEditorTreeResponseSchema>;
export type SkillEditorRepositoryStatus = z.infer<typeof skillEditorRepositoryStatusSchema>;
export type SkillEditorStatusResponse = z.infer<typeof skillEditorStatusResponseSchema>;
export type SkillEditorReadResponse = z.infer<typeof skillEditorReadResponseSchema>;
export type SkillEditorWriteRequest = z.infer<typeof skillEditorWriteRequestSchema>;
export type SkillEditorCreateRequest = z.infer<typeof skillEditorCreateRequestSchema>;
export type SkillEditorCreateResponse = z.infer<typeof skillEditorCreateResponseSchema>;
export type SkillEditorRenameRequest = z.infer<typeof skillEditorRenameRequestSchema>;
export type SkillEditorDeleteRequest = z.infer<typeof skillEditorDeleteRequestSchema>;
export type SkillEditorGitChange = z.infer<typeof skillEditorGitChangeSchema>;
export type SkillEditorGitResponse = z.infer<typeof skillEditorGitResponseSchema>;
export type RegisterProjectRequest = z.infer<typeof registerProjectRequestSchema>;
export type RegisterProjectResponse = z.infer<typeof registerProjectResponseSchema>;
export type CommandReference = z.infer<typeof commandSchema>;
export type CommandsResponse = z.infer<typeof commandsResponseSchema>;
export type UsageWindow = z.infer<typeof usageWindowSchema>;
export type AccountUsage = z.infer<typeof accountUsageSchema>;
export type ProviderUsage = z.infer<typeof providerUsageSchema>;
export type UsageResponse = z.infer<typeof usageResponseSchema>;
export type UsageProviderId = z.infer<typeof usageProviderIdSchema>;
export type UsageRange = z.infer<typeof usageRangeSchema>;
export type UsageDailyPoint = z.infer<typeof usageDailyPointSchema>;
export type UsageBreakdown = z.infer<typeof usageBreakdownSchema>;
export type UsageForecast = z.infer<typeof usageForecastSchema>;
export type ResetCredit = z.infer<typeof resetCreditSchema>;
export type UsageDashboardResponse = z.infer<typeof usageDashboardResponseSchema>;
export type ManagedAccount = z.infer<typeof managedAccountSchema>;
export type AccountsResponse = z.infer<typeof accountsResponseSchema>;
export type DiscoveredAccount = z.infer<typeof discoveredAccountSchema>;
export type DiscoveredAccountsResponse = z.infer<typeof discoveredAccountsResponseSchema>;
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export type ActivateAccountResponse = z.infer<typeof activateAccountResponseSchema>;
export type LoginSessionResponse = z.infer<typeof loginSessionResponseSchema>;
export type UsageTimelineStatus = z.infer<typeof usageTimelineStatusSchema>;
export type UsageTimelineLane = z.infer<typeof usageTimelineLaneSchema>;
export type UsageTimelineResponse = z.infer<typeof usageTimelineResponseSchema>;
export type TerminalKind = z.infer<typeof terminalKindSchema>;
export type TerminalSessionStatus = z.infer<typeof terminalSessionStatusSchema>;
export type TerminalSession = z.infer<typeof terminalSessionSchema>;
export type TerminalSessionsResponse = z.infer<typeof terminalSessionsResponseSchema>;
export type TerminalTab = z.infer<typeof terminalTabSchema>;
export type TerminalArea = z.infer<typeof terminalAreaSchema>;
export type TerminalWorkspace = z.infer<typeof terminalWorkspaceSchema>;
export type TerminalWorkspaceResponse = z.infer<typeof terminalWorkspaceResponseSchema>;
export type SaveTerminalWorkspaceRequest = z.infer<typeof saveTerminalWorkspaceRequestSchema>;
export type Panel = z.infer<typeof panelSchema>;
export type PanelType = z.infer<typeof panelTypeSchema>;
export type HermesServiceState = z.infer<typeof hermesServiceStateSchema>;
export type HermesUpdateResult = z.infer<typeof hermesUpdateResultSchema>;
export type HermesStatus = z.infer<typeof hermesStatusSchema>;
export type HermesSessionSource = z.infer<typeof hermesSessionSourceSchema>;
export type HermesSession = z.infer<typeof hermesSessionSchema>;
export type HermesSessionsResponse = z.infer<typeof hermesSessionsResponseSchema>;
export type HermesTask = z.infer<typeof hermesTaskSchema>;
export type HermesTasksResponse = z.infer<typeof hermesTasksResponseSchema>;
export type HermesResult = z.infer<typeof hermesResultSchema>;
export type HermesResultsResponse = z.infer<typeof hermesResultsResponseSchema>;
export type HermesCronJob = z.infer<typeof hermesCronJobSchema>;
export type HermesCronResponse = z.infer<typeof hermesCronResponseSchema>;
export type HermesModel = z.infer<typeof hermesModelSchema>;
export type HermesModelsResponse = z.infer<typeof hermesModelsResponseSchema>;
export type HermesToolCall = z.infer<typeof hermesToolCallSchema>;
export type HermesMessage = z.infer<typeof hermesMessageSchema>;
export type HermesApproval = z.infer<typeof hermesApprovalSchema>;
export type HermesSlashCommand = z.infer<typeof hermesSlashCommandSchema>;
export type HermesUsage = z.infer<typeof hermesUsageSchema>;
export type HermesErrorCode = z.infer<typeof hermesErrorCodeSchema>;
export type HermesClientMessage = z.infer<typeof hermesClientMessageSchema>;
export type HermesServerMessage = z.infer<typeof hermesServerMessageSchema>;
export type HermesServiceActionRequest = z.infer<typeof hermesServiceActionRequestSchema>;
export type HermesDiagnostic = z.infer<typeof hermesDiagnosticSchema>;
export type HermesDiagnosticsResponse = z.infer<typeof hermesDiagnosticsResponseSchema>;
export type HermesUpdateState = z.infer<typeof hermesUpdateStateSchema>;
export type NotificationSource = z.infer<typeof notificationSourceSchema>;
export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationSourceIcon = z.infer<typeof notificationSourceIconSchema>;
export type NotificationSeverity = z.infer<typeof notificationSeveritySchema>;
export type NotificationState = z.infer<typeof notificationStateSchema>;
export type NotificationReport = z.infer<typeof notificationReportSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPatch = z.infer<typeof notificationPatchSchema>;
export type NotificationPresenceItem = z.infer<typeof notificationPresenceItemSchema>;
export type NotificationPresence = z.infer<typeof notificationPresenceSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationSettingsResponse = z.infer<typeof notificationSettingsResponseSchema>;
export type PushSubscription = z.infer<typeof pushSubscriptionSchema>;
export type PushSubscriptionRegistration = z.infer<typeof pushSubscriptionRegistrationSchema>;
export type PushSubscriptionResponse = z.infer<typeof pushSubscriptionResponseSchema>;
export type PushTestResponse = z.infer<typeof pushTestResponseSchema>;
export type NotificationPushPayload = z.infer<typeof notificationPushPayloadSchema>;
export type WorkbenchGroup = z.infer<typeof workbenchGroupSchema>;
export type WorkbenchLayout = z.infer<typeof workbenchLayoutSchema>;
export type WorkbenchPage = z.infer<typeof workbenchPageSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type OrbitNodeType = z.infer<typeof orbitNodeTypeSchema>;
export type OrbitEdgeKind = z.infer<typeof orbitEdgeKindSchema>;
export type OrbitPoint = z.infer<typeof orbitPointSchema>;
export type OrbitSize = z.infer<typeof orbitSizeSchema>;
export type OrbitBounds = z.infer<typeof orbitBoundsSchema>;
export type OrbitNode = z.infer<typeof orbitNodeSchema>;
export type OrbitEdge = z.infer<typeof orbitEdgeSchema>;
export type OrbitBoard = z.infer<typeof orbitBoardSchema>;
export type OrbitWorkspace = z.infer<typeof orbitWorkspaceSchema>;
export type OrbitDocumentResponse = z.infer<typeof orbitDocumentResponseSchema>;
export type SaveOrbitDocumentRequest = z.infer<typeof saveOrbitDocumentRequestSchema>;
export type OrbitAsset = z.infer<typeof orbitAssetSchema>;
export type OrbitAssetResponse = z.infer<typeof orbitAssetResponseSchema>;
export type OrbitAssetListResponse = z.infer<typeof orbitAssetListResponseSchema>;
export type GalleryFolder = z.infer<typeof galleryFolderSchema>;
export type GalleryFolderResponse = z.infer<typeof galleryFolderResponseSchema>;
export type GalleryFolderListResponse = z.infer<typeof galleryFolderListResponseSchema>;
export type CreateGalleryFolderRequest = z.infer<typeof createGalleryFolderRequestSchema>;
export type UpdateGalleryFolderRequest = z.infer<typeof updateGalleryFolderRequestSchema>;
export type UpdateGalleryFileRequest = z.infer<typeof updateGalleryFileRequestSchema>;
export type GalleryFile = z.infer<typeof galleryFileSchema>;
export type GalleryFileResponse = z.infer<typeof galleryFileResponseSchema>;
export type GalleryFileListResponse = z.infer<typeof galleryFileListResponseSchema>;
export type CreateProjectFileRequest = z.infer<typeof createProjectFileRequestSchema>;
export type ProjectFileResponse = z.infer<typeof projectFileResponseSchema>;
export type NewsCategory = z.infer<typeof newsCategorySchema>;
export type NewsMediaType = z.infer<typeof newsMediaTypeSchema>;
export type NewsImportanceBand = z.infer<typeof newsImportanceBandSchema>;
export type NewsSource = z.infer<typeof newsSourceSchema>;
export type NewsItem = z.infer<typeof newsItemSchema>;
export type NewsListResponse = z.infer<typeof newsListResponseSchema>;
export type NewsCollection = z.infer<typeof newsCollectionSchema>;
export type CreateNewsCollectionRequest = z.infer<typeof createNewsCollectionRequestSchema>;
export type SaveNewsItemRequest = z.infer<typeof saveNewsItemRequestSchema>;
export type MarkNewsReadRequest = z.infer<typeof markNewsReadRequestSchema>;
export type NewsChatMessage = z.infer<typeof newsChatMessageSchema>;
export type NewsChatModel = z.infer<typeof newsChatModelSchema>;
export type NewsChatRequest = z.infer<typeof newsChatRequestSchema>;
export type NewsCitation = z.infer<typeof newsCitationSchema>;
export type NewsChatResponse = z.infer<typeof newsChatResponseSchema>;
