import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { TmuxSupervisor } from "./TmuxSupervisor.js";

const executable = "/usr/bin/tmux";
const created: string[] = [];

afterEach(() => {
  if (!existsSync(executable)) return;
  const supervisor = new TmuxSupervisor(executable);
  for (const name of created.splice(0)) supervisor.terminate(name);
});

describe.skipIf(!existsSync(executable))("TmuxSupervisor", () => {
  it("keeps a managed shell alive and discovers its metadata", async () => {
    const supervisor = new TmuxSupervisor(executable);
    const runtimeId = randomUUID();
    const name = supervisor.ensure({
      runtimeId,
      kind: "shell",
      projectId: "test-project",
      cwd: "/tmp",
      command: {
        file: "/bin/bash",
        args: ["--noprofile", "--norc", "-c", "printf 'workbench-tmux-ready\\n'; exec sleep 20"],
        environment: { TERM: "xterm-256color", PATH: "/usr/bin:/bin" },
      },
    });
    created.push(name);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(supervisor.has(name)).toBe(true);
    expect(supervisor.capture(name)).toContain("workbench-tmux-ready");
    expect(supervisor.list()).toContainEqual(expect.objectContaining({
      name,
      runtimeId,
      kind: "shell",
      projectId: "test-project",
      managed: true,
    }));
  });
});
