import {
  commandContributionSchema,
  type CommandContribution,
  type ContributionId,
  type ExtensionId,
} from "@workbench/extension-contracts";
import {
  FrontendContributionRegistry,
  type FrontendRegistrySnapshot,
  type OwnedFrontendContribution,
} from "./registryCore";

export const commandSurfaces = ["global", "terminal", "browser", "form"] as const;
export type CommandSurface = (typeof commandSurfaces)[number];

/**
 * Der Ausführungskontext eines Commands. Befehle, deren Surface nicht zum
 * aktiven Kontext passt, werden nicht ausgeführt — so behalten Terminal-,
 * Browser- und Formulareingabe Vorrang vor globalen Aktionen.
 */
export interface CommandExecutionContext {
  readonly surface: CommandSurface;
}

export const globalCommandContext: CommandExecutionContext = Object.freeze({
  surface: "global",
});

export interface CommandRuntimeBinding {
  readonly execute: (context: CommandExecutionContext) => void | Promise<void>;
  readonly surface?: CommandSurface;
}

export interface CommandRegistration {
  readonly contribution: CommandContribution;
  readonly runtime: CommandRuntimeBinding;
}

export interface CommandRegistryValue {
  readonly contribution: CommandContribution;
  readonly runtime: CommandRuntimeBinding;
}

export type OwnedCommandItem = OwnedFrontendContribution<CommandRegistryValue>;

export interface CommandRegistrySnapshot {
  readonly revision: number;
  readonly commands: readonly OwnedCommandItem[];
}

export const commandRegistryErrorCodes = [
  "invalid-command",
  "invalid-command-runtime",
] as const;
export type CommandRegistryErrorCode =
  (typeof commandRegistryErrorCodes)[number];

export class CommandRegistryError extends Error {
  readonly code: CommandRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: CommandRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "CommandRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

function isValidRuntime(runtime: CommandRuntimeBinding): boolean {
  return (
    typeof runtime === "object" &&
    runtime !== null &&
    typeof runtime.execute === "function" &&
    (runtime.surface === undefined || commandSurfaces.includes(runtime.surface))
  );
}

function surfaceAllows(runtimeSurface: CommandSurface | undefined, contextSurface: CommandSurface): boolean {
  return runtimeSurface === undefined || runtimeSurface === contextSurface;
}

function compareCommands(
  left: OwnedFrontendContribution<CommandRegistryValue>,
  right: OwnedFrontendContribution<CommandRegistryValue>,
): number {
  return left.contributionId < right.contributionId
    ? -1
    : left.contributionId > right.contributionId
      ? 1
      : 0;
}

/**
 * Typisierte Runtime-Grenze für UI Commands. Manifest-Metadaten (ID, Titel,
 * Beschreibung, Kategorie) bleiben von der Ausführung getrennt; genau ein
 * Handler ergibt sich aus der global eindeutigen Command-ID. Eine Contribution
 * ohne Handler bleibt registrierbar (Discovery), ist aber nicht ausführbar.
 */
export class CommandRegistry {
  private readonly registry =
    new FrontendContributionRegistry<CommandRegistryValue>();
  private derivedSnapshot: CommandRegistrySnapshot = Object.freeze({
    revision: 0,
    commands: Object.freeze([]),
  });

  readonly subscribe = this.registry.subscribe;

  readonly getSnapshot = (): CommandRegistrySnapshot => {
    const snapshot = this.registry.getSnapshot();
    if (snapshot.revision !== this.derivedSnapshot.revision) {
      this.derivedSnapshot = this.deriveSnapshot(snapshot);
    }
    return this.derivedSnapshot;
  };

  get(commandId: string): OwnedCommandItem | undefined {
    const entry = this.registry.get(commandId);
    return entry === undefined ? undefined : entry;
  }

  replaceOwner(
    ownerId: string,
    registrations: readonly CommandRegistration[],
  ): CommandRegistrySnapshot {
    const values = registrations.map((registration) => {
      const parsed = commandContributionSchema.safeParse(
        registration.contribution,
      );
      if (!parsed.success) {
        throw new CommandRegistryError(
          "invalid-command",
          "Eine gültige Command Contribution wird erwartet.",
          ownerId,
          registration.contribution.id,
        );
      }
      if (!isValidRuntime(registration.runtime)) {
        throw new CommandRegistryError(
          "invalid-command-runtime",
          "Ein Command benötigt eine ausführbare Runtime-Bindung.",
          ownerId,
          parsed.data.id,
        );
      }
      return Object.freeze({
        contribution: parsed.data,
        runtime: registration.runtime,
      });
    });

    this.registry.replaceOwner(
      ownerId,
      values.map((value) => ({ id: value.contribution.id, value })),
    );
    return this.getSnapshot();
  }

  removeOwner(ownerId: string): boolean {
    return this.registry.removeOwner(ownerId);
  }

  /**
   * Führt den Command aus, wenn er registriert ist und seine Surface zum
   * aktiven Kontext passt. Gibt `true` bei Ausführung zurück, `false`, wenn
   * der Command unbekannt oder im Kontext blockiert ist. Handler-Fehler
   * propagieren an den Aufrufer.
   */
  async execute(
    commandId: string,
    context: CommandExecutionContext = globalCommandContext,
  ): Promise<boolean> {
    const entry = this.get(commandId);
    if (entry === undefined) return false;
    if (!surfaceAllows(entry.value.runtime.surface, context.surface)) return false;
    await entry.value.runtime.execute(context);
    return true;
  }

  private deriveSnapshot(
    snapshot: FrontendRegistrySnapshot<CommandRegistryValue>,
  ): CommandRegistrySnapshot {
    return Object.freeze({
      revision: snapshot.revision,
      commands: Object.freeze(
        [...snapshot.contributions].sort(compareCommands),
      ),
    });
  }
}

export const commandRegistry = new CommandRegistry();

export type { ContributionId, ExtensionId };
