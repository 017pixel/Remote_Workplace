import { describe, expect, it } from "vitest";
import {
  ACTIVATION_EVENTS_MAX_COUNT,
  activationEventBelongsToExtension,
  activationEventContributionId,
  activationEventSchema,
  activationEventsV1Schema,
  extensionEventIdSchema,
  staticActivationEvents,
} from "./activation-events.js";

describe("Activation Events V1", () => {
  it("akzeptiert alle statischen Activation Events", () => {
    for (const event of staticActivationEvents) {
      expect(activationEventSchema.parse(event)).toBe(event);
    }
  });

  it.each([
    "onCommand:workbench.agent-tasks.command.create",
    "onRoute:workbench.agent-tasks.route.main",
    "onOrbitNode:workbench.agent-tasks.orbit.task-board",
    "onEvent:project.opened",
    "onEvent:workbench.agent-tasks.task.created",
    "onSchedule:workbench.agent-tasks.job.cleanup",
  ])("akzeptiert das referenzierte Event %s", (event) => {
    expect(activationEventSchema.parse(event)).toBe(event);
  });

  it.each([
    "startup",
    "onStartup:anything",
    "onCommand",
    "onCommand:",
    "onCommand:workbench.agent-tasks",
    "onRoute:Workbench.Agent.route.main",
    "onOrbitNode:workbench.agent_tasks.orbit.main",
    "onEvent:project",
    "onEvent:project/opened",
    "onSchedule:../cleanup",
    " onProject",
  ])("weist das unbekannte oder ungültige Event %s ab", (event) => {
    expect(activationEventSchema.safeParse(event).success).toBe(false);
  });

  it("begrenzt referenzierte IDs unabhängig von der Präfixlänge", () => {
    const oversizedContributionId = Array.from({ length: 4 }, () => "a".repeat(64)).join(".");
    expect(activationEventSchema.safeParse(`onCommand:${oversizedContributionId}`).success).toBe(false);
    expect(activationEventSchema.safeParse(`onEvent:${oversizedContributionId}`).success).toBe(false);
  });

  it("validiert stabile Core- und Extension-Event-IDs", () => {
    expect(extensionEventIdSchema.parse("project.opened")).toBe("project.opened");
    expect(extensionEventIdSchema.parse("workbench.agent-tasks.task.created")).toBe(
      "workbench.agent-tasks.task.created",
    );
    expect(extensionEventIdSchema.safeParse("Project.Opened").success).toBe(false);
    expect(extensionEventIdSchema.safeParse("project").success).toBe(false);
  });

  it("extrahiert nur Contribution-Referenzen", () => {
    expect(activationEventContributionId("onCommand:workbench.agent-tasks.command.create")).toBe(
      "workbench.agent-tasks.command.create",
    );
    expect(activationEventContributionId("onSchedule:workbench.agent-tasks.job.cleanup")).toBe(
      "workbench.agent-tasks.job.cleanup",
    );
    expect(activationEventContributionId("onEvent:project.opened")).toBeNull();
    expect(activationEventContributionId("onStartup")).toBeNull();
    expect(activationEventContributionId("unknown")).toBeNull();
  });

  it("prüft die exakte Extension-Namespace-Grenze", () => {
    expect(
      activationEventBelongsToExtension(
        "workbench.agent-tasks",
        "onCommand:workbench.agent-tasks.command.create",
      ),
    ).toBe(true);
    expect(
      activationEventBelongsToExtension(
        "workbench.agent-tasks",
        "onCommand:workbench.agent-tasks-plus.command.create",
      ),
    ).toBe(false);
    expect(
      activationEventBelongsToExtension("workbench.agent-tasks", "onCommand:workbench.other.command.create"),
    ).toBe(false);
    expect(activationEventBelongsToExtension("workbench.agent-tasks", "onEvent:project.opened")).toBe(true);
    expect(activationEventBelongsToExtension("workbench", "onStartup")).toBe(false);
    expect(activationEventBelongsToExtension("workbench.agent-tasks", "unknown")).toBe(false);
  });

  it("weist doppelte und übergroße Eventlisten ab", () => {
    expect(activationEventsV1Schema.safeParse(["onStartup", "onStartup"]).success).toBe(false);
    expect(
      activationEventsV1Schema.safeParse(
        Array.from({ length: ACTIVATION_EVENTS_MAX_COUNT + 1 }, () => "onStartup"),
      ).success,
    ).toBe(false);
  });
});
