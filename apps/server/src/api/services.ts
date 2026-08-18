import type { CodexbarUsageService } from "../adapters/codexbar/codexbar-cache.js";
import type { ProjectBrowserService } from "../filesystem/projectBrowserService.js";
import type { FileManagerService } from "../filesystem/fileManagerService.js";
import type { OrbitAssetRepository } from "../orbit/assets.js";
import type { OrbitDatabase } from "../orbit/database.js";
import type { PreviewSlotService } from "../previews/slots.js";
import type { createCommandService } from "../services/commandService.js";
import type { createLocalPortService } from "../services/localPortService.js";
import type { createProjectFileService } from "../services/projectFileService.js";
import type { createProjectService } from "../services/projectService.js";
import type { createServiceStatusService } from "../services/serviceStatusService.js";
import type { SkillEditorService } from "../skills/skillEditorService.js";
import type { AccountService } from "../usage/account-service.js";
import type { UsageTimelineService } from "../usage/timeline-service.js";
import type { UsageAnalyticsService } from "../usage/usage-service.js";

export interface RouteServices {
  projects: ReturnType<typeof createProjectService>;
  statuses: ReturnType<typeof createServiceStatusService>;
  commands: ReturnType<typeof createCommandService>;
  usage: CodexbarUsageService;
  analytics: UsageAnalyticsService;
  accounts: AccountService;
  usageTimeline: UsageTimelineService;
  orbit: OrbitDatabase;
  projectFiles: ReturnType<typeof createProjectFileService>;
  localPorts: ReturnType<typeof createLocalPortService>;
  previewSlots: PreviewSlotService;
  orbitAssets: OrbitAssetRepository;
  fileGallery: OrbitAssetRepository;
  projectBrowser: ProjectBrowserService;
  fileManager: FileManagerService;
  skillEditor: SkillEditorService;
  proxyOrigins: string[];
}
