import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import type { TerminalKind } from "./protocol.js";

export interface SupervisedCommand {
  file: string;
  args: string[];
  environment: Record<string, string>;
}

export interface SupervisorSession {
  name: string;
  runtimeId: string | null;
  kind: TerminalKind;
  projectId: string | null;
  cwd: string;
  command: string;
  createdAt: number;
  managed: boolean;
}

function shellQuote(value: string) { return `'${value.replaceAll("'", `'\\''`)}'`; }

/** Standard-Socket unter $XDG_RUNTIME_DIR — bewusst nicht /tmp: Der Socket
 *  gehört dem Workbench-Benutzer und überlebt Backend-Neustarts, weil ihn die
 *  eigene Supervisor-Unit hält (siehe wrapt-terminal-supervisor.service). */
export function defaultTerminalSocketPath(): string {
  const runtime = process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? process.env.UID ?? "1000"}`;
  return `${runtime}/wrapt/tmux.sock`;
}

export const TERMINAL_SUPERVISOR_UNIT = "wrapt-terminal-supervisor.service";

export class TmuxSupervisor {
  readonly kind = "tmux" as const;

  constructor(readonly executable: string, readonly socketPath: string | null = null) {
    const result = spawnSync(executable, ["-V"], { encoding: "utf8", timeout: 3_000 });
    if (result.status !== 0) throw new Error("tmux ist nicht verfügbar.");
    if (socketPath) {
      try {
        const directory = socketPath.slice(0, socketPath.lastIndexOf("/"));
        mkdirSync(directory, { recursive: true, mode: 0o700 });
      } catch { /* Der Server versucht es später erneut. */ }
    }
  }

  /** Ergänzt den dedizierten Socket vor allen tmux-Argumenten. */
  private socketArgs(args: string[]): string[] {
    return this.socketPath ? ["-S", this.socketPath, ...args] : args;
  }

