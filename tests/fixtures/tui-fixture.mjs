#!/usr/bin/env node
// Deterministische TUI-Fixture für Terminal V2-Tests. Erzeugt reproduzierbare
// Terminalzustände (Alternate Screen, Box-Drawing, Cursor, Clear, Farben,
// Unicode, Maus-Reporting, Bracketed Paste, Progress-Animation, Resize-
// Reaktion, lange Ausgabe) — komplett offline, ohne externe KI-Dienste.
//
// Aufruf:
//   node tests/fixtures/tui-fixture.mjs --alternate
//   node tests/fixtures/tui-fixture.mjs --progress
//   node tests/fixtures/tui-fixture.mjs --colors
//   node tests/fixtures/tui-fixture.mjs --unicode
//   node tests/fixtures/tui-fixture.mjs --long
//   node tests/fixtures/tui-fixture.mjs --mouse
//   node tests/fixtures/tui-fixture.mjs --bracketed
//   node tests/fixtures/tui-fixture.mjs --resize
//   node tests/fixtures/tui-fixture.mjs --all

const mode = process.argv[2]?.replace(/^--/, "") ?? "all";
const ESC = "\x1b";
const CSI = `${ESC}[`;

function alt() { return `${CSI}?1049h`; }
function exitAlt() { return `${CSI}?1049l`; }
function hideCursor() { return `${CSI}?25l`; }
function showCursor() { return `${CSI}?25h`; }
function clear() { return `${CSI}2J${CSI}H`; }
function pos(row, col) { return `${CSI}${row};${col}H`; }
function color(fg, bg) { return `${CSI}${fg};${bg}m`; }
function reset() { return `${CSI}0m`; }
function box(width, height) {
  const lines = [];
  const top = `┌${"─".repeat(Math.max(0, width - 2))}┐`;
  const bottom = `└${"─".repeat(Math.max(0, width - 2))}┘`;
  lines.push(top);
  for (let row = 1; row < height - 1; row += 1) lines.push(`│${" ".repeat(Math.max(0, width - 2))}│`);
  lines.push(bottom);
  return lines;
}

function renderAlternate() {
  const { columns, rows } = process.stdout;
  const out = [alt(), hideCursor(), clear()];
  const w = Math.min(columns, 60);
  const h = Math.min(rows, 20);
  const frame = box(w, h);
  out.push(pos(1, 1), color(36, 40), frame.join("\r\n"), reset());
  const label = `TUI FIXTURE ${columns}x${rows}`;
  out.push(pos(3, 2), color(33, 40), label, reset());
  out.push(pos(5, 2), color(32, 40), "Zeile 1 beginnt Spalte 1", reset());
  out.push(pos(6, 2), color(32, 40), "Zeile 2 beginnt Spalte 1", reset());
  out.push(pos(7, 2), color(32, 40), "Zeile 3 beginnt Spalte 1", reset());
  out.push(pos(h - 1, 2), color(35, 40), "Drücke q zum Beenden", reset());
  out.push(pos(rows, 1), showCursor());
  return out.join("");
}

function renderProgress(frame, width) {
  const bar = Math.max(1, Math.min(width - 2, Math.round((frame % 40) / 40 * (width - 2))));
  return `${pos(1, 1)}${color(33, 40)}Build: [${"█".repeat(bar)}${" ".repeat(Math.max(0, width - 2 - bar))}] ${frame}%${reset()}`;
}

function runAlternate() {
  process.stdout.write(renderAlternate());
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    const text = chunk.toString();
    if (text.includes("q")) { process.stdout.write(`${exitAlt()}${clear()}${showCursor()}`); process.exit(0); }
  });
  process.stdout.on("resize", () => process.stdout.write(renderAlternate()));
}

function runProgress() {
  process.stdout.write(`${alt()}${hideCursor()}`);
  let frame = 0;
  const timer = setInterval(() => {
    process.stdout.write(renderProgress(frame, process.stdout.columns));
    frame += 1;
    if (frame > 120) { clearInterval(timer); process.stdout.write(`${exitAlt()}${showCursor()}`); process.exit(0); }
  }, 40);
  process.stdout.on("resize", () => process.stdout.write(renderProgress(frame, process.stdout.columns)));
}

