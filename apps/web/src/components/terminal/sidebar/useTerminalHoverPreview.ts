import { useCallback, useEffect, useRef, useState } from "react";

const TERMINAL_HOVER_PREVIEW_DELAY_MS = 1_000;

export interface TerminalHoverPreviewState {
  entryId: string;
  anchor: HTMLElement;
}

interface PendingPreview extends TerminalHoverPreviewState {
  timer: number;
}

export function useTerminalHoverPreview(enabled: boolean) {
  const [preview, setPreview] = useState<TerminalHoverPreviewState | null>(null);
  const pending = useRef<PendingPreview | null>(null);

  const clearPending = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  const start = useCallback((entryId: string, anchor: HTMLElement) => {
    const canHover = typeof window.matchMedia !== "function" || window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!enabled || !canHover) return;
    clearPending();
    setPreview(null);
    const timer = window.setTimeout(() => {
      if (pending.current?.entryId === entryId) setPreview({ entryId, anchor });
      pending.current = null;
    }, TERMINAL_HOVER_PREVIEW_DELAY_MS);
    pending.current = { entryId, anchor, timer };
  }, [clearPending, enabled]);

  const end = useCallback((entryId: string) => {
    if (pending.current?.entryId === entryId) clearPending();
    setPreview((current) => current?.entryId === entryId ? null : current);
  }, [clearPending]);

  useEffect(() => () => clearPending(), [clearPending]);

  return { preview, start, end };
}
