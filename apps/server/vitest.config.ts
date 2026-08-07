import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./vitest.setup.ts"],
    onUnhandledErrors: (errors) => {
      // Bekannter Nachlauf des Browser-Integrationstests: Nach dem Shutdown
      // des Chromium-Prozesses trifft gelegentlich eine letzte CDP-Antwort
      // („Not attached to an active page") ein, deren Ablehnung niemand mehr
      // erwartet. Der Test selbst ist grün; nur die nachlaufende Antwort
      // kippte den Lauf als unhandled rejection. Genau dieser eine Fehler
      // wird hier ignoriert, alle anderen bleiben Fehler. Die Fehler kommen
      // aus dem Worker-Prozess und sind serialisiert, deshalb ohne
      // instanceof-Prüfung.
      return errors.every((error) => {
        const record = error as { message?: unknown; stack?: unknown };
        const message = String(record?.message ?? "");
        const stack = String(record?.stack ?? "");
        return message === "Not attached to an active page"
          && stack.includes("src/browser/Manager.ts:77");
      });
    },
  },
});
