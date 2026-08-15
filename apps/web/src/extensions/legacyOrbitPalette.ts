import {
  BrowserIcon,
  CodeFileIcon,
  CodeServerIcon,
  CodexIcon,
  EyeIcon,
  FinderIcon,
  FrameIcon,
  HermesIcon,
  NoteIcon,
  NutzungIcon,
  OpenCodeIcon,
  T3CodeIcon,
  TerminalIcon,
  TodoIcon,
} from "../components/icons";
import type { OrbitPaletteItem } from "../stores/sidebarPreferences";
import type { OrbitPalettePayload } from "../lib/orbitPalette";
import { contributionIdSchema } from "@workbench/extension-contracts";
import {
  orbitPaletteRegistry,
  type OrbitPaletteGroup,
  type OrbitPaletteMetadata,
  type OrbitPaletteRegistry,
  type OrbitPaletteRuntimeBinding,
} from "./orbitPaletteRegistry";

interface LegacyOrbitPaletteRegistration {
  id: string;
  title: string;
  order: number;
  legacyKey: OrbitPaletteItem;
  icon: typeof T3CodeIcon;
  createPayload: () => OrbitPalettePayload;
}

interface LegacyOrbitPaletteDefinition {
  readonly ownerId: string;
  readonly group: OrbitPaletteGroup;
  readonly registrations: readonly LegacyOrbitPaletteRegistration[];
}

/**
 * Die bisherige Orbit-Seitenpalette als Legacy Built-ins: acht Werkzeuge,
 * sieben Blöcke und vier Preview-Layouts mit denselben Titeln, Reihenfolge,
 * Icons und Payloads. Die LocalStorage-Sichtbarkeit bleibt über die
 * Legacy-Keys unverändert lesbar.
 */
