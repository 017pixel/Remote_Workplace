import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Gemeinsame Fokus- und Inert-Logik für modale Flächen, auch wenn deren
 * visuelles Layout kein generischer ModalFrame ist.
 */
export function useModalFocus<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  open: boolean,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!open || !container) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inerted: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
    let current: HTMLElement = container;
    while (current.parentElement && current.parentElement !== document.documentElement) {
      for (const sibling of current.parentElement.children) {
        if (sibling === current || !(sibling instanceof HTMLElement)) continue;
        inerted.push({ element: sibling, inert: sibling.inert, ariaHidden: sibling.getAttribute("aria-hidden") });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
      current = current.parentElement;
    }
    const focusFirst = () => {
      const preferred = container.querySelector<HTMLElement>("[data-modal-autofocus], [autofocus]")
        ?? container.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? container).focus();
    };
    window.setTimeout(focusFirst, 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...container.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (!container.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusin);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusin);
      for (const { element, inert, ariaHidden } of inerted) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      window.setTimeout(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      }, 0);
    };
  }, [containerRef, open]);
}
