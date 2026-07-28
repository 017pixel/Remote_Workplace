import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
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
  loadGallery,
  prefetchAllRoutes,
  loadPreviewGroup,
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
const GalleryView = lazy(() => loadGallery().then((module) => ({ default: module.GalleryView })));
const PreviewGroupRoute = lazy(() => loadPreviewGroup().then((module) => ({ default: module.PreviewGroupRoute })));
const PreviewGroupWindowRoute = lazy(() => loadPreviewGroup().then((module) => ({ default: module.PreviewGroupWindowRoute })));

function RouteFallback() {
  return <div className="route-skeleton" aria-label="Ansicht wird geladen"><span /><span /><span /></div>;
}

// Eigene Boundary je Route: stürzt eine Ansicht ab, bleiben Sidebar und Navigation bedienbar.
//
// Der key ist bewusst der Pfad beim *Einhängen* und nicht die laufende Adresse.
// Mit `location.pathname` wechselte er bei jeder Navigation für jede geparkte
// Route mit — React warf damit sämtliche zwischengespeicherten Ansichten weg und
// baute sie neu auf. Genau deshalb luden T3 Code, Terminal und Code-Server bei
// jedem Wechsel neu, obwohl der PersistentOutlet sie hielt. Nach einem Absturz
// setzt die Boundary sich über ihren eigenen Knopf „Erneut versuchen" zurück.
function DeferredRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const mountedPath = useRef(location.pathname);
  return (
    <ErrorBoundary key={mountedPath.current} label="Diese Ansicht">
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
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
          {/* Eigenes Browserfenster: bewusst ohne Workbench-Navigation. */}
          <Route path="previews/fenster/:groupId" element={<DeferredRoute><PreviewGroupWindowRoute /></DeferredRoute>} />
          <Route element={<AppShell />}>
            <Route index element={<DeferredRoute><Dashboard /></DeferredRoute>} />
            <Route path="workbench" element={<DeferredRoute><Workbench /></DeferredRoute>} />
            <Route path="tech-tldrs" element={<DeferredRoute><TechTldrs /></DeferredRoute>} />
            <Route path="projects" element={<DeferredRoute><Projects /></DeferredRoute>} />
            <Route path="projects/:projectId" element={<DeferredRoute><ProjectDetail /></DeferredRoute>} />
            <Route path="gallery" element={<DeferredRoute><GalleryView /></DeferredRoute>} />
            <Route path="settings" element={<DeferredRoute><Settings /></DeferredRoute>} />
            <Route path="usage" element={<DeferredRoute><Usage /></DeferredRoute>} />
            <Route path="t3-code" element={<DeferredRoute><T3Code /></DeferredRoute>} />
            <Route path="code-editor" element={<DeferredRoute><CodeEditor /></DeferredRoute>} />
            <Route path="previews" element={<DeferredRoute><Previews /></DeferredRoute>} />
            <Route path="previews/gruppe/:groupId" element={<DeferredRoute><PreviewGroupRoute /></DeferredRoute>} />
            <Route path="browser" element={<DeferredRoute><Browser /></DeferredRoute>} />
            <Route path="terminal" element={<DeferredRoute><TerminalView /></DeferredRoute>} />
            <Route path="codex" element={<DeferredRoute><CodexTerminal /></DeferredRoute>} />
            <Route path="opencode" element={<DeferredRoute><OpenCodeTerminal /></DeferredRoute>} />
            <Route path="*" element={<DeferredRoute><Dashboard /></DeferredRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PwaInstallProvider>
  );
}
