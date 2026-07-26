import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUp, Copy, Download, Eye, Info, GitBranch, Layers, Loader2, MonitorSmartphone, RefreshCw, Rocket, Server, ShieldCheck, Trash2 } from "lucide-react";
import { workbenchQueries } from "../lib/queryOptions";
import { apiClient, ApiClientError } from "../lib/apiClient";
import { writeClipboardText } from "../lib/clipboard";
import { usePwaInstall } from "../lib/usePwaInstall";
import { useWorkspaceStore, WORKSPACE_STORAGE_KEY } from "../stores/workspace";
import { Card } from "../components/Card";
import { Badge } from "../components/primitives";
import { WORKBENCH_LIMITS, type RestartTarget, type T3Channel } from "@workbench/contracts";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ModalDialog";
import { allPageRoutes, useSidebarPreferences, type OrbitPaletteItem, type PageRouteId } from "../stores/sidebarPreferences";

export function Settings() {
  const health = useQuery(workbenchQueries.health());
  const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
  const panelCount = useWorkspaceStore((s) => s.panels.length);
  const workspaceCount = useWorkspaceStore((s) => s.workspaces.length);
  const pwa = usePwaInstall();
  const [resetOpen, setResetOpen] = useState(false);
  const restartCardRef = useRef<HTMLDivElement>(null);
  const [restartHighlighted, setRestartHighlighted] = useState(false);

  // Der Kanal-Hinweis verweist auf die Neustart-Buttons weiter oben. Ohne kurze
  // Hervorhebung übersieht man nach dem Sprung leicht, worauf gezeigt wurde.
  function jumpToRestart() {
    restartCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setRestartHighlighted(true);
    window.setTimeout(() => setRestartHighlighted(false), 2_000);
  }

  return (
    <div className="page-scroll">
      <div className="page-frame max-w-4xl">
        <div className="page-heading">
          <h1>Einstellungen</h1>
          <p>Lokaler Workspace-Zustand und Informationen zur Workbench.</p>
        </div>
        <Card title="Version" subtitle="Wird aus der Health-Antwort gelesen" action={<GitBranch className="h-4 w-4 text-faint" />}>
          <div className="flex items-center gap-3">
            <span className="text-xl font-medium tracking-tight text-text">
              {health.data?.version ?? "—"}
            </span>
            <Badge tone="accent">Remote Workplace</Badge>
          </div>
          {health.data ? (
            <p className="mt-2 text-[12px] text-faint">Backend-Status: {health.data.status}</p>
          ) : null}
        </Card>

        <div ref={restartCardRef} id="restart-controls" className={restartHighlighted ? "settings-jump-target is-active" : "settings-jump-target"}>
          <Card title="Dienst neu starten" subtitle="Nach Code-Änderungen neu bauen und laden – ohne Datenverlust" action={<RefreshCw className="h-4 w-4 text-faint" />}>
            <RestartControls />
          </Card>
        </div>

        <Card title="T3 Code Kanal" subtitle="Stable oder Nightly – gilt für alle T3-Flächen" action={<Rocket className="h-4 w-4 text-faint" />}>
          <T3ChannelControls onJumpToRestart={jumpToRestart} />
        </Card>

        <Card title="Workspace" subtitle="Lokaler, persistenter Zustand">
          <div className="space-y-3 text-[13px]">
            <div className="data-row px-0">
              <span className="text-muted">Geöffnete Panels</span>
              <span className="font-mono text-text">{panelCount} / {WORKBENCH_LIMITS.maxResidentTools}</span>
            </div>
            <div className="data-row px-0">
              <span className="text-muted">Arbeitsflächen</span>
              <span className="font-mono text-text">{workspaceCount} / {WORKBENCH_LIMITS.maxWorkspaces}</span>
            </div>
            <div className="data-row px-0">
              <span className="text-muted">Speicherort</span>
              <span className="font-mono text-[12px] text-faint">{WORKSPACE_STORAGE_KEY}</span>
            </div>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              className="quiet-button border-bad/30 bg-bad-soft/40 text-bad hover:bg-bad-soft"
            >
              <Trash2 className="h-3.5 w-3.5" /> Workspace zurücksetzen
            </button>
          </div>
        </Card>

        <Card title="App installieren" subtitle="Für einen schnellen Zugriff vom Homescreen oder Desktop">
          {pwa.updateAvailable ? <div className="settings-update-row" role="status"><div><strong>Update verfügbar</strong><span>Eine neue Workbench-Version ist bereit.</span></div><button type="button" className="quiet-button-primary" onClick={() => void pwa.applyUpdate()}><Download className="h-3.5 w-3.5" /> Aktualisieren</button></div> : null}
          {pwa.isInstalled ? (
            <p className="text-[13px] text-muted">Die Workbench ist bereits als App installiert.</p>
          ) : pwa.canInstall ? (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void pwa.install()} className="quiet-button-primary">
                <Download className="h-3.5 w-3.5" /> App installieren
              </button>
              <span className="text-[12px] text-faint">Öffnet den Installationsdialog des Browsers.</span>
            </div>
          ) : pwa.isAppleMobile ? (
            <p className="text-[13px] text-muted">
              In Safari auf <span className="text-text">Teilen</span> tippen und <span className="text-text">Zum Home-Bildschirm</span> wählen.
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              Öffne die Workbench in Chrome oder Edge und wähle im Browsermenü <span className="text-text">App installieren</span>.
            </p>
          )}
        </Card>

        <Card title="Orbit-Sidebar" subtitle="Elemente im Infinite Canvas ein- oder ausblenden" action={<Layers className="h-4 w-4 text-faint" />}>
          <OrbitItemToggles />
        </Card>

        <Card title="Seiten-Sichtbarkeit" subtitle="Navigationselemente global steuern (Sidebar, Dashboard, Mobile)" action={<Eye className="h-4 w-4 text-faint" />}>
          <PageVisibilityToggles />
        </Card>

        <Card title="Sicherheit" subtitle="Keine eigene Anmeldung" action={<ShieldCheck className="h-4 w-4 text-faint" />}>
          <ul className="space-y-2 text-[13px] text-muted">
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              Der Zugriff wird über Tailscale/ACLs begrenzt. T3 Code und code-server behalten ihre eigene Authentifizierung.
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              Es werden keine Tokens, Cookies oder Credentials im Zustand gespeichert.
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
              Terminals starten ausschließlich serverseitig freigegebene Shell-, Agent- und Anmeldeprozesse.
            </li>
          </ul>
        </Card>
        <footer className="settings-system-footer"><span>{health.data?.appName ?? "Remote Workplace"}</span><strong>Version {health.data?.version ?? "–"}</strong><span>Lokale Remote-Entwicklungsumgebung</span></footer>
        <ConfirmDialog open={resetOpen} title="Workspace zurücksetzen?" description="Alle geöffneten Panels, Arbeitsflächen und Auswahlen werden lokal gelöscht. Diese Aktion kann nicht rückgängig gemacht werden." confirmLabel="Workspace zurücksetzen" danger onConfirm={resetWorkspace} onClose={() => setResetOpen(false)} />
      </div>
    </div>
  );
}

