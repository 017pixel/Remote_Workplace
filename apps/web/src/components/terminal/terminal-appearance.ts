import type { MutableRefObject } from "react";
import type { Terminal } from "@xterm/xterm";
import { isCompactTerminal, terminalFontSizeForRenderScale, themeFromDashboard } from "./terminal-utils";

/** Gemeinsame Zustände für die Anpassung von Schrift, Theme und Raster. */
export interface TerminalAppearanceContext {
  disposedRef: MutableRefObject<boolean>;
  terminalRef: MutableRefObject<Terminal | null>;
  compactRef: MutableRefObject<boolean>;
  renderScaleRef: MutableRefObject<number>;
  resizeRef: MutableRefObject<number | null>;
  themeRefreshRef: MutableRefObject<number | null>;
  resize(): void;
}

/**
 * Hängt die Anpassungs-Observer (Schriftladen, Shell-Kompaktheit, Theme,
 * Rastergröße, visueller Viewport) an eine xterm-Instanz. Gibt die
 * Aufräumfunktion zurück, die Observer trennt und offene Timer beendet.
 */
export function attachTerminalAppearance(terminal: Terminal, mount: HTMLElement, context: TerminalAppearanceContext): () => void {
  const { disposedRef, terminalRef, compactRef, renderScaleRef, resizeRef, themeRefreshRef, resize } = context;

  // Nach dem asynchronen Laden der Schriften (Fallback → JetBrains Mono)
  // stimmen die Zellmetriken wieder; ein Refresh verhindert den Versatz um
  // eine halbe Zeile.
  if (typeof document.fonts?.ready?.then === "function") {
    void document.fonts.ready.then(() => {
      if (disposedRef.current || terminalRef.current !== terminal) return;
      terminal.refresh(0, terminal.rows - 1);
      resize();
    });
  }

  // Wechsel der Shell-Kompaktheit (Desktop ↔ Mobile) passt die Schriftgröße
  // an, damit TUIs im schmalen Viewport kompakt bleiben.
  const shellRoot = mount.closest(".app-shell");
  const shellObserver = new MutationObserver(() => {
    const compact = isCompactTerminal(mount);
    if (compact === compactRef.current) return;
    compactRef.current = compact;
    terminal.options.fontSize = terminalFontSizeForRenderScale(renderScaleRef.current, compact);
    terminal.refresh(0, terminal.rows - 1);
    resize();
  });
  if (shellRoot) shellObserver.observe(shellRoot, { attributes: true, attributeFilter: ["data-shell-mode", "data-input-mode", "data-orientation"] });

  const observer = new ResizeObserver(() => {
    if (resizeRef.current) window.clearTimeout(resizeRef.current);
    resizeRef.current = window.setTimeout(resize, 75);
  });
  observer.observe(mount);

  const viewport = window.visualViewport;
  const onViewportChange = () => {
    if (resizeRef.current) window.clearTimeout(resizeRef.current);
    resizeRef.current = window.setTimeout(resize, 50);
  };
  viewport?.addEventListener("resize", onViewportChange);
  viewport?.addEventListener("scroll", onViewportChange);

  const themes = new MutationObserver(() => {
    if (themeRefreshRef.current !== null) return;
    themeRefreshRef.current = window.setTimeout(() => {
      themeRefreshRef.current = null;
      terminal.options.theme = themeFromDashboard(mount);
      terminal.refresh(0, terminal.rows - 1);
    }, 16);
  });
  themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

  return () => {
    observer.disconnect();
    viewport?.removeEventListener("resize", onViewportChange);
    viewport?.removeEventListener("scroll", onViewportChange);
    themes.disconnect();
    shellObserver.disconnect();
    if (resizeRef.current) window.clearTimeout(resizeRef.current);
    if (themeRefreshRef.current) window.clearTimeout(themeRefreshRef.current);
    themeRefreshRef.current = null;
  };
}
