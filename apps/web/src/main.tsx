import "./lib/zodConfig";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CrashReportDialog } from "./components/CrashReportDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { addBreadcrumb, installGlobalErrorHandlers } from "./lib/crashReport";
import "./index.css";

// Muss vor dem ersten Render stehen, sonst gehen frühe Fehler verloren.
installGlobalErrorHandlers();

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Der Frontend-Mount-Punkt #root fehlt.");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
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
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  });
}
