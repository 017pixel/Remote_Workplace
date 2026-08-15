import { describe, expect, it } from "vitest";
import {
  TERMINAL_CONTRIBUTIONS_MAX_COUNT,
  TERMINAL_ORDER_MAX,
  terminalContributionSchema,
  terminalContributionsSchema,
} from "./terminal-contributions.js";

const profile = {
  id: "workbench.python.terminal.profile.repl",
  kind: "profile",
  title: "Python REPL",
  description: "Öffnet eine beaufsichtigte Python-Sitzung.",
  icon: "workbench.python.icon.terminal",
  order: 100,
  provider: "workbench.python.terminal-provider.repl",
  projectContext: true,
  supportsSplit: true,
  visibleByDefault: true,
  when: {
    all: [
      {
        key: "host.project.open",
        operator: "equals",
        value: true,
      },
    ],
  },
} as const;

describe("Terminal Contributions V1", () => {
  it("akzeptiert hostverwaltete Terminal Profile", () => {
    expect(terminalContributionSchema.safeParse(profile).success).toBe(true);
  });

  it("akzeptiert Command-basierte Actions für mehrere Host-Surfaces", () => {
    expect(
      terminalContributionSchema.safeParse({
        id: "workbench.python.terminal.action.interrupt",
        kind: "action",
        title: "Prozess unterbrechen",
        icon: "workbench.python.icon.stop",
        order: 200,
        commandId: "workbench.python.command.interrupt",
        group: "session",
        surfaces: ["toolbar", "mobile-actions"],
        requiresSession: true,
      }).success,
    ).toBe(true);
  });

  it("weist freie Launch-Daten, unbekannte Surfaces und ungültige Grenzen ab", () => {
    expect(
      terminalContributionSchema.safeParse({
        ...profile,
        command: "python",
      }).success,
    ).toBe(false);
    expect(
      terminalContributionSchema.safeParse({
        id: "workbench.python.terminal.action.interrupt",
        kind: "action",
        title: "Prozess unterbrechen",
        order: 200,
        commandId: "workbench.python.command.interrupt",
        group: "session",
        surfaces: ["terminal-body"],
        requiresSession: true,
      }).success,
    ).toBe(false);
    expect(
      terminalContributionSchema.safeParse({
        ...profile,
        order: TERMINAL_ORDER_MAX + 1,
      }).success,
    ).toBe(false);
  });

  it("weist doppelte Surfaces, IDs und übergroße Listen ab", () => {
    expect(
      terminalContributionSchema.safeParse({
        id: "workbench.python.terminal.action.interrupt",
        kind: "action",
        title: "Prozess unterbrechen",
        order: 200,
        commandId: "workbench.python.command.interrupt",
        group: "session",
        surfaces: ["toolbar", "toolbar"],
        requiresSession: true,
      }).success,
    ).toBe(false);
    expect(terminalContributionsSchema.safeParse([profile, profile]).success).toBe(
      false,
    );
    expect(
      terminalContributionsSchema.safeParse(
        Array.from(
          { length: TERMINAL_CONTRIBUTIONS_MAX_COUNT + 1 },
          (_, index) => ({
            ...profile,
            id: `workbench.python.terminal.profile.repl-${index}`,
          }),
        ),
      ).success,
    ).toBe(false);
  });
});
