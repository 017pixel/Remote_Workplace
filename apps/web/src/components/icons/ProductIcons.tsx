import type { SVGProps } from "react";

export type ProductIconProps = SVGProps<SVGSVGElement>;

type IconShellProps = ProductIconProps & { children: React.ReactNode };

function IconShell({ children, className, ...props }: IconShellProps) {
  const labelled = Boolean(props["aria-label"]);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      shapeRendering="geometricPrecision"
      className={["app-icon", "product-icon", className].filter(Boolean).join(" ")}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function RemoteWorkbenchIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9.5 9.5 12 7 14.5M12 14.5h5M8 21h8M12 18v3"/></IconShell>;
}

export function DashboardIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="4" rx="1.5"/><rect x="14" y="11" width="7" height="10" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></IconShell>;
}

export function WorkbenchIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M7 8.5 9.5 11 7 13.5M12 13.5h5M9 21h6M12 17v4"/></IconShell>;
}

export function TechTldrsIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z"/><path d="M8 8h7M8 12h7M8 16h4M18 8h2v10a2 2 0 0 1-2 2"/></IconShell>;
}

export function ProjekteIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="m9 11-2 2 2 2M15 11l2 2-2 2M13 10l-2 6"/></IconShell>;
}

export function TerminalIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12.5 15H17"/></IconShell>;
}

export function PreviewsIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 8h18M8 21h8M12 18v3"/></IconShell>;
}

export function GalerieIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="m6.5 17 3.5-4 2.5 2.5 2.5-3 2.5 4.5M8.5 9.5h.01"/><path d="M7 5V3h13a1 1 0 0 1 1 1v13h-1"/></IconShell>;
}

export function FinderIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8"/><path d="M3 10h18M10 20H5a2 2 0 0 1-2-2V7"/><circle cx="16" cy="16" r="3"/><path d="m18.2 18.2 2.3 2.3"/></IconShell>;
}

export function SkillsIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H12v16h5.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/><path d="M7 8h2M15 8h2M15 12h2"/></IconShell>;
}

export function BrowserIcon(props: ProductIconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></IconShell>;
}

export function NutzungIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></IconShell>;
}

export function EinstellungenIcon(props: ProductIconProps) {
  return <IconShell {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06-2.76 2.76-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.65V21h-3.9v-.08A1.8 1.8 0 0 0 9 19.3a1.8 1.8 0 0 0-2 .36l-.06.06-2.76-2.76.06-.06a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 3 13.9H3V10h.08A1.8 1.8 0 0 0 4.7 9a1.8 1.8 0 0 0-.36-2l-.06-.06 2.76-2.76.06.06a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10.1 3H14v.08A1.8 1.8 0 0 0 15 4.7a1.8 1.8 0 0 0 2-.36l.06-.06 2.76 2.76-.06.06a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 21 10.1V14h-.08A1.8 1.8 0 0 0 19.4 15Z"/></IconShell>;
}

// Product integrations intentionally use semantic glyphs instead of vendor logos.
// Brand logos may still be shown inside integration detail screens, but the host
// navigation stays visually neutral and consistent.
export function T3CodeIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="m8 9 2 2-2 2M13 13h3"/></IconShell>;
}

export function HermesIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M8 12h.01M16 12h.01M9 16h6"/></IconShell>;
}

export function CodeServerIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></IconShell>;
}

export function OpenCodeIcon(props: ProductIconProps) {
  return <IconShell {...props}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m9 9-3 3 3 3M15 9l3 3-3 3M13 7l-2 10"/></IconShell>;
}

export function CodexIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M12 3a4 4 0 0 1 4 4 4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4-4Z"/><path d="M8 7l8 8M16 7l-8 8"/></IconShell>;
}

export function ClaudeCodeIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><circle cx="12" cy="12" r="3"/></IconShell>;
}

export function ExtensionsIcon(props: ProductIconProps) {
  return <IconShell {...props}><path d="M8 3h3v5H6V5a2 2 0 0 1 2-2ZM16 3a2 2 0 0 1 2 2v3h-5V3h3ZM18 16v3a2 2 0 0 1-2 2h-3v-5h5ZM11 16v5H8a2 2 0 0 1-2-2v-3h5ZM3 10h18v4H3z"/></IconShell>;
}
