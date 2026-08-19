import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import type {
  CatalogEntry,
  ExtensionLifecycleState,
  ExtensionPermissionId,
  ExtensionPermissionRequest,
  ExtensionRegistrySummary,
  ExtensionTrustLevel,
} from "@wrapt/extension-contracts";
import { CheckIcon, CloseIcon, DownloadIcon, LoaderIcon, RefreshIcon, TrashIcon, WarningIcon } from "../icons";
import { Badge } from "../primitives";
import { ConfirmDialog } from "../ModalDialog";
import { apiClient, ApiClientError } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";

const lifecycleLabels: Record<ExtensionLifecycleState, string> = {
  available: "Im Catalog",
  staging: "Wird vorbereitet",
  installing: "Wird installiert",
  "permissions-pending": "Berechtigungen ausstehend",
  installed: "Installiert",
  disabled: "Deaktiviert",
  enabling: "Wird aktiviert",
  activating: "Wird aktiviert",
  active: "Aktiv",
  deactivating: "Wird deaktiviert",
  crashed: "Abgestürzt",
  quarantined: "Quarantäne",
  incompatible: "Inkompatibel",
  updating: "Wird aktualisiert",
  "migration-failed": "Migration fehlgeschlagen",
  uninstalling: "Wird deinstalliert",
  "update-available": "Update verfügbar",
};

function lifecycleTone(lifecycle: ExtensionLifecycleState): "default" | "ok" | "warn" | "bad" | "accent" {
  switch (lifecycle) {
    case "active":
      return "ok";
    case "permissions-pending":
    case "update-available":
      return "accent";
    case "crashed":
    case "quarantined":
    case "incompatible":
    case "migration-failed":
      return "bad";
    case "staging":
    case "installing":
    case "installed":
    case "enabling":
    case "activating":
    case "deactivating":
    case "updating":
    case "uninstalling":
      return "warn";
    default:
      return "default";
  }
}

const trustLabels: Record<ExtensionTrustLevel, string> = {
  system: "System",
  builtin: "Eingebaut",
  "catalog-first-party": "Erster-Partei-Catalog",
  developer: "Entwickler",
  "sandboxed-webview": "Sandbox",
};

const permissionLabels: Record<ExtensionPermissionId, string> = {
  "projects.read": "Projekte lesen",
  "projects.write": "Projekte ändern",
  "files.read": "Dateien lesen",
  "files.write": "Dateien ändern",
  "git.read": "Git lesen",
  "git.write": "Git ändern",
  "terminal.create": "Terminals öffnen",
  "terminal.input": "Terminal-Eingaben senden",
  "process.execute": "Prozesse ausführen",
  "network.fetch": "Netzwerkzugriff",
  "notifications.create": "Benachrichtigungen senden",
  "browser.control": "Browser steuern",
  "preview.read": "Previews lesen",
  "preview.manage": "Previews verwalten",
  "agents.invoke": "Agenten aufrufen",
  "agents.tools.register": "Agenten-Werkzeuge registrieren",
  "agents.skills.register": "Agenten-Skills registrieren",
  "storage.read": "Speicher lesen",
  "storage.write": "Speicher ändern",
  "secrets.request": "Secrets anfordern",
  "system.metrics.read": "System-Metriken lesen",
  "system.services.read": "Dienste lesen",
  "system.services.control": "Dienste steuern",
};

function permissionRequestLabel(request: ExtensionPermissionRequest): string {
  const base = permissionLabels[request.permission] ?? request.permission;
  const details: string[] = [];
  for (const [key, value] of Object.entries(request)) {
    if (key === "permission" || value === undefined || value === null) continue;
    if (typeof value === "string" && value.length > 0) details.push(`${key}: ${value}`);
  }
  return details.length > 0 ? `${base} (${details.join(", ")})` : base;
}

