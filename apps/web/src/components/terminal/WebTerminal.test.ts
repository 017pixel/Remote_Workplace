import { describe, expect, it } from "vitest";
import {
  isDeviceAnswer,
  mouseWheelSequence,
  shouldForwardTerminalData,
  terminalFontSizeForRenderScale,
  terminalKeySequence,
  touchScrollLines,
  updateMouseEncoding,
  updateMouseReporting,
} from "./terminal-utils";

describe("Terminal-Snapshot", () => {
  it("sendet automatische xterm-Antworten während der Wiedergabe nicht an die PTY", () => {
    expect(shouldForwardTerminalData(true, "session-1")).toBe(false);
  });

  it("sendet echte Eingaben nur mit verbundener Sitzung", () => {
    expect(shouldForwardTerminalData(false, "session-1")).toBe(true);
    expect(shouldForwardTerminalData(false, null)).toBe(false);
  });
});

describe("Terminal-Raster bei Orbit-Zoom", () => {
  it("verwendet ohne äußeren Zoom die Basisschriftgröße", () => {
    expect(terminalFontSizeForRenderScale()).toBe(14);
    expect(terminalFontSizeForRenderScale(1)).toBe(14);
  });

  it("zeichnet bei verkleinertem Orbit-Knoten mit Gegenfaktor", () => {
    expect(terminalFontSizeForRenderScale(0.8)).toBe(17.5);
  });

  it("hält die sichtbare Schrift im gesamten Orbit-Zoombereich konstant", () => {
    expect(terminalFontSizeForRenderScale(0.1) * 0.1).toBeCloseTo(14);
    expect(terminalFontSizeForRenderScale(2.2) * 2.2).toBeCloseTo(14, 1);
    expect(terminalFontSizeForRenderScale(2)).toBe(7);
  });

  it("begrenzt Werte außerhalb des Orbit-Zoombereichs und behandelt ungültige Werte sicher", () => {
    expect(terminalFontSizeForRenderScale(0.01)).toBe(140);
    expect(terminalFontSizeForRenderScale(3)).toBeCloseTo(6.36);
    expect(terminalFontSizeForRenderScale(Number.NaN)).toBe(14);
  });

  it("nutzt auf Touch-Shells die kompakte Schriftgröße", () => {
    expect(terminalFontSizeForRenderScale(1, true)).toBe(8);
    expect(terminalFontSizeForRenderScale(0.5, true)).toBe(16);
  });

});

describe("Antworten auf Geräteabfragen", () => {
  it("erkennt automatische xterm-Antworten (DA1, DA2, DSR, CPR, XTVERSION)", () => {
    expect(isDeviceAnswer("\x1b[?1;2c")).toBe(true);
    expect(isDeviceAnswer("\x1b[>0;95;0c")).toBe(true);
    expect(isDeviceAnswer("\x1b[0n")).toBe(true);
    expect(isDeviceAnswer("\x1b[1;1R")).toBe(true);
    expect(isDeviceAnswer("\x1b[>0|opencode|1.0")).toBe(true);
  });

  it("verwirft gewöhnliche Nutzereingaben nicht", () => {
    expect(isDeviceAnswer("ls")).toBe(false);
    expect(isDeviceAnswer("\x1b[A")).toBe(false);
    expect(isDeviceAnswer("\r")).toBe(false);
  });
});

describe("Maus-Reporting-Verfolgung", () => {
  it("aktiviert das Reporting, wenn die App DECSET 1000/1002/1003 sendet", () => {
    expect(updateMouseReporting(false, "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h")).toBe(true);
    expect(updateMouseReporting(false, "\x1b[?1006h\x1b[?1002h")).toBe(true);
  });

  it("deaktiviert das Reporting bei den entsprechenden DECRST-Sequenzen", () => {
    expect(updateMouseReporting(true, "\x1b[?1002l\x1b[?1006l")).toBe(false);
  });

  it("lässt unabhängige Sequenzen (Alt-Screen, Bracketed Paste) unverändert", () => {
    expect(updateMouseReporting(false, "\x1b[?1049h\x1b[?2004h")).toBe(false);
    expect(updateMouseReporting(true, "\x1b[?1049h")).toBe(true);
  });

  it("wertet auch kombinierte Modi in einer Sequenz aus", () => {
    expect(updateMouseReporting(false, "\x1b[?1002;1006h")).toBe(true);
  });
});

