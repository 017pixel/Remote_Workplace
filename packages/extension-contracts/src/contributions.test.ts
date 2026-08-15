import { describe, expect, it } from "vitest";
import {
  COMMAND_CONTRIBUTIONS_MAX_COUNT,
  CONTRIBUTION_TITLE_MAX_LENGTH,
  commandContributionSchema,
  commandContributionsSchema,
} from "./contributions.js";

const createCommand = {
  id: "workbench.agent-tasks.command.create",
  title: "Agent Tasks: Aufgabe erstellen",
  description: "Erstellt eine neue Aufgabe im aktuellen Projekt.",
  category: "Agent Tasks",
};

describe("Command Contributions V1", () => {
  it("akzeptiert stabile IDs und reine Anzeigemetadaten", () => {
    expect(commandContributionSchema.parse(createCommand)).toEqual(createCommand);
    expect(
      commandContributionSchema.parse({ id: "workbench.agent-tasks.command.open", title: "Agent Tasks öffnen" }),
    ).toEqual({ id: "workbench.agent-tasks.command.open", title: "Agent Tasks öffnen" });
  });

  it("weist Code, unbekannte Felder und ungültige IDs ab", () => {
    expect(commandContributionSchema.safeParse({ ...createCommand, execute: "spawn('task')" }).success).toBe(false);
    expect(commandContributionSchema.safeParse({ ...createCommand, id: "create-task" }).success).toBe(false);
  });

  it("weist leere, nicht normalisierte und überlange Texte ab", () => {
    expect(commandContributionSchema.safeParse({ ...createCommand, title: "" }).success).toBe(false);
    expect(commandContributionSchema.safeParse({ ...createCommand, title: " Agent Tasks" }).success).toBe(false);
    expect(commandContributionSchema.safeParse({ ...createCommand, description: "Zeile 1\nZeile 2" }).success).toBe(false);
    expect(
      commandContributionSchema.safeParse({ ...createCommand, title: "a".repeat(CONTRIBUTION_TITLE_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("verlangt bei vorhandenem Commands-Bereich mindestens einen Eintrag", () => {
    expect(commandContributionsSchema.safeParse([]).success).toBe(false);
  });

  it("weist doppelte IDs auch bei anderen Metadaten ab", () => {
    expect(
      commandContributionsSchema.safeParse([createCommand, { ...createCommand, title: "Andere Anzeige" }]).success,
    ).toBe(false);
  });

  it("begrenzt die Zahl deklarierter Commands", () => {
    const commands = Array.from({ length: COMMAND_CONTRIBUTIONS_MAX_COUNT + 1 }, (_, index) => ({
      id: `workbench.agent-tasks.command.command-${index}`,
      title: `Command ${index}`,
    }));
    expect(commandContributionsSchema.safeParse(commands).success).toBe(false);
  });
});
