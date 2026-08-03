import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

interface AnchoredOverlayOptions {
  width: number;
  gap?: number;
  gutter?: number;
  stretchBelowBreakpoint?: number;
}

export function useAnchoredOverlay(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: AnchoredOverlayOptions,
) {
  const { width, gap = 8, gutter = 8, stretchBelowBreakpoint } = options;
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const stretched = stretchBelowBreakpoint !== undefined && viewportWidth <= stretchBelowBreakpoint;
    const overlayWidth = stretched ? Math.max(0, viewportWidth - gutter * 2) : Math.min(width, viewportWidth - gutter * 2);
    const left = stretched
      ? viewportLeft + gutter
      : Math.min(Math.max(viewportLeft + gutter, bounds.right - overlayWidth), viewportRight - overlayWidth - gutter);
    const roomBelow = viewportBottom - bounds.bottom - gap - gutter;
    const roomAbove = bounds.top - viewportTop - gap - gutter;
    const openAbove = roomBelow < 180 && roomAbove > roomBelow;

    setStyle({
      position: "fixed",
      left,
      right: "auto",
      width: overlayWidth,
      ...(openAbove
        ? { top: "auto", bottom: viewportBottom - bounds.top + gap, maxHeight: Math.max(120, roomAbove) }
        : { top: bounds.bottom + gap, bottom: "auto", maxHeight: Math.max(120, roomBelow) }),
    });
  }, [anchorRef, gap, gutter, stretchBelowBreakpoint, width]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    const viewport = window.visualViewport;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [open, update]);

  return style;
}
