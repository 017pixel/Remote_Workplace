import { useEffect, useRef, useState } from "react";
import { SendIcon, CloseIcon } from "../icons";
import type { HermesSlashCommand } from "@workbench/contracts";
import { useHermesStore } from "../../stores/hermes";

export function HermesComposer({ instanceId, connected, running, commands, onSend, onCancel }: { instanceId: string; connected: boolean; running: boolean; commands: HermesSlashCommand[]; onSend: (content: string) => boolean; onCancel: () => boolean }) {
  const draft = useHermesStore((state) => state.drafts[instanceId] ?? "");
  const setDraft = useHermesStore((state) => state.setDraft);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    if (!draft.trim() || !connected || running) return;
    if (onSend(draft)) setDraft(instanceId, "");
  };
  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(180, Math.max(48, element.scrollHeight))}px`;
  }, [draft]);
  return (
    <div className="hermes-composer-wrap">
      {suggestionsOpen && commands.length > 0 ? <div className="hermes-command-suggestions" role="listbox">{commands.map((command) => <button key={command.name} type="button" onClick={() => { setDraft(instanceId, `${command.name} `); setSuggestionsOpen(false); textarea.current?.focus(); }}><code>{command.name}</code><span>{command.description}</span></button>)}</div> : null}
      <div className="hermes-composer">
        <textarea ref={textarea} value={draft} rows={1} disabled={!connected || running} placeholder={connected ? "Nachricht an Hermes…" : "Warte auf die Hermes-Verbindung…"} aria-label="Nachricht an Hermes" onChange={(event) => { setDraft(instanceId, event.target.value); setSuggestionsOpen(event.target.value.startsWith("/") && commands.length > 0); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} />
        {running ? <button type="button" className="hermes-stop-button" onClick={onCancel} aria-label="Hermes-Aufgabe stoppen" title="Aufgabe stoppen"><CloseIcon className="h-4 w-4" /></button> : <button type="button" className="hermes-send-button" onClick={send} disabled={!connected || !draft.trim()} aria-label="Nachricht senden" title="Nachricht senden"><SendIcon className="h-4 w-4" /></button>}
      </div>
      <div className="hermes-composer-hint">Enter senden · Shift+Enter Zeilenumbruch</div>
    </div>
  );
}
