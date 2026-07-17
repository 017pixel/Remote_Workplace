import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./views/Dashboard";
import { PwaInstallProvider } from "./lib/usePwaInstall";
import {
  loadProjectDetail,
  loadProjects,
  loadSettings,
  loadTerminal,
  loadCliTerminal,
  loadToolRoute,
  loadUsage,
  loadWorkbench,
  loadTechTldrs,
  prefetchAllRoutes,
} from "./lib/routeModules";

const Workbench = lazy(() => loadWorkbench().then((module) => ({ default: module.Workbench })));
const Projects = lazy(() => loadProjects().then((module) => ({ default: module.Projects })));
const ProjectDetail = lazy(() => loadProjectDetail().then((module) => ({ default: module.ProjectDetail })));
const Settings = lazy(() => loadSettings().then((module) => ({ default: module.Settings })));
const Usage = lazy(() => loadUsage().then((module) => ({ default: module.Usage })));
const TerminalView = lazy(() => loadTerminal().then((module) => ({ default: module.TerminalView })));
const CodexTerminal = lazy(() => loadCliTerminal().then((module) => ({ default: module.CodexTerminal })));
const OpenCodeTerminal = lazy(() => loadCliTerminal().then((module) => ({ default: module.OpenCodeTerminal })));
const T3Code = lazy(() => loadToolRoute().then((module) => ({ default: module.T3Code })));
const CodeEditor = lazy(() => loadToolRoute().then((module) => ({ default: module.CodeEditor })));
const Previews = lazy(() => loadToolRoute().then((module) => ({ default: module.Previews })));
const Browser = lazy(() => loadToolRoute().then((module) => ({ default: module.Browser })));
const TechTldrs = lazy(() => loadTechTldrs().then((module) => ({ default: module.TechTldrs })));

function RouteFallback() {
  return <div className="route-skeleton" aria-label="Ansicht wird geladen"><span /><span /><span /></div>;
}

function DeferredRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
  useEffect(() => {
    const windowWithIdle = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (windowWithIdle.requestIdleCallback) {
      const handle = windowWithIdle.requestIdleCallback(prefetchAllRoutes, { timeout: 2_000 });
      return () => windowWithIdle.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(prefetchAllRoutes, 600);
    return () => window.clearTimeout(handle);
  }, []);
  return (
    <PwaInstallProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="workbench" element={<DeferredRoute><Workbench /></DeferredRoute>} />
            <Route path="tech-tldrs" element={<DeferredRoute><TechTldrs /></DeferredRoute>} />
            <Route path="projects" element={<DeferredRoute><Projects /></DeferredRoute>} />
            <Route path="projects/:projectId" element={<DeferredRoute><ProjectDetail /></DeferredRoute>} />
            <Route path="settings" element={<DeferredRoute><Settings /></DeferredRoute>} />
            <Route path="usage" element={<DeferredRoute><Usage /></DeferredRoute>} />
            <Route path="t3-code" element={<DeferredRoute><T3Code /></DeferredRoute>} />
            <Route path="code-editor" element={<DeferredRoute><CodeEditor /></DeferredRoute>} />
            <Route path="previews" element={<DeferredRoute><Previews /></DeferredRoute>} />
            <Route path="browser" element={<DeferredRoute><Browser /></DeferredRoute>} />
            <Route path="terminal" element={<DeferredRoute><TerminalView /></DeferredRoute>} />
            <Route path="codex" element={<DeferredRoute><CodexTerminal /></DeferredRoute>} />
            <Route path="opencode" element={<DeferredRoute><OpenCodeTerminal /></DeferredRoute>} />
            <Route path="*" element={<Dashboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PwaInstallProvider>
  );
}
