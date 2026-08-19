import type { ComponentType } from "react";
import type { PanelType, Project } from "@wrapt/contracts";
import {
  BrowserIcon,
  CodeServerIcon,
  CodexIcon,
  FinderIcon,
  OpenCodeIcon,
  PreviewsIcon,
  T3CodeIcon,
  TerminalIcon,
} from "../components/icons";

export type ProjectToolType = Exclude<PanelType, "notion" | "preview"> | "preview";

export interface ProjectToolOption {
  id: string;
  label: string;
  type: ProjectToolType;
  icon: ComponentType<{ className?: string }>;
  previewId?: string;
}

export function projectToolOptions(project: Project): ProjectToolOption[] {
  const options: ProjectToolOption[] = [];

  if (project.links.t3Code !== null) {
    options.push({ id: "t3-code", label: "T3 Code", type: "t3-code", icon: T3CodeIcon });
  }
  if (project.links.codeServer !== null) {
    options.push({ id: "code-server", label: "Editor", type: "code-server", icon: CodeServerIcon });
  }

  options.push(
    { id: "preview-runtime", label: "Projektlaufzeit", type: "preview", icon: PreviewsIcon },
    { id: "terminal", label: "Terminal", type: "terminal", icon: TerminalIcon },
    { id: "opencode", label: "OpenCode", type: "opencode", icon: OpenCodeIcon },
    { id: "codex", label: "Codex", type: "codex", icon: CodexIcon },
    { id: "browser", label: "Browser", type: "browser", icon: BrowserIcon },
    { id: "files", label: "Dateien", type: "files", icon: FinderIcon },
  );

  for (const preview of project.previews) {
    options.push({
      id: `preview:${preview.id}`,
      label: preview.name,
      type: "preview",
      icon: PreviewsIcon,
      previewId: preview.id,
    });
  }

  return options;
}
