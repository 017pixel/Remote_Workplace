export * from "./WorkbenchIcons";

// Explicit product exports override the legacy colorful glyphs while keeping
// all utility/action icons source-compatible. New product/navigation icons
// should be added to ProductIcons instead of introducing vendor-colored SVGs.
export {
  RemoteWorkbenchIcon,
  DashboardIcon,
  WorkbenchIcon,
  TechTldrsIcon,
  ProjekteIcon,
  TerminalIcon,
  PreviewsIcon,
  GalerieIcon,
  FinderIcon,
  SkillsIcon,
  BrowserIcon,
  NutzungIcon,
  EinstellungenIcon,
  T3CodeIcon,
  HermesIcon,
  CodeServerIcon,
  OpenCodeIcon,
  CodexIcon,
  ClaudeCodeIcon,
  ExtensionsIcon,
} from "./ProductIcons";
