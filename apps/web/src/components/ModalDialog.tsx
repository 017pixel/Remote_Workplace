import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ModalFrameProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  className?: string | undefined;
  backdropClassName?: string | undefined;
  onClose: () => void;
  children: (requestClose: () => void) => ReactNode;
}

export function ModalFrame({ open, title, description, className, backdropClassName, onClose, children }: ModalFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const historyId = useRef(`modal-${Math.random().toString(36).slice(2)}`);
  closeRef.current = onClose;

  const requestClose = () => {
    const state = window.history.state as Record<string, unknown> | null;
    if (state?.workbenchModal === historyId.current) window.history.back();
    else closeRef.current();
  };

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    window.history.pushState({ ...(window.history.state ?? {}), workbenchModal: historyId.current }, "", window.location.href);
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = frameRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const handlePopState = () => closeRef.current();
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.setTimeout(() => previousFocus.current?.focus(), 0);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={`modal-backdrop ${backdropClassName ?? ""}`} role="presentation" onPointerDown={requestClose}>
      <div ref={frameRef} className={`modal-sheet ${className ?? ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby={description ? "modal-description" : undefined} onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><h2 id="modal-title">{title}</h2>{description ? <p id="modal-description">{description}</p> : null}</div>
          <button type="button" className="icon-button" onClick={requestClose} aria-label="Dialog schließen"><X className="h-5 w-5" /></button>
        </header>
        {children(requestClose)}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "Abbrechen", danger = false, onConfirm, onClose }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) window.setTimeout(() => cancelRef.current?.focus(), 0); }, [open]);
  return <ModalFrame open={open} title={title} description={description} onClose={onClose}>{(requestClose) =>
    <div className="modal-actions">
      <button ref={cancelRef} type="button" className="quiet-button" onClick={requestClose}>{cancelLabel}</button>
      <button type="button" className={danger ? "quiet-button modal-danger" : "quiet-button-primary"} onClick={() => { onConfirm(); requestClose(); }}>{confirmLabel}</button>
    </div>
  }</ModalFrame>;
}

export function ContentDialog({ open, title, description, onClose, children }: Omit<ModalFrameProps, "children"> & { children: ReactNode }) {
  return <ModalFrame open={open} title={title} description={description} onClose={onClose}>{(requestClose) => <>
    <div className="modal-content">{children}</div>
    <div className="modal-actions"><button type="button" className="quiet-button" onClick={requestClose} autoFocus>Schließen</button></div>
  </>}</ModalFrame>;
}

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  initialValue: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export function PromptDialog({ open, title, description, label, initialValue, confirmLabel = "Speichern", onConfirm, onClose }: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, [initialValue, open]);
  return <ModalFrame open={open} title={title} description={description} onClose={onClose}>{(requestClose) =>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); const next = value.trim(); if (!next) return; onConfirm(next); requestClose(); }}>
      <label>{label}<input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} maxLength={120} /></label>
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={requestClose}>Abbrechen</button><button type="submit" className="quiet-button-primary" disabled={!value.trim()}>{confirmLabel}</button></div>
    </form>
  }</ModalFrame>;
}
