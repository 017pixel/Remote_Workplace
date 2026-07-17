import { buildApp } from "./app.js";
import { settings } from "./config/settings.js";

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Workbench wird beendet");
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: settings.host, port: settings.port });
} catch (error) {
  app.log.fatal({ err: error }, "Workbench konnte nicht gestartet werden");
  process.exit(1);
}
