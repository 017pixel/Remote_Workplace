import { lazy, Suspense, useRef, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router";
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
  loadHermes,
  loadUsage,
  loadWorkbench,
  loadInbox,
  loadTechTldrs,
  loadFileManager,
  loadPreviewGroup,
  loadPreviewLive,
  loadSkillEditor,
  loadRouteWithRecovery,
} from "./lib/routeModules";

const Workbench = lazy(() => loadRouteWithRecovery(loadWorkbench).then((module) => ({ default: module.Workbench })));
const Inbox = lazy(() => loadRouteWithRecovery(loadInbox).then((module) => ({ default: module.Inbox })));
const Projects = lazy(() => loadRouteWithRecovery(loadProjects).then((module) => ({ default: module.Projects })));
const ProjectDetail = lazy(() => loadRouteWithRecovery(loadProjectDetail).then((module) => ({ default: module.ProjectDetail })));
const Settings = lazy(() => loadRouteWithRecovery(loadSettings).then((module) => ({ default: module.Settings })));
const Usage = lazy(() => loadRouteWithRecovery(loadUsage).then((module) => ({ default: module.Usage })));
const TerminalView = lazy(() => loadRouteWithRecovery(loadTerminal).then((module) => ({ default: module.TerminalView })));
const TerminalWindowRoute = lazy(() => loadRouteWithRecovery(loadTerminal).then((module) => ({ default: module.TerminalWindowRoute })));
const CodexTerminal = lazy(() => loadRouteWithRecovery(loadCliTerminal).then((module) => ({ default: module.CodexTerminal })));
const OpenCodeTerminal = lazy(() => loadRouteWithRecovery(loadCliTerminal).then((module) => ({ default: module.OpenCodeTerminal })));
const ClaudeCodeTerminal = lazy(() => loadRouteWithRecovery(loadCliTerminal).then((module) => ({ default: module.ClaudeCodeTerminal })));
const T3Code = lazy(() => loadRouteWithRecovery(loadToolRoute).then((module) => ({ default: module.T3Code })));
const HermesAgent = lazy(() => loadRouteWithRecovery(loadHermes).then((module) => ({ default: module.HermesRoute })));
const CodeEditor = lazy(() => loadRouteWithRecovery(loadToolRoute).then((module) => ({ default: module.CodeEditor })));
const Previews = lazy(() => loadRouteWithRecovery(loadToolRoute).then((module) => ({ default: module.Previews })));
const Browser = lazy(() => loadRouteWithRecovery(loadToolRoute).then((module) => ({ default: module.Browser })));
const TechTldrs = lazy(() => loadRouteWithRecovery(loadTechTldrs).then((module) => ({ default: module.TechTldrs })));
const FileManagerView = lazy(() => loadRouteWithRecovery(loadFileManager).then((module) => ({ default: module.FileManagerView })));
const PreviewGroupRoute = lazy(() => loadRouteWithRecovery(loadPreviewGroup).then((module) => ({ default: module.PreviewGroupRoute })));
const PreviewGroupWindowRoute = lazy(() => loadRouteWithRecovery(loadPreviewGroup).then((module) => ({ default: module.PreviewGroupWindowRoute })));
const PreviewLiveWindowRoute = lazy(() => loadRouteWithRecovery(loadPreviewLive).then((module) => ({ default: module.PreviewLiveWindowRoute })));
const SkillEditor = lazy(() => loadRouteWithRecovery(loadSkillEditor).then((module) => ({ default: module.SkillEditor })));

function RouteFallback() {
  return <div className="route-skeleton" aria-label="Ansicht wird geladen"><span /><span /><span /></div>;
}

function NotFound() {
  return (
    <main className="route-not-found">
      <span>404</span>
      <h1>Diese Seite gibt es nicht</h1>
      <p>Der Link ist ungültig oder die Ansicht wurde verschoben.</p>
      <Link to="/">Zum Dashboard</Link>
    </main>
  );
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
  return (
    <PwaInstallProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          {/* Eigenes Browserfenster: bewusst ohne Workbench-Navigation. */}
          <Route path="previews/fenster/:groupId" element={<DeferredRoute><PreviewGroupWindowRoute /></DeferredRoute>} />
          <Route path="previews/live" element={<DeferredRoute><PreviewLiveWindowRoute /></DeferredRoute>} />
          <Route path="terminal/fenster/:runtimeId" element={<DeferredRoute><TerminalWindowRoute /></DeferredRoute>} />
          <Route element={<AppShell />}>
            <Route index element={<DeferredRoute><Dashboard /></DeferredRoute>} />
            <Route path="workbench" element={<DeferredRoute><Workbench /></DeferredRoute>} />
            <Route path="inbox" element={<DeferredRoute><Inbox /></DeferredRoute>} />
            <Route path="tech-tldrs" element={<DeferredRoute><TechTldrs /></DeferredRoute>} />
            <Route path="projects" element={<DeferredRoute><Projects /></DeferredRoute>} />
            <Route path="projects/:projectId" element={<DeferredRoute><ProjectDetail /></DeferredRoute>} />
            <Route path="files" element={<DeferredRoute><FileManagerView /></DeferredRoute>} />
            <Route path="ki-skills" element={<DeferredRoute><SkillEditor /></DeferredRoute>} />
            <Route path="gallery" element={<Navigate to="/files" replace />} />
            <Route path="settings" element={<DeferredRoute><Settings /></DeferredRoute>} />
            <Route path="usage" element={<DeferredRoute><Usage /></DeferredRoute>} />
            <Route path="t3-code" element={<DeferredRoute><T3Code /></DeferredRoute>} />
            <Route path="hermes-agent" element={<DeferredRoute><HermesAgent /></DeferredRoute>} />
            <Route path="code-editor" element={<DeferredRoute><CodeEditor /></DeferredRoute>} />
            <Route path="previews" element={<DeferredRoute><Previews /></DeferredRoute>} />
            <Route path="previews/gruppe/:groupId" element={<DeferredRoute><PreviewGroupRoute /></DeferredRoute>} />
            <Route path="browser" element={<DeferredRoute><Browser /></DeferredRoute>} />
            <Route path="terminal" element={<DeferredRoute><TerminalView /></DeferredRoute>} />
            <Route path="codex" element={<DeferredRoute><CodexTerminal /></DeferredRoute>} />
            <Route path="opencode" element={<DeferredRoute><OpenCodeTerminal /></DeferredRoute>} />
            <Route path="claude" element={<DeferredRoute><ClaudeCodeTerminal /></DeferredRoute>} />
            <Route path="*" element={<DeferredRoute><NotFound /></DeferredRoute>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PwaInstallProvider>
  );
}
