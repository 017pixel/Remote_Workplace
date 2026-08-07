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
      // wird hier ignoriert, alle anderen bleiben Fehler.
      return errors.every((error) =>
        error instanceof Error
        && error.message === "Not attached to an active page"
        && error.stack?.includes("src/browser/Manager.ts:77") === true,
      );
    },
  },
});
