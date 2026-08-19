import { buildApp } from "./app.js";
import { settings } from "./config/settings.js";

const app = await buildApp();

let shuttingDown = false;

const shutdown = async (signal: string, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Wrapt wird beendet");
  // Hängt close() (z. B. an einer offenen WebSocket-Verbindung), beendet der Timer den
  // Prozess trotzdem — sonst müsste systemd erst nach TimeoutStopSec hart nachhelfen.
  const forced = setTimeout(() => {
    app.log.warn({ signal }, "Sauberes Beenden dauerte zu lange — Prozess wird hart beendet");
    process.exit(exitCode);
  }, 10_000);
  forced.unref();
  try {
    await app.close();
  } catch (error) {
    app.log.error({ err: error }, "Fehler beim Beenden");
  }
  process.exit(exitCode);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

// Ohne diese Handler beendet Node sich bei einem unbehandelten Fehler wortlos.
// Erst protokollieren, dann mit Exit-Code 1 gehen: systemd (Restart=always) holt
// den Dienst nach RestartSec wieder hoch, und im Journal steht die Ursache.
process.on("uncaughtException", (error, origin) => {
  app.log.fatal({ err: error, origin }, "Unbehandelte Ausnahme — Prozess wird neu gestartet");
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  // Bewusst kein Prozessende: ein abgelehntes Promise stammt meist aus einer einzelnen
  // Anfrage und darf nicht die laufenden Terminal- und Browser-Sitzungen abreißen.
  app.log.error({ err: reason }, "Nicht abgefangenes Promise");
});

try {
  await app.listen({ host: settings.host, port: settings.port });
} catch (error) {
  app.log.fatal({ err: error }, "Wrapt konnte nicht gestartet werden");
  process.exit(1);
}