const legacyOrbitPaletteDefinitions = [
      {
        ownerId: "workbench.orbit",
        group: "tools",
        registrations: [
        { id: "workbench.orbit.palette.tool.t3-code", title: "T3 Code", order: 10, legacyKey: "tool:t3-code", icon: T3CodeIcon, createPayload: () => ({ type: "tool", title: "T3 Code", toolType: "t3-code" }) },
        { id: "workbench.orbit.palette.tool.hermes", title: "Hermes Agent", order: 20, legacyKey: "tool:hermes", icon: HermesIcon, createPayload: () => ({ type: "tool", title: "Hermes Agent", toolType: "hermes" }) },
        { id: "workbench.orbit.palette.tool.code-server", title: "Code-Server", order: 30, legacyKey: "tool:code-server", icon: CodeServerIcon, createPayload: () => ({ type: "tool", title: "Code-Server", toolType: "code-server" }) },
        { id: "workbench.orbit.palette.tool.terminal", title: "Terminal", order: 40, legacyKey: "tool:terminal", icon: TerminalIcon, createPayload: () => ({ type: "tool", title: "Terminal", toolType: "terminal" }) },
        { id: "workbench.orbit.palette.tool.opencode", title: "OpenCode", order: 50, legacyKey: "tool:opencode", icon: OpenCodeIcon, createPayload: () => ({ type: "tool", title: "OpenCode", toolType: "opencode" }) },
        { id: "workbench.orbit.palette.tool.codex", title: "Codex", order: 60, legacyKey: "tool:codex", icon: CodexIcon, createPayload: () => ({ type: "tool", title: "Codex", toolType: "codex" }) },
        { id: "workbench.orbit.palette.tool.files", title: "Files", order: 70, legacyKey: "tool:files", icon: FinderIcon, createPayload: () => ({ type: "tool", title: "Files", toolType: "files" }) },
        { id: "workbench.orbit.palette.tool.browser", title: "Browser", order: 80, legacyKey: "tool:browser", icon: BrowserIcon, createPayload: () => ({ type: "tool", title: "Browser", toolType: "browser" }) },
      ],
    },
    {
      ownerId: "workbench.orbit",
      group: "blocks",
      registrations: [
        { id: "workbench.orbit.palette.block.note", title: "Neue Notiz", order: 10, legacyKey: "block:note", icon: NoteIcon, createPayload: () => ({ type: "note", title: "Neue Notiz" }) },
        { id: "workbench.orbit.palette.block.todo", title: "To-do-Liste", order: 20, legacyKey: "block:todo", icon: TodoIcon, createPayload: () => ({ type: "todo", title: "To-do-Liste" }) },
        { id: "workbench.orbit.palette.block.snippet", title: "Code-Snippet", order: 30, legacyKey: "block:snippet", icon: CodeFileIcon, createPayload: () => ({ type: "snippet", title: "Code-Snippet" }) },
        { id: "workbench.orbit.palette.block.frame", title: "Neuer Bereich", order: 40, legacyKey: "block:frame", icon: FrameIcon, createPayload: () => ({ type: "frame", title: "Neuer Bereich" }) },
        { id: "workbench.orbit.palette.block.usage-codex", title: "Codex Nutzung", order: 50, legacyKey: "block:usage-codex", icon: NutzungIcon, createPayload: () => ({ type: "usage", title: "Codex Nutzung", provider: "codex" }) },
        { id: "workbench.orbit.palette.block.usage-opencode", title: "OpenCode Nutzung", order: 60, legacyKey: "block:usage-opencode", icon: NutzungIcon, createPayload: () => ({ type: "usage", title: "OpenCode Nutzung", provider: "opencode" }) },
        { id: "workbench.orbit.palette.block.usage-claude", title: "Claude Code Nutzung", order: 70, legacyKey: "block:usage-claude", icon: NutzungIcon, createPayload: () => ({ type: "usage", title: "Claude Code Nutzung", provider: "claude" }) },
      ],
    },
    {
      ownerId: "workbench.orbit",
      group: "previews",
      registrations: [
        { id: "workbench.orbit.palette.preview.layout-1", title: "Einzel-Preview", order: 10, legacyKey: "preview:layout-1", icon: EyeIcon, createPayload: () => ({ type: "previewGroup", title: "Einzel-Preview", layout: "1" }) },
        { id: "workbench.orbit.palette.preview.layout-2", title: "2er-Gruppe", order: 20, legacyKey: "preview:layout-2", icon: EyeIcon, createPayload: () => ({ type: "previewGroup", title: "2er-Gruppe", layout: "2" }) },
        { id: "workbench.orbit.palette.preview.layout-3", title: "3er-Gruppe", order: 30, legacyKey: "preview:layout-3", icon: EyeIcon, createPayload: () => ({ type: "previewGroup", title: "3er-Gruppe", layout: "3" }) },
        { id: "workbench.orbit.palette.preview.layout-6", title: "6er-Gruppe (2×3)", order: 40, legacyKey: "preview:layout-6", icon: EyeIcon, createPayload: () => ({ type: "previewGroup", title: "6er-Gruppe (2×3)", layout: "6" }) },
      ],
    },
  ] satisfies readonly LegacyOrbitPaletteDefinition[];

export const legacyOrbitPaletteOwners: readonly LegacyOrbitPaletteDefinition[] =
  Object.freeze(legacyOrbitPaletteDefinitions);

export function registerLegacyOrbitPalette(registry: OrbitPaletteRegistry): void {
  // Alle drei Gruppen teilen denselben Owner — sie müssen als ein
  // atomarer Batch ersetzt werden, sonst überschreibt der letzte Aufruf
  // die vorherigen.
  const registrationsByOwner = new Map<string, {
    contribution: OrbitPaletteMetadata;
    runtime: OrbitPaletteRuntimeBinding;
    group: OrbitPaletteGroup;
  }[]>();
  for (const builtIn of legacyOrbitPaletteOwners) {
    const batch = registrationsByOwner.get(builtIn.ownerId) ?? [];
    for (const registration of builtIn.registrations) {
      batch.push({
        contribution: Object.freeze({
          id: contributionIdSchema.parse(registration.id),
          title: registration.title,
          order: registration.order,
        }),
        runtime: Object.freeze({
          legacyKey: registration.legacyKey,
          icon: registration.icon,
          createPayload: registration.createPayload,
        }),
        group: builtIn.group,
      });
    }
    registrationsByOwner.set(builtIn.ownerId, batch);
  }
  for (const [ownerId, registrations] of registrationsByOwner) {
    registry.replaceOwner(ownerId, registrations);
  }
}

let defaultRegistryBootstrapped = false;

export function bootstrapLegacyOrbitPalette(): OrbitPaletteRegistry {
  if (!defaultRegistryBootstrapped) {
    registerLegacyOrbitPalette(orbitPaletteRegistry);
    defaultRegistryBootstrapped = true;
  }
  return orbitPaletteRegistry;
}
