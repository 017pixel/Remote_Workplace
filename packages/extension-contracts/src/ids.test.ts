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
    "wrapt.terminal",
    "wrapt.agent-tasks",
    "com.example.extension",
    "a.b",
  ])("akzeptiert %s", (value) => {
    expect(extensionIdSchema.parse(value)).toBe(value);
  });

  it.each([
    "terminal",
    "Workbench.Terminal",
    "wrapt_terminal",
    "wrapt.-terminal",
    "wrapt.terminal-",
    "wrapt..terminal",
    " wrapt.terminal",
  ])("lehnt %s ab", (value) => {
    expect(extensionIdSchema.safeParse(value).success).toBe(false);
  });

  it("begrenzt Extension IDs", () => {
    expect(extensionIdSchema.safeParse(`workbench.${"a".repeat(EXTENSION_ID_MAX_LENGTH)}`).success).toBe(false);
  });
});

describe("stabile Contribution IDs", () => {
  it.each([
    "wrapt.terminal.page.main",
    "wrapt.terminal.command.new",
    "com.example.extension.orbit.main",
  ])("akzeptiert %s", (value) => {
    expect(contributionIdSchema.parse(value)).toBe(value);
  });

  it.each([
    "terminal.page",
    "wrapt.terminal",
    "wrapt.terminal.Command.New",
    "wrapt.terminal.command_new",
  ])("lehnt %s ab", (value) => {
    expect(contributionIdSchema.safeParse(value).success).toBe(false);
  });

  it("begrenzt Contribution IDs", () => {
    expect(contributionIdSchema.safeParse(`wrapt.terminal.${"a".repeat(CONTRIBUTION_ID_MAX_LENGTH)}`).success).toBe(false);
  });

  it("prüft die exakte Extension-Namespace-Grenze", () => {
    expect(contributionBelongsToExtension("wrapt.terminal", "wrapt.terminal.command.new")).toBe(true);
    expect(contributionBelongsToExtension("wrapt.term", "wrapt.terminal.command.new")).toBe(false);
    expect(contributionBelongsToExtension("wrapt.terminal", "wrapt.terminal-plus.command.new")).toBe(false);
    expect(contributionBelongsToExtension("wrapt", "workbench.command.new")).toBe(false);
    expect(contributionBelongsToExtension("wrapt.terminal", "wrapt.terminal")).toBe(false);
  });
});
