import type { ITheme } from "@xterm/xterm";
import {
  baseTerminalFontSize,
  compactTerminalFontSize,
  maximumCompensatedRenderScale,
  minimumCompensatedRenderScale,
  mouseReportingModes,
  terminalSpecialKeys,
} from "./terminal-constants";

/**
 * xterm rendert Zeichen in einen Canvas. In einem gezoomten Orbit-Knoten wird
 * dieser Canvas anschließend erneut skaliert. Eine umgekehrt skalierte
 * Schriftgröße hält die sichtbare Zellgröße konstant und liefert dem Browser
 * mehr Rasterauflösung, bevor der Knoten verkleinert wird.
 */
export function terminalFontSizeForRenderScale(renderScale = 1, compact = false): number {
  const scale = Number.isFinite(renderScale)
    ? Math.min(maximumCompensatedRenderScale, Math.max(minimumCompensatedRenderScale, renderScale))
    : 1;
  const base = compact ? compactTerminalFontSize : baseTerminalFontSize;
  return Number((base / scale).toFixed(2));
}

/** Erkennt die kompakte Terminal-Schrift an der umgebenden Shell: schmale
 *  Fenster (`compact`) und Touch-Geräte bekommen die kleine Schrift. */
export function isCompactTerminal(mount: HTMLElement | null): boolean {
  const shell = mount?.closest(".app-shell");
  const mode = shell?.getAttribute("data-shell-mode");
  const inputMode = shell?.getAttribute("data-input-mode");
  return mode === "compact" || inputMode === "touch";
}

export function shouldForwardTerminalData(replayingSnapshot: boolean, sessionId: string | null): sessionId is string {
  return !replayingSnapshot && sessionId !== null;
}

// eslint-disable-next-line no-control-regex -- Terminal-Sequenzen (DECSET/DECRST) müssen erkannt werden.
const modeSettingsPattern = /\x1b\[\?([0-9;]*)([hl])/g;

/**
 * Verfolgt, ob die laufende Anwendung Maus-Reporting aktiviert hat (DECSET
 * 1000/1002/1003 für Wheel-Scrollen, optional mit SGR-Encoding 1006). tmux
 * reicht die Modes der App an den Client weiter — die zuletzt gesehene
 * Sequenz entscheidet.
 */
export function updateMouseReporting(active: boolean, data: string): boolean {
  let next = active;
  const pattern = new RegExp(modeSettingsPattern.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(data))) {
    const modes = match[1] ? match[1].split(";") : [];
    if (modes.some((mode) => mouseReportingModes.includes(mode))) {
      next = match[2] === "h";
    }
  }
  return next;
}

/**
 * Verfolgt zusätzlich das SGR-Encoding (DECSET 1006). Nur damit dürfen
 * Mausereignisse im erweiterten Format gemeldet werden; ohne 1006 gilt das
 * alte Format mit auf 223 begrenzten Koordinaten.
 */
export function updateMouseEncoding(sgr: boolean, data: string): boolean {
  let next = sgr;
  const pattern = new RegExp(modeSettingsPattern.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(data))) {
    const modes = match[1] ? match[1].split(";") : [];
    if (modes.includes("1006")) next = match[2] === "h";
  }
  return next;
}

/**
 * Erkennt Antworten, die xterm selbst auf Geräteabfragen der Anwendung
 * erzeugt (DA1/DA2, Device Status, Cursor-Position-Report, XTVERSION). Solche
 * Antworten sind keine Nutzereingabe und dürfen nie an die PTY zurückgehen —
 * sonst erscheint ihr Inhalt (z. B. „1;1R") als Fremdtext im Terminal.
 */
