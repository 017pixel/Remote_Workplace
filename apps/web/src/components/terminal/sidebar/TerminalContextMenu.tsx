import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  label?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Zeigt ein positioniertes Kontextmenü an. Das Menü passt sich an den
 *  Viewport an (kantennah wird es gespiegelt) und schließt bei Außenklick,
 *  Escape und Scroll. Für Touch-Geräte sind die Ziele groß genug. */
export function TerminalContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: menu.x, y: menu.y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 8;
    const x = Math.min(menu.x, window.innerWidth - rect.width - margin);
    const y = Math.min(menu.y, window.innerHeight - rect.height - margin);
    setPosition({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [menu]);

  useEffect(() => {
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnScroll = () => onClose();
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [onClose]);

  const run = useCallback((item: ContextMenuItem) => {
    onClose();
    item.onSelect?.();
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="terminal-context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.items.map((item, index) => item.separator ? (
        <div key={`sep-${index}`} className="terminal-context-separator" role="separator" />
      ) : (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`terminal-context-item ${item.danger ? "is-danger" : ""}`}
          disabled={item.disabled}
          onClick={() => run(item)}
        >
          {item.icon ? <span className="terminal-context-icon">{item.icon}</span> : null}
          <span className="terminal-context-label">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Öffnet ein Kontextmenü an der Zeigerposition (Maus oder Touch). */
export function openContextMenuAt(event: { clientX: number; clientY: number }, items: ContextMenuItem[]): ContextMenuState {
  return { x: event.clientX, y: event.clientY, items };
}