const restartButtons: { target: RestartTarget; label: string; hint: string; icon: typeof Server }[] = [
  { target: "frontend", label: "Frontend", hint: "Nur die Oberfläche neu bauen", icon: MonitorSmartphone },
  { target: "backend", label: "Backend", hint: "Server neu bauen & neu starten", icon: Server },
  { target: "both", label: "Beides", hint: "Frontend & Backend zusammen", icon: RefreshCw },
];

const restartWorkingLabel: Record<RestartTarget, string> = {
  frontend: "Frontend wird neu gebaut …",
  backend: "Backend wird neu gebaut und neu gestartet …",
  both: "Frontend und Backend werden neu gebaut …",
};

type RestartUiPhase =
  | { status: "idle" }
  | { status: "working"; target: RestartTarget; step: string }
  | { status: "error"; target: RestartTarget; message: string; logTail: string };

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const RESTART_DEADLINE_MS = 300_000;

function RestartControls() {
  const [phase, setPhase] = useState<RestartUiPhase>({ status: "idle" });
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => () => { cancelledRef.current = true; }, []);

  // Pollt den echten Skript-Status. Bricht der Build ab, steht die Ursache sofort da,
  // statt dass die Oberfläche fünf Minuten lang ins Leere wartet.
  async function waitForResult(
    target: RestartTarget,
    baseline: { bootId: string; webBuildId: number | null },
  ): Promise<{ ok: true } | { ok: false; message: string; logTail: string }> {
    const deadline = Date.now() + RESTART_DEADLINE_MS;
    let lastLogTail = "";
    let scriptFinished = false;
    while (Date.now() < deadline) {
      await sleep(1_500);
      if (cancelledRef.current) return { ok: true };
      try {
        const status = await apiClient.restartStatus();
        if (!status) continue;
        lastLogTail = status.logTail || lastLogTail;
        if (status.phase === "failed") {
          return { ok: false, message: status.message || "Der Neustart ist fehlgeschlagen.", logTail: status.logTail };
        }
        if (status.phase === "running" && status.step) {
          setPhase({ status: "working", target, step: status.step });
        }
        scriptFinished = status.phase === "succeeded";
        // Der Marker zählt, nicht das Skriptende: "backend"/"both" melden Erfolg schon,
        // bevor der Dienst wirklich neu gestartet ist.
        const backendRestarted = status.bootId !== baseline.bootId;
        const frontendRebuilt = status.webBuildId !== null && status.webBuildId !== baseline.webBuildId;
        if (scriptFinished && (target === "frontend" ? frontendRebuilt : backendRestarted)) return { ok: true };
      } catch {
        // Während des Backend-Neustarts ist der Server kurz nicht erreichbar — weiter pollen.
      }
    }
    return {
      ok: false,
      message: scriptFinished
        ? "Der Build lief durch, aber der Dienst meldet sich nicht zurück. Prüfe: systemctl --user status workbench.service"
        : "Zeitüberschreitung — der Neustart hat zu lange gebraucht.",
      logTail: lastLogTail,
    };
  }

  async function handleRestart(target: RestartTarget) {
    cancelledRef.current = false;
    setLogOpen(false);
    setCopied(false);
    setPhase({ status: "working", target, step: "Neustart wird angestoßen …" });
    try {
      const response = await apiClient.restartSystem(target);
      if (!response) throw new Error("Keine Antwort vom Server erhalten.");
      const result = await waitForResult(target, { bootId: response.bootId, webBuildId: response.webBuildId });
      if (cancelledRef.current) return;
      if (result.ok) {
        window.location.reload();
        return;
      }
      setPhase({ status: "error", target, message: result.message, logTail: result.logTail });
    } catch (error) {
      if (cancelledRef.current) return;
      const message = error instanceof ApiClientError ? error.message : "Der Neustart konnte nicht ausgelöst werden.";
      // Auch wenn das Auslösen scheitert: Der letzte Log-Ausschnitt hilft bei der Ursachensuche.
      const status = await apiClient.restartStatus().catch(() => null);
      setPhase({ status: "error", target, message, logTail: status?.logTail ?? "" });
    }
  }

  const working = phase.status === "working";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {restartButtons.map(({ target, label, hint, icon: Icon }) => {
          const isActive = working && phase.target === target;
          return (
            <button
              key={target}
              type="button"
              disabled={working}
              onClick={() => void handleRestart(target)}
              className={`quiet-button grow basis-40 flex-col items-start gap-1 py-2.5 ${target === "both" ? "border-accent-line" : ""}`}
              title={hint}
            >
              <span className="flex items-center gap-2 font-medium text-text">
                {isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                {label}
              </span>
              <span className="text-[11px] text-faint">{hint}</span>
            </button>
          );
        })}
      </div>
      {phase.status === "working" ? (
        <div className="space-y-1" role="status">
          <p className="flex items-center gap-2 text-[12px] text-muted">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> {restartWorkingLabel[phase.target]} Die Seite lädt automatisch neu, sobald es fertig ist.
          </p>
          <p className="pl-[22px] text-[11px] text-faint">{phase.step}</p>
        </div>
      ) : phase.status === "error" ? (
        <div className="space-y-2" role="alert">
          <p className="flex items-start gap-2 text-[12px] text-bad">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> <span>{phase.message}</span>
          </p>
          {phase.logTail ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="quiet-button" onClick={() => setLogOpen((open) => !open)}>
                  {logOpen ? "Log ausblenden" : "Log anzeigen"}
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    void writeClipboardText(`Neustart (${phase.target}) fehlgeschlagen: ${phase.message}\n\n${phase.logTail}`)
                      .then(() => setCopied(true))
                      .catch(() => setCopied(false));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> {copied ? "Kopiert" : "Log kopieren"}
                </button>
              </div>
              {logOpen ? <pre className="restart-log">{phase.logTail}</pre> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] text-faint">
          Geöffnete Panels, Arbeitsflächen und Galerie-Daten bleiben erhalten. Nur laufende Terminals werden beim Backend-Neustart unterbrochen.
        </p>
      )}
    </div>
  );
}

