/** Standard-Schriftgröße eines Desktop-Terminals. */
export const baseTerminalFontSize = 14;
// Auf Touch-Shells (Mobile und iPad) ist der Inhalt deutlich kleiner, damit
// TUIs wie OpenCode im schmalen Viewport vollständig sichtbar bleiben.
export const compactTerminalFontSize = 8;
export const minimumCompensatedRenderScale = 0.1;
export const maximumCompensatedRenderScale = 2.2;

// Bei versteckten Tabs und geparkten Flächen bleibt die Verbindung offen;
// der Puffer hält die Ausgabe für die Rückkehr (1 MB statt 256 KB).
export const maximumParkedOutputBytes = 1_000_000;

// Fehler, die ein automatisches Wiederverbinden behebt (z. B. Spawn-Race nach
// dem Aufwachen) statt die rote Box "Das Terminal läuft nicht" auszulösen.
export const recoverableTerminalErrorCodes = new Set([
  "PTY_SPAWN_FAILED",
  "PTY_WRITE_FAILED",
  "PTY_RESIZE_FAILED",
  "TERMINAL_NOT_RUNNING",
  "SESSION_INTERRUPTED",
  "INTERNAL_ERROR",
]);

export const mouseReportingModes = ["1000", "1002", "1003"];

/** Sondertasten der mobilen Bedienleiste und ihre Terminalsequenzen. */
export const terminalSpecialKeys: Record<string, string> = {
  Esc: "\x1b",
  Tab: "\t",
  "↑": "\x1b[A",
  "↓": "\x1b[B",
  "←": "\x1b[D",
  "→": "\x1b[C",
  Pos1: "\x1b[H",
  Ende: "\x1b[F",
};
