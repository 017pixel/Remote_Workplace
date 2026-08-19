import "./lib/zodConfig";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapBuiltinContributions } from "./extensions/builtinContributions";
import { migrateLegacyBrowserStorage } from "./lib/legacyStorageMigration";
import { addBreadcrumb, installGlobalErrorHandlers, subscribeToCrash } from "./lib/crashReport";
import { apiClient } from "./lib/apiClient";
import { synchronizeExistingPushDevice } from "./lib/webPushDevice";
import "./index.css";
import "./visual-system.css";
import "./components/usage/usage-mobile.css";

// Muss vor dem ersten Render stehen, sonst gehen frühe Fehler verloren.
installGlobalErrorHandlers();
try {
  migrateLegacyBrowserStorage();
} catch {
  // Gesperrter Browser-Storage darf den App-Start nicht verhindern.
}

const [{ App }, { CrashReportDialog }, { ErrorBoundary }] = await Promise.all([
  import("./App"),
  import("./components/CrashReportDialog"),
  import("./components/ErrorBoundary"),
]);
bootstrapBuiltinContributions();

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Der Frontend-Mount-Punkt #root fehlt.");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

subscribeToCrash((report) => {
  if (!report) return;
  void apiClient.createCrashNotification({
    title: "Frontend-Absturz", body: report.message.slice(0, 1_000), link: report.route.startsWith("/wrapt/") ? report.route : "/wrapt/inbox",
    remoteId: `crash:${report.id}`,
    report: {
      message: report.message, stack: [report.stack, report.componentStack].filter(Boolean).join("\n\n") || null,
      context: { Route: report.route, Art: report.kind, Zeitpunkt: report.occurredAt }, logs: report.breadcrumbs,
      environment: { UserAgent: navigator.userAgent, Viewport: `${window.innerWidth}x${window.innerHeight}` },
    },
  }).catch(() => undefined);
});

// Fehlgeschlagene Abfragen als Breadcrumb — im Crash-Report sieht man dann,
// ob dem Absturz ein Backend-Problem vorausging.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== "updated" || event.query.state.status !== "error") return;
  const error = event.query.state.error;
  addBreadcrumb(`Query fehlgeschlagen [${JSON.stringify(event.query.queryKey)}]: ${error instanceof Error ? error.message : String(error)}`);
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Der Dialog steht außerhalb der Boundary — er muss auch dann noch rendern,
          wenn die gesamte App beim Rendern abgestürzt ist. */}
      <CrashReportDialog />
      <ErrorBoundary label="Wrapt">
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const base = import.meta.env.BASE_URL;
  const removeLegacyProductWorkers = async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => {
      try {
        const scope = new URL(registration.scope);
        if (scope.origin === window.location.origin && scope.pathname === "/workbench/") await registration.unregister();
      } catch {
        // Eine einzelne beschädigte Registrierung darf den neuen Worker nicht blockieren.
      }
    }));
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => /^(?:workbench-|remote-workplace-)/i.test(name)).map((name) => caches.delete(name)));
    }
  };
  window.addEventListener("load", () => {
    void removeLegacyProductWorkers().catch(() => undefined).then(() => navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" })).then(async (registration) => {
      // Ein bereits fertig installiertes Update übernehmen. register() prüft
      // sw.js ungecached; ein noch installierender Worker wird beim nächsten
      // App-Start als waiting erkannt, ohne einen Reload zu blockieren.
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      await synchronizeExistingPushDevice();
    }).catch(() => undefined);
  });
}