export function ExtensionSettings() {
  const queryClient = useQueryClient();
  const catalog = useQuery(wraptQueries.extensionCatalog());
  const registry = useQuery(wraptQueries.extensionRegistry());
  const [tab, setTab] = useState<"catalog" | "installed">("catalog");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [reviewExtension, setReviewExtension] = useState<ExtensionRegistrySummary | null>(null);
  const [uninstallExtension, setUninstallExtension] = useState<ExtensionRegistrySummary | null>(null);

  const installedById = useMemo(() => {
    const map = new Map<string, ExtensionRegistrySummary>();
    for (const entry of registry.data?.extensions ?? []) {
      if (entry.lifecycle !== "available") map.set(entry.id, entry);
    }
    return map;
  }, [registry.data]);

  // Die Antwort jeder Operation trägt die aktuelle Registry-Revision. Solange
  // die Registry-Query noch nicht neu geladen ist, gilt diese als
  // Fortschrittsstand für die nächste Operation — sonst läuft die Folgeaktion
  // mit einer veralteten Revision in einen 409-Konflikt.
  const latestRevisionRef = useRef<number | null>(null);
  const expectedRevision = () => registry.data?.revision ?? latestRevisionRef.current ?? 0;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["extensions", "registry"] });
    void queryClient.invalidateQueries({ queryKey: ["extensions", "catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["extensions", "detail"] });
  };

  const runOperation = async (body: Parameters<typeof apiClient.dispatchExtensionOperation>[0]) => {
    setBusyId(body.extensionId);
    setMessage(null);
    try {
      const accepted = await apiClient.dispatchExtensionOperation(body);
      if (accepted !== undefined) latestRevisionRef.current = accepted.revision;
      setMessage({ tone: "ok", text: `„${accepted?.extension.name ?? body.extensionId}" ${accepted?.operation.status === "succeeded" ? "erfolgreich verarbeitet." : "wurde eingeplant."}` });
      // Ein offener Permission Review wird sofort vorgelegt — der Nutzer muss
      // nicht erst in den Installierte-Tab wechseln.
      if (accepted?.extension.permissionReview !== undefined) {
        setReviewExtension(accepted.extension);
      }
      refresh();
    } catch (error) {
      setMessage({ tone: "bad", text: error instanceof ApiClientError ? error.message : "Die Aktion ist fehlgeschlagen." });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const install = (entry: CatalogEntry) => {
    const catalogRevision = catalog.data?.revision;
    const providerId = catalog.data?.providerId;
    if (catalogRevision === undefined || providerId === undefined) return;
    void runOperation({
      operation: "install",
      extensionId: entry.manifest.id,
      expectedRevision: expectedRevision(),
      source: {
        kind: "catalog",
        providerId,
        catalogRevision,
        version: entry.manifest.version,
        packageIntegrity: entry.package.integrity,
      },
      enableAfterInstall: true,
    });
  };

  const update = (extension: ExtensionRegistrySummary, entry: CatalogEntry) => {
    const catalogRevision = catalog.data?.revision;
    const providerId = catalog.data?.providerId;
    if (catalogRevision === undefined || providerId === undefined) return;
    void runOperation({
      operation: "update",
      extensionId: extension.id,
      expectedRevision: expectedRevision(),
      target: {
        providerId,
        catalogRevision,
        version: entry.manifest.version,
        packageIntegrity: entry.package.integrity,
      },
    });
  };

  const toggle = (extension: ExtensionRegistrySummary) => {
    void runOperation({
      operation: extension.desiredEnablement === "enabled" ? "disable" : "enable",
      extensionId: extension.id,
      expectedRevision: expectedRevision(),
    });
  };

  const confirmUninstall = (deleteData: "retain" | "delete") => {
    const extension = uninstallExtension;
    if (extension === null) return;
    setUninstallExtension(null);
    void runOperation({
      operation: "uninstall",
      extensionId: extension.id,
      expectedRevision: expectedRevision(),
      data: deleteData,
    });
  };

  const installed = (registry.data?.extensions ?? []).filter((extension) => extension.lifecycle !== "available");

  return (
    <div className="space-y-3">
      <div className="settings-segment" role="group" aria-label="Extensions-Bereich">
        <button type="button" aria-pressed={tab === "catalog"} onClick={() => setTab("catalog")} className={`settings-segment-option ${tab === "catalog" ? "is-selected" : ""}`}>
          <span className="flex items-center gap-2 font-medium text-text"><DownloadIcon className="h-3.5 w-3.5" /> Entdecken</span>
          <span className="text-[11px] text-faint">Lokaler Catalog</span>
        </button>
        <button type="button" aria-pressed={tab === "installed"} onClick={() => setTab("installed")} className={`settings-segment-option ${tab === "installed" ? "is-selected" : ""}`}>
          <span className="flex items-center gap-2 font-medium text-text"><CheckIcon className="h-3.5 w-3.5" /> Installiert</span>
          <span className="text-[11px] text-faint">{installed.length} {installed.length === 1 ? "Extension" : "Extensions"}</span>
        </button>
      </div>

      {tab === "catalog" ? (
        <div className="extension-list">
          {catalog.isLoading ? <div className="settings-notification-skeleton"><span /><span /><span /></div> : null}
          {catalog.data?.entries.length === 0 && !catalog.isLoading ? (
            <p className="text-[12px] text-muted">Der lokale Catalog ist leer. Pakete werden im Verzeichnis <code className="font-mono">data/extension-catalog</code> abgelegt.</p>
          ) : null}
          {(catalog.data?.entries ?? []).map((entry) => {
            const current = installedById.get(entry.manifest.id);
            const isBusy = busyId === entry.manifest.id;
            return (
              <div key={entry.manifest.id} className="extension-row">
                <div className="extension-row-copy">
                  <strong>{entry.manifest.name}</strong>
                  <span className="font-mono text-[11px] text-faint">{entry.manifest.publisher} · v{entry.manifest.version}</span>
                  <small>{entry.manifest.description}</small>
                </div>
                <div className="extension-row-actions">
                  {current === undefined ? (
                    <button type="button" disabled={isBusy || catalog.data === undefined || registry.data === undefined} onClick={() => install(entry)} className="quiet-button-primary">
                      {isBusy ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />} Installieren
                    </button>
                  ) : (
                    <>
                      <Badge tone={lifecycleTone(current.lifecycle)}>
                        {current.lifecycle === "update-available" ? `Update auf v${entry.manifest.version}` : lifecycleLabels[current.lifecycle]}
                      </Badge>
                      {current.lifecycle === "permissions-pending" ? (
                        <button type="button" disabled={isBusy} onClick={() => setReviewExtension(current)} className="quiet-button-primary">
                          <WarningIcon className="h-3.5 w-3.5" /> Berechtigungen prüfen
                        </button>
                      ) : null}
                      {current.lifecycle === "update-available" ? (
                        <button type="button" disabled={isBusy} onClick={() => update(current, entry)} className="quiet-button">
                          {isBusy ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <RefreshIcon className="h-3.5 w-3.5" />} Aktualisieren
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="extension-list">
          {registry.isLoading ? <div className="settings-notification-skeleton"><span /><span /><span /></div> : null}
          {installed.length === 0 && !registry.isLoading ? (
            <p className="text-[12px] text-muted">Noch keine Extensions installiert. Im Bereich „Entdecken" findest du den lokalen Catalog.</p>
          ) : null}
          {installed.map((extension) => {
            const isBusy = busyId === extension.id;
            const pendingReview = extension.permissionReview;
            return (
              <div key={extension.id} className="extension-row">
                <div className="extension-row-copy">
                  <strong>{extension.name}</strong>
                  <span className="font-mono text-[11px] text-faint">
                    {extension.publisher} · v{extension.installedVersion ?? "—"}
                    {extension.availableVersion !== undefined && extension.availableVersion !== extension.installedVersion ? ` · verfügbar v${extension.availableVersion}` : ""}
                  </span>
                  <small>{extension.description}</small>
                  <span className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge tone={lifecycleTone(extension.lifecycle)}>{lifecycleLabels[extension.lifecycle]}</Badge>
                    <span className="text-[11px] text-faint">Vertrauensstufe: {trustLabels[extension.effectiveTrust]}</span>
                  </span>
                </div>
                <div className="extension-row-actions">
                  {pendingReview !== undefined ? (
                    <button type="button" className="quiet-button-primary" onClick={() => setReviewExtension(extension)}>
                      <WarningIcon className="h-3.5 w-3.5" /> Berechtigungen prüfen
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => toggle(extension)}
                        aria-label={`${extension.desiredEnablement === "enabled" ? "Deaktivieren" : "Aktivieren"}: ${extension.name}`}
                        className={`settings-toggle-switch ${extension.desiredEnablement === "enabled" ? "is-on" : ""}`}
                        role="switch"
                        aria-checked={extension.desiredEnablement === "enabled"}
                      >
                        <span className="settings-toggle-thumb" />
                      </button>
                      {extension.availableVersion !== undefined && extension.availableVersion !== extension.installedVersion ? (
                        <button type="button" disabled={isBusy} onClick={() => { const entry = catalog.data?.entries.find((candidate) => candidate.manifest.id === extension.id); if (entry) update(extension, entry); }} className="quiet-button">
                          {isBusy ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <RefreshIcon className="h-3.5 w-3.5" />} Aktualisieren
                        </button>
                      ) : null}
                      <button type="button" disabled={isBusy} className="quiet-button" onClick={() => setUninstallExtension(extension)}>
                        <TrashIcon className="h-3.5 w-3.5" /> Deinstallieren
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {message ? (
        <p className={`flex items-start gap-2 text-[12px] ${message.tone === "bad" ? "text-bad" : "text-ok"}`} role="status">
          {message.tone === "bad" ? <WarningIcon className="h-3.5 w-3.5 shrink-0" /> : <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
          <span>{message.text}</span>
        </p>
      ) : null}

      <p className="text-[12px] text-faint">
        Extensions laufen serverseitig mit eigner Berechtigungsprüfung. Jede neue Berechtigungsanfrage wird vor der Aktivierung einzeln vorgelegt.
      </p>

      {reviewExtension?.permissionReview ? (
        <PermissionReviewDialog
          extension={reviewExtension}
          onClose={() => setReviewExtension(null)}
          onResolve={(resolution) => {
            const review = reviewExtension.permissionReview;
            if (review === undefined) return;
            setReviewExtension(null);
            void runOperation({
              operation: "review-permissions",
              extensionId: reviewExtension.id,
              expectedRevision: expectedRevision(),
              reviewId: review.reviewId,
              resolution,
            });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={uninstallExtension !== null}
        title={`„${uninstallExtension?.name ?? ""}" deinstallieren?`}
        description="Die Extension wird deaktiviert und aus der Registry entfernt. Installationsdaten werden gelöscht; eine spätere Installation aus dem Catalog bleibt möglich."
        confirmLabel="Deinstallieren"
        danger
        onConfirm={() => confirmUninstall("delete")}
        onClose={() => setUninstallExtension(null)}
      />
    </div>
  );
}

function PermissionReviewDialog({
  extension,
  onClose,
  onResolve,
}: {
  extension: ExtensionRegistrySummary;
  onClose: () => void;
  onResolve: (resolution: { decision: "approve"; grants: ExtensionPermissionRequest[] } | { decision: "deny" }) => void;
}) {
  const review = extension.permissionReview;
  if (review === undefined) return null;
  const reasonLabel = review.reason === "install" ? "Installation" : "Update";
  return (
    <div className="extension-review-overlay" role="dialog" aria-modal="true" aria-label={`Berechtigungen für ${extension.name}`}>
      <div className="extension-review-panel">
        <header className="extension-review-header">
          <div>
            <h3>Berechtigungen für „{extension.name}"</h3>
            <p>Die {reasonLabel} fordert neue Zugriffe an. Ohne Freigabe bleibt die Extension inaktiv.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Schließen" onClick={onClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>
        <ul className="extension-review-permissions">
          {review.addedPermissions.map((request) => (
            <li key={JSON.stringify(request)}>
              <span>{permissionRequestLabel(request)}</span>
              <Badge tone={request.permission === "process.execute" || request.permission === "browser.control" || request.permission === "secrets.request" || request.permission === "system.services.control" ? "bad" : "warn"}>
                {request.permission}
              </Badge>
            </li>
          ))}
        </ul>
        <footer className="extension-review-actions">
          <button type="button" className="quiet-button" onClick={() => onResolve({ decision: "deny" })}>
            <CloseIcon className="h-3.5 w-3.5" /> Ablehnen
          </button>
          <button type="button" className="quiet-button-primary" onClick={() => onResolve({ decision: "approve", grants: review.addedPermissions })}>
            <CheckIcon className="h-3.5 w-3.5" /> Alle freigeben
          </button>
        </footer>
      </div>
    </div>
  );
}
