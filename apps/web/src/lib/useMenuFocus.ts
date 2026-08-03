import { useEffect, useRef, type RefObject } from "react";

export function useMenuFocus<T extends HTMLElement>(
  menuRef: RefObject<T | null>,
  open: boolean,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
    window.setTimeout(() => items()[0]?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      const available = items();
      const current = available.indexOf(document.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      if (event.key === "ArrowDown") next = available[(current + 1) % available.length];
      else if (event.key === "ArrowUp") next = available[(current - 1 + available.length) % available.length];
      else if (event.key === "Home") next = available[0];
      else if (event.key === "End") next = available.at(-1);
      else if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      } else return;
      if (!next) return;
      event.preventDefault();
      next.focus();
    };
    menu.addEventListener("keydown", keydown);
    return () => {
      menu.removeEventListener("keydown", keydown);
      window.setTimeout(() => {
        if (previous?.isConnected) previous.focus();
      }, 0);
    };
  }, [menuRef, open]);
}
