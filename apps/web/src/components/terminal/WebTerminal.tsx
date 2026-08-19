import { forwardRef, useImperativeHandle } from "react";
import { CloseIcon, RefreshIcon } from "../icons";
import { ConfirmDialog } from "../ModalDialog";
import type { WebTerminalHandle, WebTerminalProps } from "./terminal-types";
import { useTerminalRenderer } from "./engine/useTerminalRenderer";

/**
 * Browser-Terminal für eine stabile Runtime-ID (V2). Nutzt den gemeinsamen
 * multiplexten Transport und die Renderer-Engine: Der Server hält den
 * autoritativen Terminalzustand, dieser Renderer synchronisiert nur, solange
 * er sichtbar ist — beim Detach bleibt die Runtime auf dem Server weiter aktiv.
 */
export const WebTerminal = forwardRef<WebTerminalHandle, WebTerminalProps>(function WebTerminal(
  {
    instanceId,
    kind = "shell",
    projectId = null,
    initialCwd = null,
    active = true,
    renderScale = 1,
    mode = "agent",
    accountId,
    onMetaChange,
  },
  ref,
) {
  const renderer = useTerminalRenderer({
    instanceId, kind, projectId, initialCwd, mode, accountId, active,
    renderScale, onMetaChange,
  });

  useImperativeHandle(ref, () => ({
    clear: () => renderer.action("terminal.clear"),
    restart: () => renderer.restart(),
    close: () => renderer.action("terminal.close"),
    resync: () => renderer.resync(),
    focus: () => renderer.focus(),
    sendKey: (key, modifiers = {}) => renderer.sendKey(key, modifiers),
    pasteFromClipboard: () => renderer.pasteFromClipboard(),
  }), [renderer]);

  const { error, restartBanner, lastCommand, terminalIsDead, pendingPaste, resolvePendingPaste } = renderer;

  return (
    <section className="terminal-session" onKeyDown={(event) => event.stopPropagation()}>
      {restartBanner ? <div className="terminal-restart-banner" role="status"><span>{restartBanner.message}</span><button type="button" onClick={() => renderer.setRestartBanner(null)} aria-label="Banner schliessen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
      {error && !terminalIsDead ? <div className="terminal-error" role="alert"><span>{error}</span><button type="button" onClick={() => renderer.setError(null)} aria-label="Fehlermeldung schließen" title="Schließen"><CloseIcon className="h-3.5 w-3.5" /></button></div> : null}
      {terminalIsDead ? (
        <div className="terminal-dead" role="alert">
          <div>
            <strong>Das Terminal läuft nicht.</strong>
            {error ? <span>{error}</span> : null}
            {lastCommand ? <span>Nach dem Neustart steht „{lastCommand}“ wieder in der Eingabe — Enter führt ihn aus.</span> : null}
          </div>
          <button type="button" onClick={renderer.restart} className="terminal-dead-restart">
            <RefreshIcon className="h-4 w-4" /> Neu starten
          </button>
        </div>
      ) : null}
      <div className="terminal-viewport" ref={renderer.mountRef} onClick={() => renderer.focus()} />
      <ConfirmDialog
        open={pendingPaste !== null}
        title="Großen Text einfügen?"
        description={`Der Inhalt umfasst ${pendingPaste?.length.toLocaleString("de-DE") ?? 0} Zeichen. Prüfe vorher, ob dadurch unbeabsichtigt Befehle ausgeführt werden könnten.`}
        confirmLabel="Trotzdem einfügen"
        onConfirm={() => resolvePendingPaste(true)}
        onClose={() => resolvePendingPaste(false)}
      />
    </section>
  );
});

// Re-Exporte halten die öffentliche API stabil: TerminalArea und Views
// importieren diese Typen weiterhin aus "./WebTerminal".
export type { TerminalStatus, WebTerminalHandle } from "./terminal-types";