  /**
   * Stellt sicher, dass der tmux-Server durch die eigene systemd-Unit läuft —
   * so überlebt er Backend-Neustarts. Ist systemd nicht verfügbar (Entwicklung,
   * Container), startet tmux den Server beim ersten Aufruf selbst im aktuellen
   * Prozesskontext; das ist der dokumentierte Fallback.
   */
  ensureSupervisorUnit(): boolean {
    if (!this.socketPath) return false;
    if (this.isRunning()) return true;
    try {
      const start = spawnSync("systemctl", ["--user", "start", TERMINAL_SUPERVISOR_UNIT], { encoding: "utf8", timeout: 15_000 });
      if (start.status !== 0) return false;
    } catch { return false; }
    // Kurz warten, bis der Server den Socket annimmt.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (this.isRunning()) return true;
      spawnSync("sleep", ["0.25"], { stdio: "ignore" });
    }
    return this.isRunning();
  }

  /** Prüft, ob am Socket bereits ein tmux-Server antwortet. */
  isRunning(): boolean {
    return spawnSync(this.executable, this.socketArgs(["list-sessions"]), { stdio: "ignore", timeout: 3_000 }).status === 0;
  }

  sessionName(runtimeId: string) { return `wrapt-${runtimeId.replaceAll("-", "")}`; }

  has(name: string) {
    return spawnSync(this.executable, this.socketArgs(["has-session", "-t", name]), { stdio: "ignore", timeout: 3_000 }).status === 0;
  }

  ensure(input: { runtimeId: string; kind: TerminalKind; projectId: string | null; cwd: string; command: SupervisedCommand }) {
    const name = this.sessionName(input.runtimeId);
    if (!this.has(name)) {
      const environment = Object.entries(input.command.environment).map(([key, value]) => `${key}=${value}`);
      const command = ["/usr/bin/env", ...environment, input.command.file, ...input.command.args].map(shellQuote).join(" ");
      const created = spawnSync(this.executable, this.socketArgs(["new-session", "-d", "-s", name, "-c", input.cwd, command]), { encoding: "utf8", timeout: 5_000 });
      if (created.status !== 0) throw new Error(created.stderr.trim() || "tmux-Session konnte nicht gestartet werden.");
    }
    // Optionen gelten für neue und bestehende Sessions: So übernimmt eine
    // laufende Session nach einem Server-Neustart automatisch die aktuelle
    // Konfiguration (unsichtbare Statusleiste, normaler Puffer, Maus).
    this.applySessionOptions(name);
    this.run(["set-option", "-t", name, "@wrapt_runtime_id", input.runtimeId]);
    this.run(["set-option", "-t", name, "@wrapt_kind", input.kind]);
    this.run(["set-option", "-t", name, "@wrapt_project_id", input.projectId ?? ""]);
    return name;
  }

  private applySessionOptions(name: string) {
    this.run(["set-option", "-t", name, "history-limit", "100000"]);
    this.run(["set-option", "-t", name, "remain-on-exit", "on"]);
    // tmux bleibt im normalen Puffer statt in den Alternate Screen zu wechseln.
    // Sonst hätte xterm keinen Scrollback und das Mausrad würde zu Pfeiltasten
    // an die Shell — Scrollen wäre nur über tmux-Mausmodi möglich.
    this.run(["set-option", "-t", name, "alternate-screen", "off"]);
    // tmux bleibt als Supervisor aktiv, darf für den Nutzer aber unsichtbar
    // sein: keine Statusleiste und keine störenden Meldungsfarben.
    this.run(["set-option", "-t", name, "status", "off"]);
    this.run(["set-option", "-t", name, "message-style", "fg=default,bg=default"]);
    // Maus-Scrollen: Apps mit Maus-Reporting (z. B. OpenCode) bekommen Wheel-
    // Events nur mit aktivierter Maus durchgereicht. Ohne dieses Flag schluckt
    // tmux die SGR-Sequenzen und die App kann nicht per Mausrad scrollen.
    this.run(["set-option", "-t", name, "mouse", "on"]);
  }

  attachCommand(name: string) { return { file: this.executable, args: this.socketArgs(["attach-session", "-t", name]) }; }

  respawn(name: string, cwd: string, command: SupervisedCommand) {
    const environment = Object.entries(command.environment).map(([key, value]) => `${key}=${value}`);
    const cmd = ["/usr/bin/env", ...environment, command.file, ...command.args].map(shellQuote).join(" ");
    this.run(["respawn-pane", "-k", "-t", `${name}:0.0`, "-c", cwd, cmd]);
  }

  sendLastCommandHint(name: string) {
    this.run(["send-keys", "-t", `${name}:0.0`, "Up"]);
  }

  /** True, wenn die Pane gerade den Alternate Screen (Fullscreen-TUI) nutzt. */
  isAlternate(name: string): boolean {
    const result = spawnSync(this.executable, this.socketArgs(["display-message", "-p", "-t", `${name}:0.0`, "#{alternate_on}"]), { encoding: "utf8", timeout: 3_000 });
    return result.status === 0 && result.stdout.trim() === "1";
  }

  /**
   * Liefert den gerenderten Pane-Inhalt für Reconnect-Snapshots. Im Alternate
   * Screen (Fullscreen-TUI) wird nur die sichtbare Fläche ohne `-J` erfasst:
   * `-J` fügt umgebrochene Pane-Zeilen zusammen und zerstört damit Boxen,
   * Tabellen und Sidebars, sobald der Dump in xterm neu umbrochen wird. Der
   * normale Puffer behält `-J` und den Scrollback, damit lange Zeilen beim
   * Wiedergeben korrekt im aktuellen Raster umfließen.
   */
  capture(name: string) {
    const args = this.isAlternate(name)
      ? ["capture-pane", "-p", "-e", "-t", `${name}:0.0`]
      : ["capture-pane", "-p", "-e", "-J", "-S", "-10000", "-t", `${name}:0.0`];
    const result = spawnSync(this.executable, this.socketArgs(args), { encoding: "utf8", timeout: 4_000 });
    return result.status === 0 ? result.stdout : "";
  }

  currentPath(name: string) {
    const result = spawnSync(this.executable, this.socketArgs(["display-message", "-p", "-t", `${name}:0.0`, "#{pane_current_path}"]), { encoding: "utf8", timeout: 3_000 });
    return result.status === 0 ? result.stdout.trim() : null;
  }

  terminate(name: string) {
    if (this.has(name)) this.run(["kill-session", "-t", name]);
  }

  list(): SupervisorSession[] {
    // Neue Sessions verwenden den Wrapt-Namespace. Die beiden alten Metadaten
    // werden beim Einlesen bewusst noch akzeptiert, damit ein laufender
    // Legacy-tmux-Server beim Dienst-Cutover nicht seine Runtime-IDs verliert.
    const format = [
      "#{session_name}", "#{session_created}", "#{pane_current_path}", "#{pane_current_command}", "#{pane_start_command}",
      "#{@wrapt_runtime_id}", "#{@workbench_runtime_id}",
      "#{@wrapt_kind}", "#{@workbench_kind}",
      "#{@wrapt_project_id}", "#{@workbench_project_id}",
    ].join("\t");
    const result = spawnSync(this.executable, this.socketArgs(["list-panes", "-a", "-F", format]), { encoding: "utf8", timeout: 4_000 });
    if (result.status !== 0) return [];
    const seen = new Set<string>();
    return result.stdout.split("\n").flatMap((line) => {
      const [name, created, cwd, command, startCommand, runtimeId, legacyRuntimeId, rawKind, legacyKind, projectId, legacyProjectId] = line.split("\t");
      if (!name || seen.has(name)) return [];
      seen.add(name);
      const resolvedRuntimeId = runtimeId || legacyRuntimeId || null;
      const resolvedKind = rawKind || legacyKind;
      const commandLine = `${command ?? ""} ${startCommand ?? ""}`;
      const kind: TerminalKind = resolvedKind === "codex" || resolvedKind === "opencode" || resolvedKind === "claude" ? resolvedKind : commandLine.includes("opencode") ? "opencode" : commandLine.includes("codex") ? "codex" : commandLine.includes("claude") ? "claude" : "shell";
      const resolvedProjectId = projectId || legacyProjectId || null;
      return [{ name, runtimeId: resolvedRuntimeId, kind, projectId: resolvedProjectId, cwd: cwd || "/", command: startCommand || command || "shell", createdAt: Number(created || 0) * 1_000, managed: (name.startsWith("wrapt-") || name.startsWith("workbench-")) && Boolean(resolvedRuntimeId) }];
    });
  }

  private run(args: string[]) {
    const result = spawnSync(this.executable, this.socketArgs(args), { encoding: "utf8", timeout: 4_000 });
    if (result.status !== 0) throw new Error(result.stderr.trim() || `tmux ${args[0] ?? "command"} fehlgeschlagen.`);
  }
}
