import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_ID_MAX_LENGTH,
  EXTENSION_ID_MAX_LENGTH,
  contributionBelongsToExtension,
  contributionIdSchema,
  extensionIdSchema,
} from "./ids.js";

describe("stabile Extension IDs", () => {
  it.each([
    "workbench.terminal",
    "remote-workplace.agent-tasks",
    "com.example.extension",
    "a.b",
  ])("akzeptiert %s", (value) => {
    expect(extensionIdSchema.parse(value)).toBe(value);
  });

  it.each([
    "terminal",
    "Workbench.Terminal",
    "workbench_terminal",
    "workbench.-terminal",
    "workbench.terminal-",
    "workbench..terminal",
    " workbench.terminal",
  ])("lehnt %s ab", (value) => {
    expect(extensionIdSchema.safeParse(value).success).toBe(false);
  });

  it("begrenzt Extension IDs", () => {
    expect(extensionIdSchema.safeParse(`workbench.${"a".repeat(EXTENSION_ID_MAX_LENGTH)}`).success).toBe(false);
  });
});

describe("stabile Contribution IDs", () => {
  it.each([
    "workbench.terminal.page.main",
    "workbench.terminal.command.new",
    "com.example.extension.orbit.main",
  ])("akzeptiert %s", (value) => {
    expect(contributionIdSchema.parse(value)).toBe(value);
  });

  it.each([
    "terminal.page",
    "workbench.terminal",
    "workbench.terminal.Command.New",
    "workbench.terminal.command_new",
  ])("lehnt %s ab", (value) => {
    expect(contributionIdSchema.safeParse(value).success).toBe(false);
  });

  it("begrenzt Contribution IDs", () => {
    expect(contributionIdSchema.safeParse(`workbench.terminal.${"a".repeat(CONTRIBUTION_ID_MAX_LENGTH)}`).success).toBe(false);
  });

  it("prüft die exakte Extension-Namespace-Grenze", () => {
    expect(contributionBelongsToExtension("workbench.terminal", "workbench.terminal.command.new")).toBe(true);
    expect(contributionBelongsToExtension("workbench.term", "workbench.terminal.command.new")).toBe(false);
    expect(contributionBelongsToExtension("workbench.terminal", "workbench.terminal-plus.command.new")).toBe(false);
    expect(contributionBelongsToExtension("workbench", "workbench.command.new")).toBe(false);
    expect(contributionBelongsToExtension("workbench.terminal", "workbench.terminal")).toBe(false);
  });
});
