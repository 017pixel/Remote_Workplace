import {
  contributionBelongsToExtension,
  contributionIdSchema,
  extensionIdSchema,
  type ContributionId,
  type ExtensionId,
} from "@wrapt/extension-contracts";

export const frontendRegistryErrorCodes = [
  "invalid-owner",
  "invalid-contribution-id",
  "foreign-namespace",
  "duplicate-contribution",
  "contribution-collision",
] as const;
export type FrontendRegistryErrorCode =
  (typeof frontendRegistryErrorCodes)[number];

export class FrontendRegistryError extends Error {
  readonly code: FrontendRegistryErrorCode;
  readonly ownerId: string;
  readonly contributionId: string | undefined;

  constructor(
    code: FrontendRegistryErrorCode,
    message: string,
    ownerId: string,
    contributionId?: string,
  ) {
    super(message);
    this.name = "FrontendRegistryError";
    this.code = code;
    this.ownerId = ownerId;
    this.contributionId = contributionId;
  }
}

export interface FrontendContributionRegistration<T> {
  readonly id: string;
  readonly value: T;
}

export interface OwnedFrontendContribution<T> {
  readonly ownerId: ExtensionId;
  readonly contributionId: ContributionId;
  readonly value: T;
}

export interface FrontendRegistrySnapshot<T> {
  readonly revision: number;
  readonly contributions: readonly OwnedFrontendContribution<T>[];
}

type RegistryListener = () => void;

/** Kanonisiert neue Produkt-IDs und hält alte `workbench.*`-IDs lesbar. */
export function canonicalProductId(value: string): string {
  return value.startsWith("workbench.") ? `wrapt.${value.slice("workbench.".length)}` : value;
}

function legacyProductId(value: string): string | null {
  return value.startsWith("wrapt.") ? `workbench.${value.slice("wrapt.".length)}` : null;
}

function compareContributionIds<T>(
  left: OwnedFrontendContribution<T>,
  right: OwnedFrontendContribution<T>,
): number {
  if (left.contributionId < right.contributionId) return -1;
  if (left.contributionId > right.contributionId) return 1;
  return 0;
}

function sameOwnerBatch<T>(
  current: readonly OwnedFrontendContribution<T>[],
  next: readonly OwnedFrontendContribution<T>[],
): boolean {
  if (current.length !== next.length) return false;
  return current.every((entry, index) => {
    const candidate = next[index];
    return (
      candidate !== undefined &&
      entry.contributionId === candidate.contributionId &&
      entry.value === candidate.value
    );
  });
}

/**
 * Gemeinsamer, bewusst kleiner Ownership-Kern für Frontend Contributions.
 * Surface-spezifische Registries validieren ihre Metadaten und Runtime-Bindings
 * selbst und ersetzen danach den vollständigen Batch einer Extension atomar.
 */
export class FrontendContributionRegistry<T> {
  private readonly entriesById = new Map<
    ContributionId,
    OwnedFrontendContribution<T>
  >();
  private readonly listeners = new Set<RegistryListener>();
  private snapshot: FrontendRegistrySnapshot<T> = Object.freeze({
    revision: 0,
    contributions: Object.freeze([]),
  });

  readonly getSnapshot = (): FrontendRegistrySnapshot<T> => this.snapshot;

