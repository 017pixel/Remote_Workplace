import { useEffect, useRef, useState } from "react";
import { ExternalLinkIcon, FullscreenIcon, MoreIcon, RefreshIcon, RestoreIcon } from "./icons";

interface ToolActionMenuProps {
  externalHref: string;
  isFullscreen: boolean;
  onFullscreen: () => void | Promise<void>;
  onReload: () => void;
  className?: string;
}

export function ToolActionMenu({ externalHref, isFullscreen, onFullscreen, onReload, className = "" }: ToolActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnKeyDown);
    };
  }, [open]);

  const run = (action: () => void | Promise<void>) => {
    setOpen(false);
    void Promise.resolve(action()).catch(() => undefined);
  };

  return (
    <div ref={rootRef} className={`tool-actions-menu ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button tool-actions-trigger"
        aria-label="Werkzeugaktionen"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreIcon className="h-4 w-4" />
      </button>
      {open ? (
        <div className="tool-actions-popover" role="menu" aria-label="Werkzeugaktionen">
          <button type="button" role="menuitem" onClick={() => run(onReload)}>
            <RefreshIcon className="h-4 w-4" />
            Neu laden
          </button>
          <a href={externalHref} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setOpen(false)}>
            <ExternalLinkIcon className="h-4 w-4" />
            In neuem Tab öffnen
          </a>
          <button type="button" role="menuitem" onClick={() => run(onFullscreen)}>
            {isFullscreen ? <RestoreIcon className="h-4 w-4" /> : <FullscreenIcon className="h-4 w-4" />}
            {isFullscreen ? "Vollbild verlassen" : "Vollbild"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
