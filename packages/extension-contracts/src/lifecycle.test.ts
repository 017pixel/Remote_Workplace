import { describe, expect, it } from "vitest";
import {
  extensionLifecycleStateSchema,
  extensionLifecycleStates,
  extensionLifecycleTransitionSchema,
  extensionLifecycleTransitions,
  isExtensionLifecycleTransitionAllowed,
  isTransientExtensionLifecycleState,
  transientExtensionLifecycleStates,
} from "./lifecycle.js";

describe("Extension Lifecycle V1", () => {
  it("enthält die vollständigen V1-Zustände", () => {
    expect(extensionLifecycleStates).toEqual([
      "available",
      "staging",
      "installing",
      "permissions-pending",
      "installed",
      "disabled",
      "enabling",
      "activating",
      "active",
      "deactivating",
      "crashed",
      "quarantined",
      "incompatible",
      "update-available",
      "updating",
      "migration-failed",
      "uninstalling",
    ]);
    for (const state of extensionLifecycleStates) expect(extensionLifecycleStateSchema.parse(state)).toBe(state);
    expect(extensionLifecycleStateSchema.safeParse("enabled").success).toBe(false);
  });

  it("deckt jeden Zustand mit einer deterministischen Übergangsliste ab", () => {
    expect(Object.keys(extensionLifecycleTransitions).sort()).toEqual([...extensionLifecycleStates].sort());
    for (const state of extensionLifecycleStates) {
      expect(extensionLifecycleTransitions[state].length).toBeGreaterThan(0);
      expect(new Set(extensionLifecycleTransitions[state]).size).toBe(extensionLifecycleTransitions[state].length);
    }
  });

  it("erlaubt den vollständigen Installations- und Aktivierungspfad", () => {
    const path = ["available", "staging", "installing", "installed", "enabling", "activating", "active"] as const;
    for (let index = 1; index < path.length; index += 1) {
      expect(isExtensionLifecycleTransitionAllowed(path[index - 1]!, path[index]!)).toBe(true);
    }
  });

  it("erlaubt Permission Review und atomaren Updatepfad", () => {
    expect(isExtensionLifecycleTransitionAllowed("staging", "permissions-pending")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("permissions-pending", "installing")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("active", "update-available")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("update-available", "staging")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("staging", "updating")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("updating", "activating")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("updating", "migration-failed")).toBe(true);
  });

  it("erzwingt Deaktivierung vor normaler Deinstallation", () => {
    expect(isExtensionLifecycleTransitionAllowed("active", "uninstalling")).toBe(false);
    expect(isExtensionLifecycleTransitionAllowed("active", "deactivating")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("deactivating", "disabled")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("disabled", "uninstalling")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("uninstalling", "available")).toBe(true);
    expect(
      extensionLifecycleStates.filter((state) =>
        (extensionLifecycleTransitions[state] as readonly string[]).includes("uninstalling"),
      ),
    ).toEqual(["installed", "disabled"]);
  });

  it("isoliert Crash Loop und Quarantäne vom direkten Neustart", () => {
    expect(isExtensionLifecycleTransitionAllowed("active", "crashed")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("crashed", "activating")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("crashed", "quarantined")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("quarantined", "active")).toBe(false);
    expect(isExtensionLifecycleTransitionAllowed("quarantined", "disabled")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("quarantined", "update-available")).toBe(true);
    expect(isExtensionLifecycleTransitionAllowed("quarantined", "updating")).toBe(false);
  });

  it("weist unbekannte, direkte und idempotente Zustandswechsel ab", () => {
    expect(isExtensionLifecycleTransitionAllowed("available", "active")).toBe(false);
    expect(isExtensionLifecycleTransitionAllowed("active", "active")).toBe(false);
    expect(isExtensionLifecycleTransitionAllowed("unknown", "active")).toBe(false);
    expect(extensionLifecycleTransitionSchema.safeParse({ from: "available", to: "active" }).success).toBe(false);
    expect(extensionLifecycleTransitionSchema.safeParse({ from: "available", to: "staging" }).success).toBe(true);
    expect(extensionLifecycleTransitionSchema.safeParse({ from: "available", to: "staging", force: true }).success).toBe(
      false,
    );
  });

  it("markiert ausschließlich laufende Operationen als transient", () => {
    expect(transientExtensionLifecycleStates).toEqual([
      "staging",
      "installing",
      "enabling",
      "activating",
      "deactivating",
      "updating",
      "uninstalling",
    ]);
    for (const state of transientExtensionLifecycleStates) {
      expect(isTransientExtensionLifecycleState(state)).toBe(true);
    }
    expect(isTransientExtensionLifecycleState("active")).toBe(false);
    expect(isTransientExtensionLifecycleState("unknown")).toBe(false);
  });
});
