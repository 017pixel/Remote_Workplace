import type { ReactNode } from "react";
import { ClipboardIcon, EraserIcon, MonitorOffIcon, PlusIcon, RetryIcon, SendIcon } from "../icons";
import { specialKeyRow } from "./terminal-labels";

interface TerminalKeybarProps {
  keyboardRow: "keys" | "actions";
  stickyCtrl: boolean;
  stickyAlt: boolean;
  hasActiveTab: boolean;
  tabsFull: boolean;
  sessionPicker: ReactNode;
  onSendKey(key: string): void;
  onPaste(): void;
  onFocus(): void;
  onCreate(): void;
  onRestart(): void;
  onClear(): void;
  onClose(): void;
  onToggleCtrl(): void;
  onToggleAlt(): void;
  onSetKeyboardRow(row: "keys" | "actions"): void;
}

/** Bedienleiste am unteren Rand auf Touch-Geräten: Sondertasten und Aktionen
 *  in einer umschaltbaren Leiste, immer über der Bildschirmtastatur. */
export function TerminalKeybar(props: TerminalKeybarProps) {
  const {
    keyboardRow, stickyCtrl, stickyAlt, hasActiveTab, tabsFull, sessionPicker,
    onSendKey, onPaste, onFocus, onCreate, onRestart, onClear, onClose,
    onToggleCtrl, onToggleAlt, onSetKeyboardRow,
  } = props;

  return (
    <div className="terminal-keybar" data-row={keyboardRow}>
      <div className="terminal-keybar-rows">
        {keyboardRow === "keys" ? (
          <div className="terminal-keybar-keys" aria-label="Terminal-Sondertasten">
            <button type="button" className={stickyCtrl ? "is-active" : ""} aria-pressed={stickyCtrl} onClick={onToggleCtrl}>ctrl</button>
            <button type="button" className={stickyAlt ? "is-active" : ""} aria-pressed={stickyAlt} onClick={onToggleAlt}>alt</button>
            {specialKeyRow.map((key) => (
              <button type="button" key={key} onClick={() => onSendKey(key)}>{key.toLowerCase()}</button>
            ))}
            <button type="button" onClick={() => onSendKey("c")} title="Strg-C senden">^c</button>
            <button type="button" onClick={onPaste} aria-label="Aus Zwischenablage einfügen"><ClipboardIcon className="h-4 w-4" /></button>
            <button type="button" onClick={onFocus} aria-label="Tastatur öffnen"><SendIcon className="h-4 w-4" /></button>
          </div>
        ) : (
          <div className="terminal-keybar-actions" aria-label="Terminalaktionen">
            <button type="button" onClick={onCreate} disabled={tabsFull}><PlusIcon className="h-4 w-4" /><span>Neu</span></button>
            <button type="button" onClick={onRestart} disabled={!hasActiveTab}><RetryIcon className="h-4 w-4" /><span>Neustart</span></button>
            <button type="button" onClick={onClear} disabled={!hasActiveTab}><EraserIcon className="h-4 w-4" /><span>Leeren</span></button>
            {sessionPicker}
            <button type="button" className="danger" onClick={onClose} disabled={!hasActiveTab}><MonitorOffIcon className="h-4 w-4" /><span>Schließen</span></button>
          </div>
        )}
      </div>
      <div className="terminal-keybar-switch" role="tablist" aria-label="Bedienleiste umschalten">
        <button type="button" role="tab" aria-selected={keyboardRow === "keys"} className={keyboardRow === "keys" ? "is-active" : ""} onClick={() => onSetKeyboardRow("keys")}>Tasten</button>
        <button type="button" role="tab" aria-selected={keyboardRow === "actions"} className={keyboardRow === "actions" ? "is-active" : ""} onClick={() => onSetKeyboardRow("actions")}>Aktionen</button>
      </div>
    </div>
  );
}
