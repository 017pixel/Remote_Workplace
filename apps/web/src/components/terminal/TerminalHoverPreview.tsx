import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTerminalPreview } from "./useTerminalPreview";
import type { TerminalPreviewStatus } from "./useTerminalPreview";
import type { TerminalHoverPreviewState } from "./sidebar/useTerminalHoverPreview";

const PREVIEW_WIDTH = 360;
const PREVIEW_HEIGHT = 220;

function statusLabel(status: TerminalPreviewStatus): string {
  if (status === "loading") return "Lädt";
  if (status === "error") return "Nicht verfügbar";
  if (status === "exited") return "Beendet";
  return "Live";
}

export function TerminalHoverPreview({ preview, name, cwd, runtimeId, onClose }: {
  preview: TerminalHoverPreviewState;
  name: string;
  cwd: string | null;
  runtimeId: string;
  onClose(): void;
}) {
  const { lines, mountRef, status } = useTerminalPreview(runtimeId);
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = preview.anchor.getBoundingClientRect();
      const width = Math.min(PREVIEW_WIDTH, Math.max(220, window.innerWidth - 24));
      const left = rect.right + 12 + width <= window.innerWidth - 12
        ? rect.right + 12
        : Math.max(12, rect.left - width - 12);
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - PREVIEW_HEIGHT - 12));
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, preview.anchor]);

  return createPortal(
    <aside
      className="terminal-hover-preview"
      data-testid="terminal-hover-preview"
      aria-label={`Vorschau von ${name}`}
      style={{ left: position.left, top: position.top }}
    >
      <header className="terminal-hover-preview-header">
        <strong>{name}</strong>
        <span>{statusLabel(status)}</span>
      </header>
      {cwd ? <div className="terminal-hover-preview-cwd" title={cwd}>{cwd}</div> : null}
      <div className="terminal-hover-preview-screen">
        <pre>{lines.length > 0 ? lines.join("\n") : status === "loading" ? "Terminal wird geladen…" : "Keine Ausgabe"}</pre>
      </div>
      <div ref={mountRef} className="terminal-preview-parser" aria-hidden="true" />
    </aside>,
    document.body,
  );
}