const t3ChannelLabels: Record<T3Channel, string> = { stable: "Stable", nightly: "Nightly" };
const t3ChannelHints: Record<T3Channel, string> = {
  stable: "Geprüfte Veröffentlichung (t3@latest)",
  nightly: "Täglicher Vorabbau (t3@nightly)",
};
const t3Channels: T3Channel[] = ["stable", "nightly"];

// Der Wechsel wird bewusst nur gespeichert. Angewendet wird er beim nächsten Neustart
// über Backend/Beides — deshalb der Verweis auf die Neustart-Buttons statt eines
// automatischen Neustarts.
function T3ChannelControls({ onJumpToRestart }: { onJumpToRestart: () => void }) {
  const queryClient = useQueryClient();
  const channel = useQuery(workbenchQueries.t3Channel());
  const [saving, setSaving] = useState<T3Channel | null>(null);
  const [error, setError] = useState("");
  const status = channel.data;

  async function selectChannel(next: T3Channel) {
    if (saving !== null || status?.configuredChannel === next) return;
    setSaving(next);
    setError("");
    try {
      const updated = await apiClient.setT3Channel(next);
      if (updated) queryClient.setQueryData(workbenchQueries.t3Channel().queryKey, updated);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Der Kanal konnte nicht gespeichert werden.");
      void channel.refetch();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="settings-segment" role="group" aria-label="T3 Code Kanal">
        {t3Channels.map((option) => {
          const selected = status?.configuredChannel === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              disabled={saving !== null || status === undefined}
              onClick={() => void selectChannel(option)}
              className={`settings-segment-option ${selected ? "is-selected" : ""}`}
            >
              <span className="flex items-center gap-2 font-medium text-text">
                {saving === option ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t3ChannelLabels[option]}
              </span>
              <span className="text-[11px] text-faint">{t3ChannelHints[option]}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 text-[13px]">
        <div className="data-row px-0">
          <span className="text-muted">Aktiv installiert</span>
          <span className="font-mono text-text">
            {status === undefined
              ? "—"
              : status.activeChannel === null
                ? "nicht installiert"
                : `${t3ChannelLabels[status.activeChannel]} · v${status.activeVersion ?? "?"}`}
          </span>
        </div>
        <div className="data-row px-0">
          <span className="text-muted">Eingestellt</span>
          <span className="font-mono text-text">{status ? t3ChannelLabels[status.configuredChannel] : "—"}</span>
        </div>
        <div className="data-row px-0">
          <span className="text-muted">Instanz auf Port {status?.port ?? 3773}</span>
          <Badge tone={status?.reachable ? "ok" : "warn"}>{status?.reachable ? "erreichbar" : "nicht erreichbar"}</Badge>
        </div>
      </div>

      {error ? (
        <p className="flex items-start gap-2 text-[12px] text-bad" role="alert">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
        </p>
      ) : null}

      {status?.restartRequired ? (
        <div className="settings-update-row" role="status">
          <div>
            <strong>Neustart erforderlich</strong>
            <span>
              {t3ChannelLabels[status.configuredChannel]} ist gespeichert, läuft aber noch nicht. Der Kanal wird erst
              beim nächsten Neustart (Backend oder Beides) installiert und gestartet.
            </span>
          </div>
          <button type="button" className="quiet-button-primary" onClick={onJumpToRestart}>
            <ArrowUp className="h-3.5 w-3.5" /> Zu den Neustart-Buttons
          </button>
        </div>
      ) : (
        <p className="text-[12px] text-faint">
          Alle T3-Flächen (Panel, Orbit, Projekt-Detail und die Seite T3 Code) nutzen dieselbe Instanz. Threads und
          Daten liegen in einem gemeinsamen Verzeichnis und bleiben beim Kanalwechsel erhalten.
        </p>
      )}
    </div>
  );
}

const orbitItemLabels: Record<OrbitPaletteItem, string> = {
  "tool:terminal": "Terminal",
  "tool:t3-code": "T3 Code",
  "tool:preview": "Preview",
  "tool:browser": "Browser",
  "tool:code-server": "Code-Server",
  "tool:codex": "Codex",
  "tool:opencode": "OpenCode",
  "gallery:gallery-media": "Mediengalerie",
  "gallery:gallery-files": "Dateigalerie",
  "block:note": "Notiz",
  "block:todo": "To-do-Liste",
  "block:snippet": "Code-Snippet",
  "block:frame": "Bereich",
  "block:usage-codex": "Codex Nutzung",
  "block:usage-opencode": "OpenCode Nutzung",
  "block:usage-claude": "Claude Code Nutzung",
};

const orbitSections: { label: string; items: OrbitPaletteItem[] }[] = [
  { label: "Werkzeuge", items: ["tool:terminal", "tool:t3-code", "tool:preview", "tool:browser", "tool:code-server", "tool:codex", "tool:opencode"] },
  { label: "Galerie", items: ["gallery:gallery-media", "gallery:gallery-files"] },
  { label: "Blöcke", items: ["block:note", "block:todo", "block:snippet", "block:frame", "block:usage-codex", "block:usage-opencode", "block:usage-claude"] },
];

function OrbitItemToggles() {
  const toggleOrbitItem = useSidebarPreferences((s) => s.toggleOrbitItem);
  const hiddenOrbitItems = useSidebarPreferences((s) => s.hiddenOrbitItems);
  return (
    <div className="space-y-4">
      {orbitSections.map((section) => (
        <div key={section.label}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">{section.label}</p>
          <div className="space-y-1">
            {section.items.map((item) => {
              const isHidden = hiddenOrbitItems.has(item);
              return (
                <button key={item} type="button" className="settings-toggle-row" onClick={() => toggleOrbitItem(item)}>
                  <span className="text-[13px] text-text">{orbitItemLabels[item]}</span>
                  <span className={`settings-toggle-switch ${isHidden ? "" : "is-on"}`} role="switch" aria-checked={!isHidden} aria-label={orbitItemLabels[item]}>
                    <span className="settings-toggle-thumb" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const pageRouteLabels: Record<PageRouteId, string> = {
  "dashboard": "Dashboard",
  "workbench": "Workbench",
  "tech-tldrs": "Tech TLDRs",
  "projects": "Projekte",
  "t3-code": "T3 Code",
  "codex": "Codex",
  "opencode": "OpenCode",
  "code-editor": "Code-Server",
  "previews": "Previews",
  "browser": "Browser",
  "terminal": "Terminal",
  "gallery": "Galerie",
  "usage": "Nutzung",
  "settings": "Einstellungen",
};

function PageVisibilityToggles() {
  const togglePage = useSidebarPreferences((s) => s.togglePage);
  const hiddenPages = useSidebarPreferences((s) => s.hiddenPages);
  return (
    <div className="space-y-1">
      <p className="mb-2 text-[12px] text-muted">Deaktivierte Seiten werden in der Sidebar, der Dashboard-Navigation und der mobilen Navigation ausgeblendet.</p>
      {allPageRoutes.map((page) => {
        // Die Einstellungen selbst bleiben sichtbar — sonst gäbe es keinen Weg zurück.
        const isLocked = page === "settings";
        const isHidden = !isLocked && hiddenPages.has(page);
        return (
          <button key={page} type="button" className="settings-toggle-row" disabled={isLocked} onClick={() => togglePage(page)} title={isLocked ? "Diese Seite bleibt immer sichtbar" : undefined}>
            <span className="text-[13px] text-text">{pageRouteLabels[page]}{isLocked ? <span className="ml-2 text-[11px] text-faint">immer sichtbar</span> : null}</span>
            <span className={`settings-toggle-switch ${isHidden ? "" : "is-on"} ${isLocked ? "is-locked" : ""}`} role="switch" aria-checked={!isHidden} aria-disabled={isLocked} aria-label={pageRouteLabels[page]}>
              <span className="settings-toggle-thumb" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
