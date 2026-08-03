import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, CopyIcon, ErrorIcon, RefreshIcon } from "./icons";
import {
  dismissCrash,
  formatCrashReport,
  getCurrentCrash,
  subscribeToCrash,
  type CrashEnvironment,
  type CrashReport,
} from "../lib/crashReport";
import { writeClipboardText } from "../lib/clipboard";
import { useModalFocus } from "../lib/useModalFocus";

const unknownEnvironment: CrashEnvironment = { appVersion: null, bootId: null, webBuildId: null, backendReachable: false };

// Absichtlich ohne apiClient: der könnte selbst die Fehlerquelle sein. Ein nackter
// fetch mit Timeout reicht, um Version und bootId für den Bericht nachzuladen.
async function loadEnvironment(): Promise<CrashEnvironment> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    const response = await fetch("/api/v1/health", { signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) return unknownEnvironment;
    const body = await response.json() as { version?: string; bootId?: string; webBuildId?: number | null };
    return {
      appVersion: body.version ?? null,
      bootId: body.bootId ?? null,
      webBuildId: body.webBuildId ?? null,
      backendReachable: true,
    };
  } catch {
    return unknownEnvironment;
  }
}

export function CrashReportDialog() {
  const [report, setReport] = useState<CrashReport | null>(getCurrentCrash);
  const [environment, setEnvironment] = useState<CrashEnvironment>(unknownEnvironment);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeToCrash(setReport), []);

  useEffect(() => {
    if (!report) return;
    setCopyState("idle");
    let active = true;
    void loadEnvironment().then((result) => { if (active) setEnvironment(result); });
    return () => { active = false; };
  }, [report]);

  const close = useCallback(() => {
    dismissCrash();
    setEnvironment(unknownEnvironment);
  }, []);
  useModalFocus(sheetRef, report !== null, close);

  if (!report) return null;

  const text = formatCrashReport(report, environment);

  return (
    <div className="crash-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="crash-title">
      <div ref={sheetRef} className="crash-sheet" tabIndex={-1}>
        <header className="crash-header">
          <div className="crash-header-icon"><ErrorIcon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 id="crash-title">Etwas ist abgestürzt</h2>
            <p>
              Kopiere den Bericht und gib ihn einem KI-Agenten — er enthält bereits die
              Anweisung, was zu tun ist.
            </p>
          </div>
          <button type="button" className="crash-close" onClick={close} aria-label="Schließen">
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="crash-summary">
          <p className="crash-message">{report.message}</p>
          <dl className="crash-facts">
            <div><dt>Route</dt><dd>{report.route}</dd></div>
            <div><dt>Zeitpunkt</dt><dd>{new Date(report.occurredAt).toLocaleString("de-DE")}</dd></div>
            <div><dt>Version</dt><dd>{environment.appVersion ?? "—"}</dd></div>
            <div><dt>Backend</dt><dd>{environment.backendReachable ? "erreichbar" : "nicht erreichbar"}</dd></div>
          </dl>
        </div>

        <pre className="crash-report" aria-label="Vollständiger Crash-Report">{text}</pre>

        <footer className="crash-footer">
          <button
            type="button"
            className="quiet-button-primary"
            onClick={() => {
              void writeClipboardText(text)
                .then(() => setCopyState("copied"))
                .catch(() => setCopyState("failed"));
            }}
          >
            <CopyIcon className="h-4 w-4" />
            {copyState === "copied" ? "Kopiert" : copyState === "failed" ? "Kopieren fehlgeschlagen" : "Bericht kopieren"}
          </button>
          <button type="button" className="quiet-button" onClick={() => window.location.reload()}>
            <RefreshIcon className="h-4 w-4" /> Seite neu laden
          </button>
          <button type="button" className="quiet-button" onClick={close}>Weiterarbeiten</button>
        </footer>
      </div>
    </div>
  );
}