// eslint-disable-next-line no-control-regex -- ESC (0x1b) ist beabsichtigt: erkennt xterm-Antworten auf Geräteabfragen (DA1/DA2, DSR, XTVERSION).
const deviceAnswerPattern = /^\x1b\[[>?]?[\d;]*[cRn]$|^\x1b\[>\d+(?:;[\d.]+)*\|/;
export function isDeviceAnswer(data: string): boolean {
  return deviceAnswerPattern.test(data);
}

/**
 * Rechnet eine Wischbewegung in ganze Terminalzeilen um. Der Rest unter einer
 * Zeile bleibt erhalten, sonst würde langsames Wischen nie etwas bewegen,
 * weil jeder einzelne Schritt abgeschnitten würde.
 */
export function touchScrollLines(movedPixels: number, lineHeight: number, carry = 0): { lines: number; carry: number } {
  const height = lineHeight > 0 ? lineHeight : 18;
  const raw = movedPixels / height + carry;
  const lines = Math.trunc(raw);
  return { lines, carry: raw - lines };
}

/** Vereinheitlicht Maus-, Touchpad- und Seitenrad-Einheiten vor dem Scrollen. */
export function wheelScrollLines(
  deltaY: number,
  deltaMode: number,
  lineHeight: number,
  viewportHeight: number,
  carry = 0,
): { lines: number; carry: number } {
  const height = lineHeight > 0 ? lineHeight : 18;
  const delta = deltaMode === 1
    ? deltaY * height
    : deltaMode === 2
      ? deltaY * Math.max(0, viewportHeight)
      : deltaY;
  return touchScrollLines(delta, height, carry);
}

export function mouseWheelSequence(direction: "up" | "down", sgr: boolean, column = 1, row = 1): string {
  const button = direction === "up" ? 64 : 65;
  if (sgr) return `\x1b[<${button};${column};${row}M`;
  // Das alte Format kodiert Knopf und Koordinaten als Zeichen ab Wert 32.
  const clamp = (value: number) => Math.min(223, Math.max(1, Math.round(value)));
  return `\x1b[M${String.fromCharCode(button + 32, clamp(column) + 32, clamp(row) + 32)}`;
}

/**
 * Übersetzt eine Taste der Bedienleiste in die Bytes, die an die Sitzung gehen.
 * Strg wirkt nur auf Buchstaben (Strg-C = 0x03), Alt stellt ein ESC voran.
 */
export function terminalKeySequence(key: string, modifiers: { ctrl?: boolean; alt?: boolean } = {}): string {
  let data = terminalSpecialKeys[key] ?? key;
  if (modifiers.ctrl && /^[a-zA-Z]$/.test(data)) {
    data = String.fromCharCode(data.toUpperCase().charCodeAt(0) - 64);
  }
  if (modifiers.alt) data = `\x1b${data}`;
  return data;
}

export function themeFromDashboard(mount: HTMLElement | null): ITheme {
  const styles = getComputedStyle(mount ?? document.documentElement);
  // Alle Farben kommen ausschließlich aus dem @theme-Block (F01-13). Leere
  // Werte können nur bei einem defekten Theme auftreten; dann greift xterm
  // auf seine Standardpalette zurück.
  const value = (name: string) => styles.getPropertyValue(name).trim();
  return {
    background: value("--color-ink-950"),
    foreground: value("--color-text"),
    cursor: value("--ansi-green"),
    selectionBackground: value("--ansi-selection"),
    black: value("--ansi-black"), red: value("--ansi-red"), green: value("--ansi-green"), yellow: value("--ansi-yellow"),
    blue: value("--ansi-blue"), magenta: value("--ansi-magenta"), cyan: value("--ansi-cyan"), white: value("--ansi-white"),
    brightBlack: value("--ansi-bright-black"), brightRed: value("--ansi-bright-red"), brightGreen: value("--ansi-bright-green"),
    brightYellow: value("--ansi-bright-yellow"), brightBlue: value("--ansi-bright-blue"), brightMagenta: value("--ansi-bright-magenta"),
    brightCyan: value("--ansi-bright-cyan"), brightWhite: value("--ansi-bright-white"),
  };
}

export function websocketUrl(): string {
  const url = new URL("/api/v1/terminal", window.location.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function createUuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

