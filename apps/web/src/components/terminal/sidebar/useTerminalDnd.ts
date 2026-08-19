import { useCallback, useEffect, useRef, useState } from "react";

export type DndDragKind = "entry" | "folder";

export interface DndDropTarget {
  kind: "folder" | "entry" | "pins";
  id?: string;
  position?: "before" | "after" | "inside";
}

export interface DndDragState {
  kind: DndDragKind;
  id: string;
  label: string;
  x: number;
  y: number;
}

const MOVE_THRESHOLD_PX = 6;
const LONG_PRESS_MS = 380;

export interface RowHandlers {
  onPointerDown(event: React.PointerEvent): void;
}

/** Pointer-basiertes DnD: Desktop startet nach kleiner Bewegung, Touch nach
 *  Long-Press. Während des Ziehens werden Drop-Ziele über `data-dnd`-Attribute
 *  der Zeilen ermittelt (nur HTML5-Drag-Events — die auf Touch nicht
 *  zuverlässig funktionieren — werden nicht verwendet). */
export function useTerminalDnd(onDrop: (drag: { kind: DndDragKind; id: string }, target: DndDropTarget | null) => void) {
  const [drag, setDrag] = useState<DndDragState | null>(null);
  const [target, setTarget] = useState<DndDropTarget | null>(null);
  const pendingRef = useRef<{ kind: DndDragKind; id: string; label: string; pointerId: number; startX: number; startY: number; longPress: number | null } | null>(null);
  const dragRef = useRef<DndDragState | null>(null);
  dragRef.current = drag;

  const finish = useCallback(() => {
    const pending = pendingRef.current;
    if (pending && pending.longPress !== null) window.clearTimeout(pending.longPress);
    pendingRef.current = null;
    setDrag(null);
    setTarget(null);
  }, []);

  const computeTarget = useCallback((clientX: number, clientY: number): DndDropTarget | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const row = element?.closest<HTMLElement>("[data-dnd]");
    if (!row) return null;
    const value = row.dataset.dnd ?? "";
    if (value === "pins") return { kind: "pins" };
    const [kind, id] = value.split(":");
    if (!kind || !id) return null;
    const rect = row.getBoundingClientRect();
    const ratio = (clientY - rect.top) / Math.max(1, rect.height);
    if (kind === "folder" && ratio > 0.3 && ratio < 0.7) return { kind: "folder", id, position: "inside" };
    return { kind: kind as "entry" | "folder", id, position: ratio <= 0.5 ? "before" : "after" };
  }, []);

  const createRowHandlers = useCallback((info: { kind: DndDragKind; id: string; label: string }): RowHandlers => ({
    onPointerDown(event: React.PointerEvent) {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if (event.isPrimary === false) return;
      const isTouch = event.pointerType === "touch";
      const longPress = isTouch ? window.setTimeout(() => {
        if (pendingRef.current && pendingRef.current.pointerId === event.pointerId) {
          pendingRef.current.longPress = null;
          setDrag({ kind: info.kind, id: info.id, label: info.label, x: event.clientX, y: event.clientY });
        }
      }, LONG_PRESS_MS) : null;
      pendingRef.current = { kind: info.kind, id: info.id, label: info.label, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, longPress };
    },
  }), []);

  const containerHandlers = {
    onPointerMove(event: React.PointerEvent) {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
      if (!dragRef.current && (pending.longPress === null || moved > MOVE_THRESHOLD_PX)) {
        if (pending.longPress === null && moved < MOVE_THRESHOLD_PX) return;
        if (pending.longPress !== null) { window.clearTimeout(pending.longPress); pending.longPress = null; }
        setDrag({ kind: pending.kind, id: pending.id, label: pending.label, x: event.clientX, y: event.clientY });
      }
      if (dragRef.current) {
        setDrag((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
        setTarget(computeTarget(event.clientX, event.clientY));
      }
    },
    onPointerUp(event: React.PointerEvent) {
      const pending = pendingRef.current;
      if (!pending || pending.pointerId !== event.pointerId) return;
      if (dragRef.current) onDrop({ kind: dragRef.current.kind, id: dragRef.current.id }, computeTarget(event.clientX, event.clientY));
      finish();
    },
    onPointerCancel(event: React.PointerEvent) {
      if (pendingRef.current?.pointerId === event.pointerId) finish();
    },
  };

  useEffect(() => () => {
    const pending = pendingRef.current;
    if (pending && pending.longPress !== null) window.clearTimeout(pending.longPress);
  }, []);

  return { drag, target, createRowHandlers, containerHandlers, finish };
}