function runColors() {
  const out = [clear()];
  for (let fg = 30; fg <= 37; fg += 1) out.push(`${color(fg, 40)}Farbtest ${fg}${reset()} `);
  out.push("\r\n");
  for (let bg = 40; bg <= 47; bg += 1) out.push(`${color(37, bg)}Hintergrund ${bg}${reset()} `);
  out.push("\r\n");
  out.push(`${color(31, 40)}Rot${reset()} ${color(32, 40)}Grün${reset()} ${color(33, 40)}Gelb${reset()} ${color(34, 40)}Blau${reset()} ${color(35, 40)}Magenta${reset()} ${color(36, 40)}Cyan${reset()}\r\n`);
  process.stdout.write(out.join(""));
  process.exit(0);
}

function runUnicode() {
  process.stdout.write(`${clear()}ASCII: abc XYZ 123\r\n`);
  process.stdout.write("Umlaute: ä ö ü ß Ä Ö Ü\r\n");
  process.stdout.write("CJK: 日本語テスト 中文测试\r\n");
  process.stdout.write("Box: ┌─┐│└┘├┤┬┴┼╔═╗║╚╝\r\n");
  process.stdout.write("Powerline: \uE0B0\uE0B1\uE0B2\r\n");
  process.stdout.write("Emoji: ✔ ✖ ⚠ ★\r\n");
  process.exit(0);
}

function runLong() {
  process.stdout.write(`${clear()}`);
  for (let index = 0; index < 5_000; index += 1) {
    process.stdout.write(`Zeile ${index}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. ${index % 7}\r\n`);
  }
  process.stdout.write("FERTIG\r\n");
  process.exit(0);
}

function runMouse() {
  process.stdout.write(`${alt()}${hideCursor()}${clear()}`);
  process.stdout.write(`${CSI}?1000h${CSI}?1006h`); // Button- + SGR-Mouse-Reporting
  process.stdout.write(`${pos(2, 2)}${color(36, 40)}Maus-Modus aktiv — klicke, dann q${reset()}`);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    const text = chunk.toString();
    if (text.includes("q")) {
      process.stdout.write(`${CSI}?1000l${CSI}?1006l${exitAlt()}${showCursor()}`);
      process.exit(0);
    }
    // SGR-Mouse-Sequenz bestätigen (sichtbare Reaktion im Terminal).
    if (text.includes("\x1b[<")) process.stdout.write(`${pos(4, 2)}${color(32, 40)}Maus-Klick erkannt${reset()}`);
  });
}

function runBracketed() {
  process.stdout.write(`${clear()}${CSI}?2004h`); // Bracketed Paste an
  process.stdout.write("Bracketed-Paste-Modus an. Füge Text ein, dann Enter.\r\n");
  const chunks = [];
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    chunks.push(chunk.toString());
    const joined = chunks.join("");
    if (joined.includes("\r") && !joined.includes("\x1b[200~")) {
      process.stdout.write(`${CSI}?2004l${clear()}Empfangen: ${JSON.stringify(joined)}\r\n`);
      process.exit(0);
    }
  });
}

function runResize() {
  process.stdout.write(`${alt()}${hideCursor()}`);
  const render = () => process.stdout.write(`${clear()}${pos(1, 1)}${color(36, 40)}Resize-Fixture ${process.stdout.columns}x${process.stdout.rows}${reset()}`);
  render();
  process.stdout.on("resize", render);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (chunk) => {
    if (chunk.toString().includes("q")) { process.stdout.write(`${exitAlt()}${showCursor()}`); process.exit(0); }
  });
}

const runners = {
  alternate: runAlternate,
  progress: runProgress,
  colors: runColors,
  unicode: runUnicode,
  long: runLong,
  mouse: runMouse,
  bracketed: runBracketed,
  resize: runResize,
};

if (mode === "all") {
  // Kurzer Durchlauf aller Zustände hintereinander (ohne Interaktion).
  process.stdout.write(`${clear()}`);
  runColors();
} else if (runners[mode]) {
  runners[mode]();
} else {
  process.stdout.write(`Unbekannter Modus: ${mode}\n`);
  process.exit(1);
}
