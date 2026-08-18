import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";
import type { AppDependencies } from "./dependencies.js";

export interface LifecycleState {
  previewLogRotation: NodeJS.Timeout | null;
}

export async function startBackgroundServices(app: FastifyInstance, deps: AppDependencies, state: LifecycleState) {
  deps.analytics.start();
  deps.usageTimeline.start();
  deps.news.start();
  deps.hermesResultSync.start();
  deps.t3StatusSync.start();
  deps.terminalStatusSync.start();
  deps.agentSessionSync.start();
  await deps.previewSlots.startListeners();
  deps.previewDevServers.startWatchdog();
  if (settings.previews.diagnosticsEnabled) {
    // Tageswechsel: abgeschlossene Tage komprimieren, alte Tage entfernen.
    state.previewLogRotation = setInterval(() => {
      void deps.previewDiagnostics.rotate().catch((error) => app.log.error({ err: error }, "Preview-Logrotation fehlgeschlagen"));
    }, 3_600_000);
    state.previewLogRotation.unref();
    void deps.previewDiagnostics.rotate().catch((error) => app.log.error({ err: error }, "Initiale Preview-Logrotation fehlgeschlagen"));
  }
}

export function registerShutdown(app: FastifyInstance, deps: AppDependencies, state: LifecycleState) {
  app.addHook("onClose", async () => {
    deps.previewDevServers.stopWatchdog();
    await deps.news.stop();
    await deps.analytics.stop();
    await deps.usageTimeline.stop();
    await deps.hermesResultSync.stop();
    deps.t3StatusSync.stop();
    deps.terminalStatusSync.stop();
    deps.agentSessionSync.stop();
    await deps.previewSlots.stopListeners();
    if (state.previewLogRotation) clearInterval(state.previewLogRotation);
    await deps.previewDiagnostics.close();
    await deps.hermesManager.close();
    deps.terminals.shutdown();
    await deps.browsers.shutdown();
    deps.operationalMetrics.close();
    deps.previewDevServerDatabase.close();
    deps.previewSlotDatabase.close();
    deps.terminalDatabase.close();
    await deps.notificationPush.close();
    deps.notificationDatabase.close();
    deps.browserDatabase.close();
    deps.newsDatabase.close();
    deps.orbitDatabase.close();
    deps.orbitAssets.close();
    deps.fileGallery.close();
    deps.fileManager.close();
    deps.projectRegistryDatabase.close();
    deps.projectActivityDatabase.close();
    deps.operationalAudit.close();
    deps.usageDatabase.close();
    deps.extensionDatabase.close();
  });
}
