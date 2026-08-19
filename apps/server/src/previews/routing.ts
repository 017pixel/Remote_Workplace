import type { PreviewSlotState } from "@wrapt/contracts";
import type { AffinityRow, BindingRow, PreviewSlotDatabase, SessionRow } from "./database.js";

export interface PreviewSlotDefinition {
  id: number;
  internalPort: number;
  publicPort: number;
}

/** Was ein Slot-Listener zur Bearbeitung eines Requests braucht. */
export interface SlotRoute {
  slotId: number;
  targetPort: number;
  targetProtocol: "http" | "https";
  role: "primary" | "dependency";
  label: string;
  /** Nur gesetzt, wenn die Zuordnung eindeutig ist (genau eine Session). */
  sessionId: string | null;
  storageProfileId: string | null;
  state: PreviewSlotState;
  /** Zielport → öffentliche Slot-Origin, für Bridge und Redirect-Umschreibung. */
  mapping: Record<string, string>;
  primaryTarget: { targetPort: number; targetProtocol: "http" | "https" } | null;
}

export interface RoutingSnapshot {
  revision: number;
  routes: ReadonlyMap<number, SlotRoute>;
}

export const emptyRoutingSnapshot: RoutingSnapshot = { revision: 0, routes: new Map() };

/**
 * Fingerprint eines Session-Routings. Zwei Sessions dürfen einen Slot nur
 * teilen, wenn ihr vollständiger Binding-Fingerprint identisch ist — sonst hätte
 * dieselbe Origin zwei widersprüchliche Routingkontexte.
 */
export function bindingFingerprint(bindings: readonly BindingRow[]): string {
  return JSON.stringify(
    [...bindings]
      .map((binding) => [binding.slotId, binding.targetPort, binding.targetProtocol, binding.role, binding.label])
      .sort((left, right) => Number(left[0]) - Number(right[0])),
  );
}

function slotState(affinity: AffinityRow | undefined, bound: boolean): PreviewSlotState {
  if (affinity?.state === "quarantined" || affinity?.state === "resetting") return affinity.state;
  return bound ? "active" : "free";
}

/**
 * Baut einen unveränderlichen Routing-Snapshot aus dem committeten
 * Datenbankzustand. Listener lesen pro Request genau einen Snapshot; ein
 * halber Graph wird nie sichtbar.
 */
export function buildRoutingSnapshot(
  database: PreviewSlotDatabase,
  definitions: readonly PreviewSlotDefinition[],
  publicUrlForSlot: (slotId: number) => string,
): RoutingSnapshot {
  const sessions = new Map<string, SessionRow>(database.allSessions().map((session) => [session.id, session]));
  const bindingsBySession = new Map<string, BindingRow[]>();
  for (const binding of database.allBindings()) {
    const list = bindingsBySession.get(binding.sessionId) ?? [];
    list.push(binding);
    bindingsBySession.set(binding.sessionId, list);
  }
  const affinities = new Map<number, AffinityRow>(database.affinities().map((row) => [row.slotId, row]));
  const targets = new Map<number, number | null>(database.list().map((row) => [row.slotId, row.targetPort]));

  const sessionsPerSlot = new Map<number, string[]>();
  for (const [sessionId, bindings] of bindingsBySession) {
    for (const binding of bindings) {
      const list = sessionsPerSlot.get(binding.slotId) ?? [];
      list.push(sessionId);
      sessionsPerSlot.set(binding.slotId, list);
    }
  }

  const routes = new Map<number, SlotRoute>();
  for (const definition of definitions) {
    const slotSessions = sessionsPerSlot.get(definition.id) ?? [];
    const affinity = affinities.get(definition.id);
    if (slotSessions.length === 0) {
      const targetPort = targets.get(definition.id) ?? null;
      // Ohne Session bleibt höchstens eine manuelle Direktzuweisung übrig.
      if (targetPort === null) continue;
      routes.set(definition.id, {
        slotId: definition.id,
        targetPort,
        targetProtocol: "http",
        role: "primary",
        label: "Hauptdienst",
        sessionId: null,
        storageProfileId: affinity?.storageProfileId ?? null,
        state: slotState(affinity, true),
        mapping: { [String(targetPort)]: publicUrlForSlot(definition.id) },
        primaryTarget: { targetPort, targetProtocol: "http" },
      });
      continue;
    }

    const fingerprints = new Set(slotSessions.map((sessionId) => bindingFingerprint(bindingsBySession.get(sessionId) ?? [])));
    // Bei widersprüchlichen Kontexten gewinnt die zuletzt aktualisierte Session;
    // die Zuordnung gilt dann als nicht eindeutig.
    const chosenId = [...slotSessions].sort((left, right) => {
      const leftSession = sessions.get(left);
      const rightSession = sessions.get(right);
      return (rightSession?.leaseExpiresAt ?? "").localeCompare(leftSession?.leaseExpiresAt ?? "");
    })[0]!;
    const bindings = bindingsBySession.get(chosenId) ?? [];
    const current = bindings.find((binding) => binding.slotId === definition.id);
    if (!current) continue;
    const primary = bindings.find((binding) => binding.role === "primary") ?? null;
    const unambiguous = fingerprints.size === 1;
    const session = sessions.get(chosenId) ?? null;
    routes.set(definition.id, {
      slotId: definition.id,
      targetPort: current.targetPort,
      targetProtocol: current.targetProtocol,
      role: current.role,
      label: current.label,
      sessionId: unambiguous && slotSessions.length === 1 ? chosenId : null,
      storageProfileId: session?.storageProfileId ?? affinity?.storageProfileId ?? null,
      state: slotState(affinity, true),
      mapping: Object.fromEntries(bindings.map((binding) => [String(binding.targetPort), publicUrlForSlot(binding.slotId)])),
      primaryTarget: primary ? { targetPort: primary.targetPort, targetProtocol: primary.targetProtocol } : null,
    });
  }
  return { revision: database.routingRevision(), routes };
}