  readonly subscribe = (listener: RegistryListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(contributionId: string): OwnedFrontendContribution<T> | undefined {
    const parsedId = contributionIdSchema.safeParse(canonicalProductId(contributionId));
    if (!parsedId.success) return undefined;
    const legacyId = legacyProductId(parsedId.data);
    const parsedLegacyId = legacyId === null ? null : contributionIdSchema.safeParse(legacyId);
    return this.entriesById.get(parsedId.data)
      ?? (parsedLegacyId?.success ? this.entriesById.get(parsedLegacyId.data) : undefined);
  }

  contributionsByOwner(ownerId: string): readonly OwnedFrontendContribution<T>[] {
    const parsedOwner = extensionIdSchema.safeParse(canonicalProductId(ownerId));
    if (!parsedOwner.success) return Object.freeze([]);
    const legacyOwner = legacyProductId(parsedOwner.data);
    return Object.freeze(
      this.snapshot.contributions.filter(
        (contribution) => contribution.ownerId === parsedOwner.data || contribution.ownerId === legacyOwner,
      ),
    );
  }

  replaceOwner(
    ownerId: string,
    registrations: readonly FrontendContributionRegistration<T>[],
  ): FrontendRegistrySnapshot<T> {
    const parsedOwner = extensionIdSchema.safeParse(ownerId);
    if (!parsedOwner.success) {
      throw new FrontendRegistryError(
        "invalid-owner",
        "Eine gültige Extension ID wird als Registry-Owner erwartet.",
        ownerId,
      );
    }

    const batchIds = new Set<ContributionId>();
    const nextOwnerEntries: OwnedFrontendContribution<T>[] = [];
    for (const registration of registrations) {
      const parsedId = contributionIdSchema.safeParse(registration.id);
      if (!parsedId.success) {
        throw new FrontendRegistryError(
          "invalid-contribution-id",
          "Eine gültige Contribution ID wird erwartet.",
          parsedOwner.data,
          registration.id,
        );
      }
      if (!contributionBelongsToExtension(parsedOwner.data, parsedId.data)) {
        throw new FrontendRegistryError(
          "foreign-namespace",
          "Eine Contribution muss zum Namespace ihres Owners gehören.",
          parsedOwner.data,
          parsedId.data,
        );
      }
      if (batchIds.has(parsedId.data)) {
        throw new FrontendRegistryError(
          "duplicate-contribution",
          "Eine Contribution ID darf im Owner-Batch nur einmal vorkommen.",
          parsedOwner.data,
          parsedId.data,
        );
      }

      const existing = this.entriesById.get(parsedId.data);
      if (existing !== undefined && existing.ownerId !== parsedOwner.data) {
        throw new FrontendRegistryError(
          "contribution-collision",
          "Eine Contribution ID ist bereits durch einen anderen Owner belegt.",
          parsedOwner.data,
          parsedId.data,
        );
      }

      batchIds.add(parsedId.data);
      nextOwnerEntries.push(
        Object.freeze({
          ownerId: parsedOwner.data,
          contributionId: parsedId.data,
          value: registration.value,
        }),
      );
    }

    nextOwnerEntries.sort(compareContributionIds);
    const currentOwnerEntries = this.snapshot.contributions.filter(
      (contribution) => contribution.ownerId === parsedOwner.data,
    );
    if (sameOwnerBatch(currentOwnerEntries, nextOwnerEntries)) {
      return this.snapshot;
    }

    const nextEntries = new Map(this.entriesById);
    for (const [id, contribution] of nextEntries) {
      if (contribution.ownerId === parsedOwner.data) nextEntries.delete(id);
    }
    for (const contribution of nextOwnerEntries) {
      nextEntries.set(contribution.contributionId, contribution);
    }
    this.commit(nextEntries);
    return this.snapshot;
  }

  removeOwner(ownerId: string): boolean {
    const parsedOwner = extensionIdSchema.safeParse(canonicalProductId(ownerId));
    if (!parsedOwner.success) return false;
    const legacyOwner = legacyProductId(parsedOwner.data);

    const nextEntries = new Map(this.entriesById);
    let removed = false;
    for (const [id, contribution] of nextEntries) {
      if (contribution.ownerId !== parsedOwner.data && contribution.ownerId !== legacyOwner) continue;
      nextEntries.delete(id);
      removed = true;
    }
    if (removed) this.commit(nextEntries);
    return removed;
  }

  private commit(
    nextEntries: Map<ContributionId, OwnedFrontendContribution<T>>,
  ): void {
    this.entriesById.clear();
    for (const [id, contribution] of nextEntries) {
      this.entriesById.set(id, contribution);
    }

    const contributions = Object.freeze(
      [...this.entriesById.values()].sort(compareContributionIds),
    );
    this.snapshot = Object.freeze({
      revision: this.snapshot.revision + 1,
      contributions,
    });
    for (const listener of [...this.listeners]) listener();
  }
}
