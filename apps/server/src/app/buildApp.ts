import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { settings } from "../config/settings.js";
import { registerHermesDashboardProxy } from "../hermes/dashboard-proxy.js";
import { registerEditorProxy } from "../services/editorProxy.js";
import { registerOpenCodeWebProxy } from "../services/opencodeWebProxy.js";
import { registerT3Proxy } from "../services/t3Proxy.js";
import { createAppDependencies } from "./dependencies.js";
import { registerCoreHooks } from "./hooks.js";
import { registerApplicationRoutes } from "./routes.js";
import { registerCorePlugins } from "./plugins.js";
import { registerShutdown, startBackgroundServices, type LifecycleState } from "./lifecycle.js";
import { registerStaticHosting } from "./static.js";

export interface BuildAppOptions {
  startBackgroundServices?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: { level: settings.logLevel },
    genReqId: () => randomUUID(),
    bodyLimit: Math.max(settings.orbitDocumentMaxBytes + 65_536, settings.orbitAssetMaxFileBytes + 1_048_576),
    trustProxy: ["127.0.0.1", "::1"],
  });

  const dependencies = await createAppDependencies(app);

  await registerCorePlugins(app, dependencies);
  registerCoreHooks(app, dependencies);
  await registerApplicationRoutes(app, dependencies);

  const lifecycle: LifecycleState = { previewLogRotation: null };
  if (options.startBackgroundServices !== false) {
    await startBackgroundServices(app, dependencies, lifecycle);
  }
  registerShutdown(app, dependencies, lifecycle);

  await registerEditorProxy(app);
  await registerT3Proxy(app);
  await registerOpenCodeWebProxy(app);
  await registerHermesDashboardProxy(app);

  await registerStaticHosting(app);

  return app;
}