describe("Erweitertes Maus-Encoding", () => {
  it("erkennt das Ein- und Ausschalten von SGR (1006)", () => {
    expect(updateMouseEncoding(false, "\x1b[?1002;1006h")).toBe(true);
    expect(updateMouseEncoding(true, "\x1b[?1006l")).toBe(false);
  });

  it("lässt den Zustand ohne 1006 unverändert", () => {
    expect(updateMouseEncoding(false, "\x1b[?1002h\x1b[?1049h")).toBe(false);
    expect(updateMouseEncoding(true, "\x1b[?1002l")).toBe(true);
  });
});

describe("Mausrad an die laufende Anwendung", () => {
  it("meldet im SGR-Format nach oben und unten", () => {
    expect(mouseWheelSequence("up", true, 3, 7)).toBe("\x1b[<64;3;7M");
    expect(mouseWheelSequence("down", true, 3, 7)).toBe("\x1b[<65;3;7M");
  });

  it("nutzt ohne SGR das alte Format mit Zeichen ab Wert 32", () => {
    expect(mouseWheelSequence("up", false, 1, 1)).toBe(`\x1b[M${String.fromCharCode(96, 33, 33)}`);
    expect(mouseWheelSequence("down", false, 1, 1)).toBe(`\x1b[M${String.fromCharCode(97, 33, 33)}`);
  });

  it("begrenzt die Koordinaten des alten Formats auf den darstellbaren Bereich", () => {
    expect(mouseWheelSequence("up", false, 500, 900)).toBe(`\x1b[M${String.fromCharCode(96, 255, 255)}`);
  });
});

describe("Scrollen per Wischgeste", () => {
  it("wandelt eine Bewegung in ganze Zeilen um", () => {
    expect(touchScrollLines(54, 18)).toEqual({ lines: 3, carry: 0 });
    expect(touchScrollLines(-36, 18)).toEqual({ lines: -2, carry: 0 });
  });

  it("hebt den Rest unter einer Zeile für die nächste Bewegung auf", () => {
    const first = touchScrollLines(10, 18);
    expect(first.lines).toBe(0);
    const second = touchScrollLines(10, 18, first.carry);
    expect(second.lines).toBe(1);
  });

  it("fängt eine unbekannte Zeilenhöhe mit einem Standardwert ab", () => {
    expect(touchScrollLines(36, 0).lines).toBe(2);
  });
});

describe("Sondertasten der Bedienleiste", () => {
  it("übersetzt Sondertasten in ihre Terminalsequenz", () => {
    expect(terminalKeySequence("Esc")).toBe("\x1b");
    expect(terminalKeySequence("Tab")).toBe("\t");
    expect(terminalKeySequence("↑")).toBe("\x1b[A");
    expect(terminalKeySequence("Ende")).toBe("\x1b[F");
  });

  it("bildet Strg-Kombinationen auf Steuerzeichen ab", () => {
    expect(terminalKeySequence("c", { ctrl: true })).toBe("\x03");
    expect(terminalKeySequence("d", { ctrl: true })).toBe("\x04");
    expect(terminalKeySequence("L", { ctrl: true })).toBe("\x0c");
  });

  it("stellt bei Alt ein ESC voran und lässt Strg auf Sondertasten wirkungslos", () => {
    expect(terminalKeySequence("b", { alt: true })).toBe("\x1bb");
    expect(terminalKeySequence("Esc", { ctrl: true })).toBe("\x1b");
    expect(terminalKeySequence("c", { ctrl: true, alt: true })).toBe("\x1b\x03");
  });

  it("gibt gewöhnliche Zeichen unverändert weiter", () => {
    expect(terminalKeySequence("x")).toBe("x");
  });
});
