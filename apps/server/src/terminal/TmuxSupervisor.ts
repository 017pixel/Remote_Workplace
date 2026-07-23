import { spawnSync } from "node:child_process";
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

export class TmuxSupervisor {
  readonly kind = "tmux" as const;

  constructor(readonly executable: string) {
    const result = spawnSync(executable, ["-V"], { encoding: "utf8", timeout: 3_000 });
    if (result.status !== 0) throw new Error("tmux ist nicht verfügbar.");
  }

  sessionName(runtimeId: string) { return `workbench-${runtimeId.replaceAll("-", "")}`; }

  has(name: string) {
    return spawnSync(this.executable, ["has-session", "-t", name], { stdio: "ignore", timeout: 3_000 }).status === 0;
  }

  ensure(input: { runtimeId: string; kind: TerminalKind; projectId: string | null; cwd: string; command: SupervisedCommand }) {
    const name = this.sessionName(input.runtimeId);
    if (this.has(name)) return name;
    const environment = Object.entries(input.command.environment).map(([key, value]) => `${key}=${value}`);
    const command = ["/usr/bin/env", ...environment, input.command.file, ...input.command.args].map(shellQuote).join(" ");
    const created = spawnSync(this.executable, ["new-session", "-d", "-s", name, "-c", input.cwd, command], { encoding: "utf8", timeout: 5_000 });
    if (created.status !== 0) throw new Error(created.stderr.trim() || "tmux-Session konnte nicht gestartet werden.");
    this.run(["set-option", "-t", name, "history-limit", "100000"]);
    this.run(["set-option", "-t", name, "@workbench_runtime_id", input.runtimeId]);
    this.run(["set-option", "-t", name, "@workbench_kind", input.kind]);
    this.run(["set-option", "-t", name, "@workbench_project_id", input.projectId ?? ""]);
    return name;
  }

  attachCommand(name: string) { return { file: this.executable, args: ["attach-session", "-t", name] }; }

  capture(name: string) {
    const result = spawnSync(this.executable, ["capture-pane", "-p", "-e", "-J", "-S", "-10000", "-t", `${name}:0.0`], { encoding: "utf8", timeout: 4_000 });
    return result.status === 0 ? result.stdout : "";
  }

  terminate(name: string) {
    if (this.has(name)) this.run(["kill-session", "-t", name]);
  }

  list(): SupervisorSession[] {
    const format = ["#{session_name}", "#{session_created}", "#{pane_current_path}", "#{pane_current_command}", "#{pane_start_command}", "#{@workbench_runtime_id}", "#{@workbench_kind}", "#{@workbench_project_id}"].join("\t");
    const result = spawnSync(this.executable, ["list-panes", "-a", "-F", format], { encoding: "utf8", timeout: 4_000 });
    if (result.status !== 0) return [];
    const seen = new Set<string>();
    return result.stdout.split("\n").flatMap((line) => {
      const [name, created, cwd, command, startCommand, runtimeId, rawKind, projectId] = line.split("\t");
      if (!name || seen.has(name)) return [];
      seen.add(name);
      const commandLine = `${command ?? ""} ${startCommand ?? ""}`;
      const kind: TerminalKind = rawKind === "codex" || rawKind === "opencode" || rawKind === "claude" ? rawKind : commandLine.includes("opencode") ? "opencode" : commandLine.includes("codex") ? "codex" : commandLine.includes("claude") ? "claude" : "shell";
      return [{ name, runtimeId: runtimeId || null, kind, projectId: projectId || null, cwd: cwd || "/", command: startCommand || command || "shell", createdAt: Number(created || 0) * 1_000, managed: name.startsWith("workbench-") && Boolean(runtimeId) }];
    });
  }

  private run(args: string[]) {
    const result = spawnSync(this.executable, args, { encoding: "utf8", timeout: 4_000 });
    if (result.status !== 0) throw new Error(result.stderr.trim() || `tmux ${args[0] ?? "command"} fehlgeschlagen.`);
  }
}
