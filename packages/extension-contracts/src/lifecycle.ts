import { z } from "zod";

export const extensionLifecycleStates = [
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
] as const;

export const extensionLifecycleStateSchema = z.enum(extensionLifecycleStates);
export type ExtensionLifecycleState = z.infer<typeof extensionLifecycleStateSchema>;

export const transientExtensionLifecycleStates = [
  "staging",
  "installing",
  "enabling",
  "activating",
  "deactivating",
  "updating",
  "uninstalling",
] as const satisfies readonly ExtensionLifecycleState[];

export const transientExtensionLifecycleStateSchema = z.enum(transientExtensionLifecycleStates);
export type TransientExtensionLifecycleState = z.infer<typeof transientExtensionLifecycleStateSchema>;

export const extensionLifecycleTransitions = {
  available: ["staging", "incompatible"],
  staging: ["available", "permissions-pending", "installing", "updating", "incompatible"],
  installing: ["available", "installed", "migration-failed", "incompatible"],
  "permissions-pending": [
    "available",
    "installing",
    "installed",
    "disabled",
    "active",
    "update-available",
    "updating",
  ],
  installed: ["disabled", "enabling", "incompatible", "update-available", "uninstalling"],
  disabled: ["enabling", "incompatible", "update-available", "uninstalling"],
  enabling: ["activating", "disabled", "incompatible"],
  activating: ["active", "crashed", "quarantined", "disabled", "incompatible"],
  active: ["deactivating", "crashed", "update-available"],
  deactivating: ["disabled", "incompatible"],
  crashed: ["activating", "disabled", "quarantined", "update-available"],
  quarantined: ["disabled", "update-available"],
  incompatible: ["available", "installed", "disabled"],
  "update-available": [
    "staging",
    "installed",
    "disabled",
    "enabling",
    "active",
    "deactivating",
    "incompatible",
  ],
  updating: [
    "installed",
    "disabled",
    "activating",
    "active",
    "quarantined",
    "incompatible",
    "update-available",
    "migration-failed",
  ],
  "migration-failed": ["installed", "disabled", "active", "updating", "quarantined"],
  uninstalling: ["available", "installed", "disabled"],
} as const satisfies Record<ExtensionLifecycleState, readonly ExtensionLifecycleState[]>;

export function isExtensionLifecycleTransitionAllowed(
  from: ExtensionLifecycleState | string,
  to: ExtensionLifecycleState | string,
): boolean {
  const parsedFrom = extensionLifecycleStateSchema.safeParse(from);
  const parsedTo = extensionLifecycleStateSchema.safeParse(to);
  if (!parsedFrom.success || !parsedTo.success) return false;
  return (extensionLifecycleTransitions[parsedFrom.data] as readonly ExtensionLifecycleState[]).includes(parsedTo.data);
}

export function isTransientExtensionLifecycleState(
  state: ExtensionLifecycleState | string,
): state is TransientExtensionLifecycleState {
  return transientExtensionLifecycleStateSchema.safeParse(state).success;
}

export const extensionLifecycleTransitionSchema = z
  .strictObject({
    from: extensionLifecycleStateSchema,
    to: extensionLifecycleStateSchema,
  })
  .refine((transition) => isExtensionLifecycleTransitionAllowed(transition.from, transition.to), {
    message: "Dieser Extension-Lifecycle-Übergang ist nicht zulässig.",
    path: ["to"],
  });

export type ExtensionLifecycleTransition = z.infer<typeof extensionLifecycleTransitionSchema>;
