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
  }),
});

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string().min(1),
  timestamp: isoDateSchema,
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
  protocol: z.enum(["http", "https", "unknown"]),
  localUrl: z.url().nullable(),
  proxyUrl: z.string().startsWith("/").nullable(),
});

export const localPortsResponseSchema = z.object({
  ports: z.array(localPortSchema),
  scannedAt: isoDateSchema,
});

export const previewSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  url: z.url(),
  mode: serviceModeSchema,
});

export const projectAvailabilitySchema = z.enum([
  "available",
  "missing",
  "inaccessible",
  "symlink",
]);

export const projectSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string(),
  path: z.string().startsWith("/"),
  enabled: z.boolean(),
  sortOrder: z.number().int(),
  availability: projectAvailabilitySchema,
  previews: z.array(previewSchema),
  links: z.object({
    t3Code: z.url().nullable(),
    codeServer: z.url().nullable(),
  }),
});

export const projectsResponseSchema = z.object({ projects: z.array(projectSchema) });
export const projectResponseSchema = z.object({ project: projectSchema });

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
  providerId: z.enum(["codex", "opencode"]),
  providerName: z.string().min(1),
  status: z.enum(["available", "partial", "unavailable"]),
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

export const usageProviderIdSchema = z.enum(["codex", "opencode"]);
export const usageRangeSchema = z.enum(["7d", "30d", "90d", "365d"]);
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
export const loginSessionResponseSchema = z.object({
  account: managedAccountSchema,
  terminalKind: z.enum(["codex", "opencode"]),
  command: z.string().min(1),
});

export const WORKBENCH_LIMITS = {
  maxResidentTools: 8,
  maxVisibleGroups: 4,
  maxWorkspaces: 8,
} as const;

export const terminalKindSchema = z.enum(["shell", "codex", "opencode"]);
export const panelTypeSchema = z.enum(["t3-code", "code-server", "preview", "browser", "terminal", "codex", "opencode"]);
export const panelSchema = z.object({
  id: z.string().min(1),
  type: panelTypeSchema,
  projectId: z.string().nullable(),
  previewId: z.string().nullable(),
  reloadKey: z.number().int().nonnegative(),
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

export const orbitNodeTypeSchema = z.enum([
  "project",
  "tool",
  "note",
  "todo",
  "snippet",
  "file",
  "frame",
  "usage",
]);
export const orbitEdgeKindSchema = z.enum(["project", "manual", "runtime"]);
export const orbitPointSchema = z.object({
  x: z.number().finite().min(-100_000).max(100_000),
  y: z.number().finite().min(-100_000).max(100_000),
});
export const orbitSizeSchema = z.object({
  width: z.number().finite().min(160).max(2_400),
  height: z.number().finite().min(96).max(1_600),
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
  provider: usageProviderIdSchema.nullable(),
  content: z.string().max(200_000),
  language: z.string().trim().max(40).nullable(),
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

export const orbitWorkspaceSchema = z.object({
  version: z.literal(4),
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

export const createProjectFileRequestSchema = z.object({
  path: z.string().trim().min(1).max(512),
  content: z.string().max(1_000_000),
  overwrite: z.boolean().default(false),
});
export const projectFileResponseSchema = z.object({
  projectId: z.string().min(1),
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  created: z.boolean(),
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
export const newsChatRequestSchema = z.object({ question: z.string().trim().min(2).max(2_000), itemId: z.string().uuid().nullable().default(null) });
export const newsCitationSchema = z.object({ itemId: z.string().uuid(), title: z.string().min(1), url: z.url(), excerpt: z.string() });
export const newsChatResponseSchema = z.object({ answer: z.string().min(1), citations: z.array(newsCitationSchema), model: z.string().min(1), grounded: z.boolean() });

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type ServerMetrics = z.infer<typeof serverMetricsSchema>;
export type ServiceMode = z.infer<typeof serviceModeSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServicesResponse = z.infer<typeof servicesResponseSchema>;
export type LocalPort = z.infer<typeof localPortSchema>;
export type LocalPortsResponse = z.infer<typeof localPortsResponseSchema>;
export type Preview = z.infer<typeof previewSchema>;
export type Project = z.infer<typeof projectSchema>;
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
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
export type LoginSessionResponse = z.infer<typeof loginSessionResponseSchema>;
export type TerminalKind = z.infer<typeof terminalKindSchema>;
export type Panel = z.infer<typeof panelSchema>;
export type PanelType = z.infer<typeof panelTypeSchema>;
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
export type NewsChatRequest = z.infer<typeof newsChatRequestSchema>;
export type NewsCitation = z.infer<typeof newsCitationSchema>;
export type NewsChatResponse = z.infer<typeof newsChatResponseSchema>;
