import { useState } from "react";
import { ChevronDownIcon, CopyIcon } from "../icons";
import type { HermesToolCall } from "@workbench/contracts";

function copy(value: string) { void navigator.clipboard?.writeText(value); }

export function HermesToolCallCard({ tool }: { tool: HermesToolCall }) {
  const [open, setOpen] = useState(false);
  const status = tool.status === "completed" ? "Abgeschlossen" : tool.status === "failed" ? "Fehlgeschlagen" : tool.status === "pending" ? "Wartet" : "Läuft";
  return (
    <details className="hermes-tool-card" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span className={`hermes-tool-state is-${tool.status}`} aria-hidden />
        <span className="hermes-tool-name">{tool.title || tool.name}</span>
        <span className="hermes-tool-status">{status}</span>
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </summary>
      {open ? <div className="hermes-tool-body">
        {tool.command ? <div className="hermes-tool-line"><span>Befehl</span><code>{tool.command}</code><button type="button" className="hermes-icon-button" onClick={() => copy(tool.command!)} aria-label="Befehl kopieren" title="Befehl kopieren"><CopyIcon className="h-3.5 w-3.5" /></button></div> : null}
        {tool.cwd ? <div className="hermes-tool-line"><span>Arbeitsverzeichnis</span><code>{tool.cwd}</code></div> : null}
        {tool.exitCode !== null ? <div className="hermes-tool-line"><span>Exit-Code</span><code>{tool.exitCode}</code></div> : null}
        {tool.arguments ? <pre className="hermes-code-block">{JSON.stringify(tool.arguments, null, 2)}</pre> : null}
        {tool.result ? <pre className="hermes-code-block">{tool.result}{tool.truncated ? "\n\nAusgabe gekürzt. Die vollständige Ausgabe bleibt in Hermes verfügbar." : ""}</pre> : null}
      </div> : null}
    </details>
  );
}
