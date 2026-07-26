import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";
import { reportCrash } from "../lib/crashReport";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Erscheint in der Ersatzansicht, damit man sieht, welcher Teil ausgefallen ist. */
  label?: string;
  /** Ohne eigene Ersatzansicht bleibt nur der Crash-Dialog über der leeren Fläche. */
  silent?: boolean;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Fängt Renderfehler ab, damit ein kaputtes Teilstück nicht die ganze Oberfläche
 * weißfärbt. Der Fehler geht an den Crash-Report, der Rest der App läuft weiter.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportCrash({ kind: "render", error, componentStack: info.componentStack ?? null });
  }

  private readonly retry = () => this.setState({ failed: false });

  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    return (
      <div className="boundary-fallback" role="alert">
        <AlertOctagon className="h-6 w-6 shrink-0 text-bad" />
        <div>
          <strong>{this.props.label ?? "Dieser Bereich"} konnte nicht angezeigt werden.</strong>
          <span>Der Crash-Report steht im Fenster darüber — kopieren und einem KI-Agenten geben.</span>
        </div>
        <div className="boundary-fallback-actions">
          <button type="button" className="quiet-button" onClick={this.retry}>Erneut versuchen</button>
          <button type="button" className="quiet-button" onClick={() => window.location.reload()}>Neu laden</button>
        </div>
      </div>
    );
  }
}
