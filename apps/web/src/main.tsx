import "./lib/zodConfig";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CrashReportDialog } from "./components/CrashReportDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { addBreadcrumb, installGlobalErrorHandlers, subscribeToCrash } from "./lib/crashReport";
import { apiClient } from "./lib/apiClient";
import { synchronizeExistingPushDevice } from "./lib/webPushDevice";
import { bootstrapBuiltinContributions } from "./extensions/builtinContributions";
import "./index.css";
import "./visual-system.css";
import "./components/usage/usage-mobile.css";

// Muss vor dem ersten Render stehen, sonst gehen frühe Fehler verloren.
installGlobalErrorHandlers();
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
    title: "Frontend-Absturz", body: report.message.slice(0, 1_000), link: report.route.startsWith("/workbench/") ? report.route : "/workbench/inbox",
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
      <ErrorBoundary label="Die Workbench">
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const base = import.meta.env.BASE_URL;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" }).then(async (registration) => {
      // Ein bereits fertig installiertes Update übernehmen. register() prüft
      // sw.js ungecached; ein noch installierender Worker wird beim nächsten
      // App-Start als waiting erkannt, ohne einen Reload zu blockieren.
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
      await synchronizeExistingPushDevice();
    }).catch(() => undefined);
  });
}
