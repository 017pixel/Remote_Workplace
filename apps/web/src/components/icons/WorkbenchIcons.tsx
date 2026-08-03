import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color.js";
import { createElement, type ReactNode, type SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;
type GlyphNode = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

function IconSvg({ children, viewBox = "0 0 24 24", className, ...props }: IconProps & { children: ReactNode }) {
  const labelled = Boolean(props["aria-label"]);
  return <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision" className={["app-icon", className].filter(Boolean).join(" ")} aria-hidden={labelled ? undefined : true} focusable="false" {...props}>{children}</svg>;
}

function GlyphIcon({ nodes, accent, style, ...props }: IconProps & { nodes: GlyphNode; accent: string }) {
  return <IconSvg stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ color: accent, ...style }} {...props}>{nodes.map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}</IconSvg>;
}

export function RemoteWorkbenchIcon(props: IconProps) { return <IconSvg {...props}><rect x="2.5" y="4" width="13.5" height="12" rx="2.4" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.8"/><path d="M6.25 8.25 8.5 10.5l-2.25 2.25M10.25 12.75h2.5" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 8.2h2.2a2 2 0 0 1 2 2v1.1M16 14.1h2.2a2 2 0 0 0 2-2v-.8" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.7" strokeLinecap="round"/><circle cx="20.2" cy="7.1" r="1.55" fill="var(--icon-cyan, #4aaebd)"/><circle cx="20.2" cy="16.9" r="1.55" fill="var(--icon-violet, #8f6bc9)"/></IconSvg>; }
export function DashboardIcon(props: IconProps) { return <IconSvg {...props}><rect x="3" y="3" width="7.4" height="7.4" rx="2" fill="var(--icon-orange, #d08b36)"/><rect x="13.6" y="3" width="7.4" height="4.7" rx="1.7" fill="var(--icon-red, #cf7478)"/><rect x="13.6" y="10.9" width="7.4" height="10.1" rx="2" fill="var(--icon-violet, #8f6bc9)"/><rect x="3" y="13.6" width="7.4" height="7.4" rx="2" fill="var(--icon-blue-bright, #79a5df)"/></IconSvg>; }
export function WorkbenchIcon(props: IconProps) { return <IconSvg {...props}><rect x="2.75" y="3.5" width="18.5" height="13" rx="2.6" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-violet, #8f6bc9)" strokeWidth="1.7"/><path d="M6.2 8.1 8.4 10l-2.2 1.9M10.2 12h3.2" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"/><path d="M8.4 20.2h7.2M10.2 16.6v3.6M13.8 16.6v3.6" stroke="var(--icon-magenta, #a77acb)" strokeWidth="1.7" strokeLinecap="round"/></IconSvg>; }
export function TechTldrsIcon(props: IconProps) { return <IconSvg {...props}><path d="M5 3.25h10.7A2.3 2.3 0 0 1 18 5.55v14.2H7.3A2.3 2.3 0 0 1 5 17.45V3.25Z" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.7"/><path d="M8.2 8h6.4M8.2 11.3h5.2M8.2 14.6h3.8" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.45" strokeLinecap="round"/><path d="m18.6 2.8.55 1.55 1.55.55-1.55.55-.55 1.55-.55-1.55-1.55-.55 1.55-.55.55-1.55Z" fill="var(--icon-yellow, #d4a940)"/></IconSvg>; }
export function ProjekteIcon(props: IconProps) { return <IconSvg {...props}><path d="M2.75 6.4A2.4 2.4 0 0 1 5.15 4h4.3l2.1 2.25h7.3a2.4 2.4 0 0 1 2.4 2.4v9.95a2.4 2.4 0 0 1-2.4 2.4H5.15a2.4 2.4 0 0 1-2.4-2.4V6.4Z" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.7"/><path d="m9.25 11.2-2.1 2 2.1 2M14.75 11.2l2.1 2-2.1 2M12.9 10.5l-1.8 5.4" stroke="var(--icon-green, #4bb38b)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></IconSvg>; }
export function TerminalIcon(props: IconProps) { return <IconSvg {...props}><rect x="2.5" y="4" width="19" height="16" rx="3" fill="var(--icon-surface, #171717)" stroke="var(--icon-line, #525252)" strokeWidth="1.6"/><circle cx="6" cy="7.2" r=".7" fill="var(--icon-red, #cf7478)"/><circle cx="8.4" cy="7.2" r=".7" fill="var(--icon-yellow, #d4a940)"/><circle cx="10.8" cy="7.2" r=".7" fill="var(--icon-green, #4bb38b)"/><path d="m6 11 3 2.5-3 2.5M11.5 16h5.5" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></IconSvg>; }
export function PreviewsIcon(props: IconProps) { return <IconSvg {...props}><rect x="2.5" y="3.5" width="19" height="17" rx="3" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-green, #4bb38b)" strokeWidth="1.7"/><path d="M2.9 8h18.2" stroke="var(--icon-green, #4bb38b)" strokeWidth="1.5"/><path d="M6.4 14s2.15-3.1 5.6-3.1 5.6 3.1 5.6 3.1-2.15 3.1-5.6 3.1S6.4 14 6.4 14Z" fill="var(--icon-green, #4bb38b)" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.25"/><circle cx="12" cy="14" r="1.55" fill="var(--icon-text, #e8e8e8)"/></IconSvg>; }
export function GalerieIcon(props: IconProps) { return <IconSvg {...props}><rect x="5.2" y="3" width="15.3" height="14.2" rx="2.3" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-green, #4bb38b)" strokeWidth="1.6"/><rect x="2.8" y="6.8" width="15.3" height="14.2" rx="2.3" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-green, #4bb38b)" strokeWidth="1.7"/><circle cx="7.1" cy="11.1" r="1.45" fill="var(--icon-magenta, #a77acb)"/><path d="m4.9 18 3.3-3.5 2.4 2.25 2.3-2.75 3.15 4H4.9Z" fill="var(--icon-text, #e8e8e8)"/></IconSvg>; }
export function FinderIcon(props: IconProps) { return <IconSvg {...props}><rect x="3.5" y="3.5" width="17" height="13" rx="2.6" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.7"/><path d="M3.5 8h17" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.4"/><path d="M9.6 18.6h4.8M11.2 16.5v2.1" stroke="var(--icon-magenta, #a77acb)" strokeWidth="1.7" strokeLinecap="round"/><circle cx="17.2" cy="12.4" r="3.1" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.6"/><path d="m19.6 14.8 1.9 1.9" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.6" strokeLinecap="round"/></IconSvg>; }
/* KI-Skills: aufgeschlagenes Regelbuch mit Zahnrad — Wissen plus Werkzeug. */
export function SkillsIcon(props: IconProps) { return <IconSvg {...props}><path d="M3 5.4A1.9 1.9 0 0 1 4.9 3.5h5.2A1.9 1.9 0 0 1 12 5.4v13.2a1.6 1.6 0 0 0-1.6-1.35H3V5.4Z" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-violet, #8f6bc9)" strokeWidth="1.6"/><path d="M21 5.4a1.9 1.9 0 0 0-1.9-1.9h-5.2A1.9 1.9 0 0 0 12 5.4v13.2a1.6 1.6 0 0 1 1.6-1.35H21V5.4Z" fill="var(--icon-surface, #171717)" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.6"/><path d="M5.8 7.6h3.4M5.8 10.6h3.4" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.4" strokeLinecap="round"/><circle cx="17.2" cy="10.5" r="2.35" fill="var(--icon-cyan, #4aaebd)"/><circle cx="17.2" cy="10.5" r=".85" fill="var(--icon-surface, #171717)"/><path d="M17.2 6.5v1.2M17.2 13.3v1.2M13.2 10.5h1.2M20 10.5h1.2M14.4 7.7l.85.85M19.15 12.45l.85.85M20 7.7l-.85.85M14.4 13.3l.85-.85" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.5" strokeLinecap="round"/></IconSvg>; }
export function BrowserIcon(props: IconProps) { return <IconSvg {...props}><rect x="2.5" y="3" width="19" height="18" rx="3" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.7"/><path d="M2.9 8.1h18.2" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.5"/><circle cx="12.5" cy="14.35" r="4.25" fill="var(--icon-yellow, #d4a940)" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.2"/><path d="M8.4 14.35h8.2M12.5 10.1c1.2 1.15 1.8 2.55 1.8 4.25s-.6 3.1-1.8 4.25c-1.2-1.15-1.8-2.55-1.8-4.25s.6-3.1 1.8-4.25Z" stroke="var(--icon-blue, #4f7fd3)" strokeWidth="1.05"/></IconSvg>; }
export function NutzungIcon(props: IconProps) { return <IconSvg {...props}><circle cx="10" cy="12" r="6.5" stroke="var(--icon-surface, #171717)" strokeWidth="3.4"/><path d="M10 5.5a6.5 6.5 0 0 1 5.85 3.65M16.25 13.8A6.5 6.5 0 0 1 11 18.4" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="3.4" strokeLinecap="round"/><path d="M7.1 17.8A6.5 6.5 0 0 1 4 12" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="3.4" strokeLinecap="round"/><rect x="18.1" y="7.2" width="2.2" height="9.6" rx="1.1" fill="var(--icon-line, #525252)"/><rect x="18.1" y="11.3" width="2.2" height="5.5" rx="1.1" fill="var(--icon-green, #4bb38b)"/></IconSvg>; }
export function EinstellungenIcon(props: IconProps) { return <IconSvg {...props}><circle cx="12" cy="12" r="6.2" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.7"/><circle cx="12" cy="12" r="2.35" fill="var(--icon-cyan, #4aaebd)"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4" stroke="var(--icon-muted, #737373)" strokeWidth="1.8" strokeLinecap="round"/></IconSvg>; }

export function T3CodeIcon(props: IconProps) {
  return (
    <IconSvg {...props}>
      <text
        x="2.5"
        y="17"
        fontFamily="ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,sans-serif"
        fontWeight="800"
        fontSize="14"
        fill="var(--icon-blue-bright, #79a5df)"
        letterSpacing="-0.5"
      >
        T3
      </text>
    </IconSvg>
  );
}

/**
 * Offizielles Hermes-Agent-Markenzeichen, MIT © 2025 Nous Research.
 *
 * Quelle: `apps/desktop/assets/icon.png` aus dem Hermes-Checkout — dasselbe
 * Icon, das die Hermes-Desktop-App und die Nous-Website verwenden. Es ist
 * bewusst das Original und keine Nachzeichnung: Rasterbild statt Linien-SVG,
 * deshalb liegt es unter `public/icons/` und wird hier nur eingebettet.
 * Die Ableitung (auf das Markenquadrat beschnitten, quadratisch, 128 px)
 * erzeugt `scripts/build-hermes-icon.mjs`.
 *
 * Warum ein `<image>` im SVG und kein `<img>`: So bleibt die Signatur
 * `IconProps` und alle Aufrufstellen können weiter `className="h-4 w-4"`
 * und die übrigen SVG-Attribute setzen wie bei jedem anderen Werkzeugicon.
 */
export function HermesIcon(props: IconProps) {
  return (
    <IconSvg viewBox="0 0 24 24" {...props}>
      <image
        href={`${import.meta.env.BASE_URL}icons/hermes-agent.png`}
        x="0"
        y="0"
        width="24"
        height="24"
        preserveAspectRatio="xMidYMid meet"
      />
    </IconSvg>
  );
}

export function CodeServerIcon(props: IconProps) {
  return (
    <IconSvg viewBox="0 0 100 100" {...props}>
      <mask id="vscode-m" width="100" height="100" x="0" y="0" maskUnits="userSpaceOnUse" style={{ maskType: "alpha" }}>
        <path fill="#fff" fillRule="evenodd" d="M70.912 99.317a6.223 6.223 0 0 0 4.96-.19l20.589-9.907A6.25 6.25 0 0 0 100 83.587V16.413a6.25 6.25 0 0 0-3.54-5.632L75.874.874a6.226 6.226 0 0 0-7.104 1.21L29.355 38.04 12.187 25.01a4.162 4.162 0 0 0-5.318.236l-5.506 5.009a4.168 4.168 0 0 0-.004 6.162L16.247 50 1.36 63.583a4.168 4.168 0 0 0 .004 6.162l5.506 5.01a4.162 4.162 0 0 0 5.318.236l17.168-13.032L68.77 97.917a6.217 6.217 0 0 0 2.143 1.4ZM75.015 27.3 45.11 50l29.906 22.701V27.3Z" clipRule="evenodd" />
      </mask>
      <g mask="url(#vscode-m)">
        <path fill="#0065A9" d="M96.461 10.796 75.857.876a6.23 6.23 0 0 0-7.107 1.207l-67.451 61.5a4.167 4.167 0 0 0 .004 6.162l5.51 5.009a4.167 4.167 0 0 0 5.32.236l81.228-61.62c2.725-2.067 6.639-.124 6.639 3.297v-.24a6.25 6.25 0 0 0-3.539-5.63Z" />
        <path fill="#007ACC" d="m96.461 89.204-20.604 9.92a6.229 6.229 0 0 1-7.107-1.207l-67.451-61.5a4.167 4.167 0 0 1 .004-6.162l5.51-5.009a4.167 4.167 0 0 1 5.32-.236l81.228 61.62c2.725 2.067 6.639.124 6.639-3.297v.24a6.25 6.25 0 0 1-3.539 5.63Z" />
        <path fill="#1F9CF0" d="M75.858 99.126a6.232 6.232 0 0 1-7.108-1.21c2.306 2.307 6.25.674 6.25-2.588V4.672c0-3.262-3.944-4.895-6.25-2.589a6.232 6.232 0 0 1 7.108-1.21l20.6 9.908A6.25 6.25 0 0 1 100 16.413v67.174a6.25 6.25 0 0 1-3.541 5.633l-20.601 9.906Z" />
      </g>
    </IconSvg>
  );
}

export function OpenCodeIcon(props: IconProps) {
  return (
    <IconSvg viewBox="0 0 240 300" {...props}>
      <path d="M180 240H60V120H180V240Z" fill="var(--icon-line, #525252)" />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="var(--icon-text, #e8e8e8)" />
    </IconSvg>
  );
}

export function CodexIcon(props: IconProps) {
  return (
    <IconSvg viewBox="0 0 100 100" {...props}>
      <path
        d="M83.7733 42.8087C84.6678 40.1149 84.9771 37.2613 84.6807 34.4385C84.3843 31.6156 83.489 28.8885 82.0544 26.4394C77.6908 18.8436 68.9203 14.9365 60.3548 16.7725C57.9831 14.1344 54.9591 12.1668 51.5864 11.0673C48.2137 9.96772 44.611 9.77498 41.1402 10.5084C37.6694 11.2418 34.4527 12.8755 31.8132 15.2455C29.1736 17.6155 27.204 20.6383 26.1024 24.0103C23.3212 24.5806 20.6938 25.738 18.3958 27.405C16.0977 29.0721 14.1819 31.2104 12.7765 33.6772C8.36538 41.2609 9.3669 50.8267 15.2527 57.3327C14.3549 60.0251 14.0424 62.8782 14.3361 65.7012C14.6298 68.5241 15.523 71.2518 16.9558 73.7017C21.325 81.3002 30.1011 85.207 38.6712 83.3686C40.5554 85.4904 42.8707 87.1858 45.4623 88.3416C48.0539 89.4975 50.8622 90.0871 53.6999 90.0713C62.4793 90.079 70.2575 84.4114 72.9393 76.0515C75.7201 75.4802 78.347 74.3225 80.6449 72.6555C82.9427 70.9886 84.8587 68.8507 86.2649 66.3846C90.6227 58.8145 89.6172 49.3005 83.7733 42.8087ZM53.6999 84.8356C50.1955 84.8411 46.801 83.6129 44.1116 81.3661L44.5848 81.098L60.5123 71.9043C60.9087 71.6718 61.2379 71.3402 61.4674 70.942C61.6969 70.5439 61.8189 70.0929 61.8215 69.6333V47.1769L68.5553 51.072C68.6225 51.1063 68.6694 51.1707 68.6814 51.2456V69.854C68.6641 78.1208 61.9667 84.8183 53.6999 84.8356ZM21.4977 71.0843C19.7402 68.0497 19.1092 64.4925 19.7156 61.0386L20.1885 61.3225L36.1321 70.5165C36.5266 70.748 36.9757 70.87 37.4331 70.87C37.8905 70.87 38.3396 70.748 38.7341 70.5165L58.21 59.2883V67.0628C58.2081 67.1031 58.1973 67.1424 58.1782 67.1779C58.1591 67.2134 58.1322 67.2441 58.0996 67.2678L41.9671 76.5722C34.798 80.7022 25.6388 78.2463 21.4977 71.0843ZM17.3026 36.3898C19.0723 33.3357 21.8655 31.0062 25.1878 29.8138V48.7376C25.1818 49.1949 25.2986 49.6453 25.5261 50.042C25.7535 50.4387 26.0833 50.7671 26.4809 50.9928L45.8622 62.1739L39.1283 66.069C39.0919 66.0883 39.0513 66.0984 39.0101 66.0984C38.9689 66.0984 38.9283 66.0883 38.8919 66.069L22.7908 56.7809C15.6359 52.6337 13.1822 43.4816 17.3026 36.3112V36.3898ZM72.624 49.2426L53.1792 37.9512L59.8976 34.0718C59.9341 34.0524 59.9747 34.0423 60.016 34.0423C60.0573 34.0423 60.0979 34.0524 60.1344 34.0718L76.2355 43.3761C78.6973 44.7966 80.7043 46.8882 82.0221 49.4065C83.3398 51.9249 83.914 54.7661 83.6775 57.5985C83.4411 60.431 82.4038 63.1377 80.6867 65.4027C78.9696 67.6677 76.6436 69.3975 73.9803 70.3901V51.466C73.9663 51.0096 73.834 50.5647 73.5962 50.1749C73.3584 49.7851 73.0234 49.4638 72.624 49.2426ZM79.3261 39.1657L78.8529 38.8815L62.9411 29.6089C62.5442 29.376 62.0924 29.2532 61.6322 29.2532C61.172 29.2532 60.7202 29.376 60.3233 29.6089L40.8629 40.8374V33.0628C40.8587 33.0233 40.8654 32.9834 40.882 32.9473C40.8987 32.9113 40.9248 32.8803 40.9575 32.8579L57.0586 23.5692C59.5263 22.1476 62.3478 21.458 65.193 21.5811C68.0382 21.7042 70.7896 22.6348 73.1253 24.2642C75.461 25.8936 77.2845 28.1543 78.3825 30.782C79.4806 33.4097 79.8077 36.2957 79.3257 39.1025V39.1657H79.3261ZM37.1888 52.9484L30.455 49.069C30.4213 49.0487 30.3925 49.0212 30.3707 48.9884C30.3488 48.9557 30.3345 48.9186 30.3286 48.8797V30.3188C30.3323 27.4714 31.1466 24.6839 32.6761 22.2822C34.2057 19.8805 36.3874 17.9639 38.9661 16.7564C41.5448 15.549 44.4139 15.1005 47.2381 15.4636C50.0622 15.8267 52.7247 16.9862 54.9141 18.8067L54.4409 19.0748L38.5134 28.2686C38.117 28.5011 37.7879 28.8327 37.5584 29.2308C37.329 29.629 37.207 30.0799 37.2045 30.5395L37.1888 52.9487V52.9484ZM40.8472 45.0632L49.5209 40.0643L58.21 45.0635V55.0615L49.5523 60.0608L40.8632 55.0615L40.8472 45.0632Z"
        fill="var(--icon-text, #e8e8e8)"
      />
    </IconSvg>
  );
}

export function ClaudeCodeIcon({ className, ...props }: IconProps) {
  const claudeProps = Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as Parameters<typeof ClaudeCodeColor>[0];
  return <ClaudeCodeColor className={["app-icon", className].filter(Boolean).join(" ")} {...claudeProps} />;
}

const activityIconNodes = [["path",{"d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]] as const;
const errorIconNodes = [["path",{"d":"M12 16h.01"}],["path",{"d":"M12 8v4"}],["path",{"d":"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"}]] as const;
const warningIconNodes = [["path",{"d":"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"}],["path",{"d":"M12 9v4"}],["path",{"d":"M12 17h.01"}]] as const;
const arrowLeftIconNodes = [["path",{"d":"m12 19-7-7 7-7"}],["path",{"d":"M19 12H5"}]] as const;
const arrowRightIconNodes = [["path",{"d":"M5 12h14"}],["path",{"d":"m12 5 7 7-7 7"}]] as const;
const uploadIconNodes = [["path",{"d":"m5 12 7-7 7 7"}],["path",{"d":"M12 19V5"}]] as const;
const bookmarkIconNodes = [["path",{"d":"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"}]] as const;
const selectBoxIconNodes = [["path",{"d":"M5 3a2 2 0 0 0-2 2"}],["path",{"d":"M19 3a2 2 0 0 1 2 2"}],["path",{"d":"M21 19a2 2 0 0 1-2 2"}],["path",{"d":"M5 21a2 2 0 0 1-2-2"}],["path",{"d":"M9 3h1"}],["path",{"d":"M9 21h1"}],["path",{"d":"M14 3h1"}],["path",{"d":"M14 21h1"}],["path",{"d":"M3 9v1"}],["path",{"d":"M21 9v1"}],["path",{"d":"M3 14v1"}],["path",{"d":"M21 14v1"}]] as const;
const servicesIconNodes = [["path",{"d":"M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z"}],["path",{"d":"m7 16.5-4.74-2.85"}],["path",{"d":"m7 16.5 5-3"}],["path",{"d":"M7 16.5v5.17"}],["path",{"d":"M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z"}],["path",{"d":"m17 16.5-5-3"}],["path",{"d":"m17 16.5 4.74-2.85"}],["path",{"d":"M17 16.5v5.17"}],["path",{"d":"M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z"}],["path",{"d":"M12 8 7.26 5.15"}],["path",{"d":"m12 8 4.74-2.85"}],["path",{"d":"M12 13.5V8"}]] as const;
const bracesIconNodes = [["path",{"d":"M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"}],["path",{"d":"M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"}]] as const;
const cameraIconNodes = [["path",{"d":"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"}],["circle",{"cx":"12","cy":"13","r":"3"}]] as const;
const checkIconNodes = [["path",{"d":"M20 6 9 17l-5-5"}]] as const;
const chevronDownIconNodes = [["path",{"d":"m6 9 6 6 6-6"}]] as const;
const chevronLeftIconNodes = [["path",{"d":"m15 18-6-6 6-6"}]] as const;
const chevronRightIconNodes = [["path",{"d":"m9 18 6-6-6-6"}]] as const;
const clipboardIconNodes = [["rect",{"width":"8","height":"4","x":"8","y":"2","rx":"1","ry":"1"}],["path",{"d":"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"}]] as const;
const clockIconNodes = [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 6v6h4"}]] as const;
const coinsIconNodes = [["path",{"d":"M13.744 17.736a6 6 0 1 1-7.48-7.48"}],["path",{"d":"M15 6h1v4"}],["path",{"d":"m6.134 14.768.866-.5 2 3.464"}],["circle",{"cx":"16","cy":"8","r":"6"}]] as const;
const columnsIconNodes = [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M12 3v18"}]] as const;
const commandIconNodes = [["path",{"d":"M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"}]] as const;
const copyIconNodes = [["rect",{"width":"14","height":"14","x":"8","y":"8","rx":"2","ry":"2"}],["path",{"d":"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"}]] as const;
const cpuIconNodes = [["path",{"d":"M12 20v2"}],["path",{"d":"M12 2v2"}],["path",{"d":"M17 20v2"}],["path",{"d":"M17 2v2"}],["path",{"d":"M2 12h2"}],["path",{"d":"M2 17h2"}],["path",{"d":"M2 7h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"M20 17h2"}],["path",{"d":"M20 7h2"}],["path",{"d":"M7 20v2"}],["path",{"d":"M7 2v2"}],["rect",{"x":"4","y":"4","width":"16","height":"16","rx":"2"}],["rect",{"x":"8","y":"8","width":"8","height":"8","rx":"1"}]] as const;
const databaseIconNodes = [["ellipse",{"cx":"12","cy":"5","rx":"9","ry":"3"}],["path",{"d":"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{"d":"M3 12A9 3 0 0 0 21 12"}]] as const;
const downloadIconNodes = [["path",{"d":"M12 15V3"}],["path",{"d":"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"}],["path",{"d":"m7 10 5 5 5-5"}]] as const;
const editIconNodes = [["path",{"d":"M13 21h8"}],["path",{"d":"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"}]] as const;
const eraserIconNodes = [["path",{"d":"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"}],["path",{"d":"m5.082 11.09 8.828 8.828"}]] as const;
const externalLinkIconNodes = [["path",{"d":"M15 3h6v6"}],["path",{"d":"M10 14 21 3"}],["path",{"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]] as const;
const eyeIconNodes = [["path",{"d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{"cx":"12","cy":"12","r":"3"}]] as const;
const eyeOffIconNodes = [["path",{"d":"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"}],["path",{"d":"M14.084 14.158a3 3 0 0 1-4.242-4.242"}],["path",{"d":"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"}],["path",{"d":"m2 2 20 20"}]] as const;
const fileIconNodes = [["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}]] as const;
const codeFileIconNodes = [["path",{"d":"M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"m5 16-3 3 3 3"}],["path",{"d":"m9 22 3-3-3-3"}]] as const;
const unknownFileIconNodes = [["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M12 17h.01"}],["path",{"d":"M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"}]] as const;
const filterIconNodes = [["path",{"d":"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"}]] as const;
const folderIconNodes = [["path",{"d":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}]] as const;
const folderCodeIconNodes = [["path",{"d":"M18 19a5 5 0 0 1-5-5v8"}],["path",{"d":"M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"}],["circle",{"cx":"13","cy":"12","r":"2"}],["circle",{"cx":"20","cy":"19","r":"2"}]] as const;
const folderOpenIconNodes = [["path",{"d":"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"}]] as const;
const folderSearchIconNodes = [["circle",{"cx":"11.5","cy":"12.5","r":"2.5"}],["path",{"d":"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"}],["path",{"d":"M13.3 14.3 15 16"}]] as const;
const folderTreeIconNodes = [["path",{"d":"M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"}],["path",{"d":"M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.92-.6H13a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"}],["path",{"d":"M3 5a2 2 0 0 0 2 2h3"}],["path",{"d":"M3 3v13a2 2 0 0 0 2 2h3"}]] as const;
const frameIconNodes = [["line",{"x1":"22","x2":"2","y1":"6","y2":"6"}],["line",{"x1":"22","x2":"2","y1":"18","y2":"18"}],["line",{"x1":"6","x2":"6","y1":"2","y2":"22"}],["line",{"x1":"18","x2":"18","y1":"2","y2":"22"}]] as const;
const gitBranchIconNodes = [["path",{"d":"M15 6a9 9 0 0 0-9 9V3"}],["circle",{"cx":"18","cy":"6","r":"3"}],["circle",{"cx":"6","cy":"18","r":"3"}]] as const;
const gridIconNodes = [["path",{"d":"M12 3v18"}],["path",{"d":"M3 12h18"}],["rect",{"x":"3","y":"3","width":"18","height":"18","rx":"2"}]] as const;
const handIconNodes = [["path",{"d":"M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"}],["path",{"d":"M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"}],["path",{"d":"M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"}],["path",{"d":"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"}]] as const;
const diskIconNodes = [["path",{"d":"M10 16h.01"}],["path",{"d":"M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}],["path",{"d":"M21.946 12.013H2.054"}],["path",{"d":"M6 16h.01"}]] as const;
const inboxIconNodes = [["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}]] as const;
const infoIconNodes = [["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]] as const;
const keyIconNodes = [["path",{"d":"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"}],["circle",{"cx":"16.5","cy":"7.5","r":".5","fill":"currentColor"}]] as const;
const layersIconNodes = [["path",{"d":"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"}],["path",{"d":"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"}],["path",{"d":"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"}]] as const;
const layoutPanelIconNodes = [["rect",{"width":"7","height":"18","x":"3","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"14","y":"3","rx":"1"}],["rect",{"width":"7","height":"7","x":"14","y":"14","rx":"1"}]] as const;
const libraryIconNodes = [["path",{"d":"m16 6 4 14"}],["path",{"d":"M12 6v14"}],["path",{"d":"M8 8v12"}],["path",{"d":"M4 4v16"}]] as const;
const linkIconNodes = [["path",{"d":"M9 17H7A5 5 0 0 1 7 7h2"}],["path",{"d":"M15 7h2a5 5 0 1 1 0 10h-2"}],["line",{"x1":"8","x2":"16","y1":"12","y2":"12"}]] as const;
const listIconNodes = [["path",{"d":"M3 5h.01"}],["path",{"d":"M3 12h.01"}],["path",{"d":"M3 19h.01"}],["path",{"d":"M8 5h13"}],["path",{"d":"M8 12h13"}],["path",{"d":"M8 19h13"}]] as const;
const todoIconNodes = [["path",{"d":"M13 5h8"}],["path",{"d":"M13 12h8"}],["path",{"d":"M13 19h8"}],["path",{"d":"m3 17 2 2 4-4"}],["rect",{"x":"3","y":"4","width":"6","height":"6","rx":"1"}]] as const;
const loaderIconNodes = [["path",{"d":"M21 12a9 9 0 1 1-6.219-8.56"}]] as const;
const locateIconNodes = [["line",{"x1":"2","x2":"5","y1":"12","y2":"12"}],["line",{"x1":"19","x2":"22","y1":"12","y2":"12"}],["line",{"x1":"12","x2":"12","y1":"2","y2":"5"}],["line",{"x1":"12","x2":"12","y1":"19","y2":"22"}],["circle",{"cx":"12","cy":"12","r":"7"}],["circle",{"cx":"12","cy":"12","r":"3"}]] as const;
const lockIconNodes = [["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4"}]] as const;
const fullscreenIconNodes = [["path",{"d":"M8 3H5a2 2 0 0 0-2 2v3"}],["path",{"d":"M21 8V5a2 2 0 0 0-2-2h-3"}],["path",{"d":"M3 16v3a2 2 0 0 0 2 2h3"}],["path",{"d":"M16 21h3a2 2 0 0 0 2-2v-3"}]] as const;
const memoryIconNodes = [["path",{"d":"M12 12v-2"}],["path",{"d":"M12 18v-2"}],["path",{"d":"M16 12v-2"}],["path",{"d":"M16 18v-2"}],["path",{"d":"M2 11h1.5"}],["path",{"d":"M20 18v-2"}],["path",{"d":"M20.5 11H22"}],["path",{"d":"M4 18v-2"}],["path",{"d":"M8 12v-2"}],["path",{"d":"M8 18v-2"}],["rect",{"x":"2","y":"6","width":"20","height":"10","rx":"2"}]] as const;
const menuIconNodes = [["path",{"d":"M4 5h16"}],["path",{"d":"M4 12h16"}],["path",{"d":"M4 19h16"}]] as const;
const restoreIconNodes = [["path",{"d":"m14 10 7-7"}],["path",{"d":"M20 10h-6V4"}],["path",{"d":"m3 21 7-7"}],["path",{"d":"M4 14h6v6"}]] as const;
const minusIconNodes = [["path",{"d":"M5 12h14"}]] as const;
const monitorOffIconNodes = [["path",{"d":"M12 17v4"}],["path",{"d":"M17 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 1.184-1.826"}],["path",{"d":"m2 2 20 20"}],["path",{"d":"M8 21h8"}],["path",{"d":"M8.656 3H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.293 1.042"}]] as const;
const deviceRotateIconNodes = [["path",{"d":"M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8"}],["path",{"d":"M10 19v-3.96 3.15"}],["path",{"d":"M7 19h5"}],["rect",{"width":"6","height":"10","x":"16","y":"12","rx":"2"}]] as const;
const moreIconNodes = [["circle",{"cx":"12","cy":"12","r":"1"}],["circle",{"cx":"19","cy":"12","r":"1"}],["circle",{"cx":"5","cy":"12","r":"1"}]] as const;
const pointerIconNodes = [["path",{"d":"M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"}]] as const;
const networkIconNodes = [["rect",{"x":"16","y":"16","width":"6","height":"6","rx":"1"}],["rect",{"x":"2","y":"16","width":"6","height":"6","rx":"1"}],["rect",{"x":"9","y":"2","width":"6","height":"6","rx":"1"}],["path",{"d":"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"}],["path",{"d":"M12 12V8"}]] as const;
const playIconNodes = [["path",{"d":"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"}]] as const;
const plusIconNodes = [["path",{"d":"M5 12h14"}],["path",{"d":"M12 5v14"}]] as const;
const powerIconNodes = [["path",{"d":"M12 2v10"}],["path",{"d":"M18.4 6.6a9 9 0 1 1-12.77.04"}]] as const;
const redoIconNodes = [["path",{"d":"m15 14 5-5-5-5"}],["path",{"d":"M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"}]] as const;
const refreshIconNodes = [["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]] as const;
const rocketIconNodes = [["path",{"d":"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"}],["path",{"d":"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"}],["path",{"d":"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"}],["path",{"d":"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"}]] as const;
const retryIconNodes = [["path",{"d":"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"}],["path",{"d":"M3 3v5h5"}]] as const;
const rowsIconNodes = [["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["path",{"d":"M3 12h18"}]] as const;
const saveIconNodes = [["path",{"d":"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"}],["path",{"d":"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"}],["path",{"d":"M7 3v4a1 1 0 0 0 1 1h7"}]] as const;
const searchIconNodes = [["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]] as const;
const sendIconNodes = [["path",{"d":"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"}],["path",{"d":"m21.854 2.147-10.94 10.939"}]] as const;
const serverIconNodes = [["rect",{"width":"20","height":"8","x":"2","y":"2","rx":"2","ry":"2"}],["rect",{"width":"20","height":"8","x":"2","y":"14","rx":"2","ry":"2"}],["line",{"x1":"6","x2":"6.01","y1":"6","y2":"6"}],["line",{"x1":"6","x2":"6.01","y1":"18","y2":"18"}]] as const;
const shieldIconNodes = [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]] as const;
const smartphoneIconNodes = [["rect",{"width":"14","height":"20","x":"5","y":"2","rx":"2","ry":"2"}],["path",{"d":"M12 18h.01"}]] as const;
const sparklesIconNodes = [["path",{"d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{"d":"M20 2v4"}],["path",{"d":"M22 4h-4"}],["circle",{"cx":"4","cy":"20","r":"2"}]] as const;
const splitIconNodes = [["path",{"d":"M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"}],["path",{"d":"M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"}],["line",{"x1":"12","x2":"12","y1":"4","y2":"20"}]] as const;
const devtoolsIconNodes = [["path",{"d":"m10 9-3 3 3 3"}],["path",{"d":"m14 15 3-3-3-3"}],["rect",{"x":"3","y":"3","width":"18","height":"18","rx":"2"}]] as const;
const noteIconNodes = [["path",{"d":"M21 9a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"}],["path",{"d":"M15 3v5a1 1 0 0 0 1 1h5"}]] as const;
const temperatureIconNodes = [["path",{"d":"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"}]] as const;
const trashIconNodes = [["path",{"d":"M10 11v6"}],["path",{"d":"M14 11v6"}],["path",{"d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"}],["path",{"d":"M3 6h18"}],["path",{"d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}]] as const;
const undoIconNodes = [["path",{"d":"M9 14 4 9l5-5"}],["path",{"d":"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"}]] as const;
const userIconNodes = [["circle",{"cx":"12","cy":"8","r":"5"}],["path",{"d":"M20 21a8 8 0 0 0-16 0"}]] as const;
const closeIconNodes = [["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]] as const;

export function ActivityIcon(props: IconProps) { return <GlyphIcon nodes={activityIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ErrorIcon(props: IconProps) { return <GlyphIcon nodes={errorIconNodes} accent="var(--icon-red, #cf7478)" {...props}/>; }
export function WarningIcon(props: IconProps) { return <GlyphIcon nodes={warningIconNodes} accent="var(--icon-yellow, #d4a940)" {...props}/>; }
export function ArrowLeftIcon(props: IconProps) { return <GlyphIcon nodes={arrowLeftIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ArrowRightIcon(props: IconProps) { return <GlyphIcon nodes={arrowRightIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function UploadIcon(props: IconProps) { return <GlyphIcon nodes={uploadIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function BookmarkIcon(props: IconProps) { return <GlyphIcon nodes={bookmarkIconNodes} accent="var(--icon-violet, #8f6bc9)" {...props}/>; }
export function SelectBoxIcon(props: IconProps) { return <GlyphIcon nodes={selectBoxIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ServicesIcon(props: IconProps) { return <GlyphIcon nodes={servicesIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function BracesIcon(props: IconProps) { return <GlyphIcon nodes={bracesIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CameraIcon(props: IconProps) { return <GlyphIcon nodes={cameraIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CheckIcon(props: IconProps) { return <GlyphIcon nodes={checkIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function ChevronDownIcon(props: IconProps) { return <GlyphIcon nodes={chevronDownIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ChevronLeftIcon(props: IconProps) { return <GlyphIcon nodes={chevronLeftIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ChevronRightIcon(props: IconProps) { return <GlyphIcon nodes={chevronRightIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ClipboardIcon(props: IconProps) { return <GlyphIcon nodes={clipboardIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ClockIcon(props: IconProps) { return <GlyphIcon nodes={clockIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CoinsIcon(props: IconProps) { return <GlyphIcon nodes={coinsIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ColumnsIcon(props: IconProps) { return <GlyphIcon nodes={columnsIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CommandIcon(props: IconProps) { return <GlyphIcon nodes={commandIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CopyIcon(props: IconProps) { return <GlyphIcon nodes={copyIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CpuIcon(props: IconProps) { return <GlyphIcon nodes={cpuIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function DatabaseIcon(props: IconProps) { return <GlyphIcon nodes={databaseIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function DownloadIcon(props: IconProps) { return <GlyphIcon nodes={downloadIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function EditIcon(props: IconProps) { return <GlyphIcon nodes={editIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function EraserIcon(props: IconProps) { return <GlyphIcon nodes={eraserIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ExternalLinkIcon(props: IconProps) { return <GlyphIcon nodes={externalLinkIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function EyeIcon(props: IconProps) { return <GlyphIcon nodes={eyeIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function EyeOffIcon(props: IconProps) { return <GlyphIcon nodes={eyeOffIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FileIcon(props: IconProps) { return <GlyphIcon nodes={fileIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CodeFileIcon(props: IconProps) { return <GlyphIcon nodes={codeFileIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function UnknownFileIcon(props: IconProps) { return <GlyphIcon nodes={unknownFileIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FilterIcon(props: IconProps) { return <GlyphIcon nodes={filterIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FolderIcon(props: IconProps) { return <GlyphIcon nodes={folderIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FolderCodeIcon(props: IconProps) { return <GlyphIcon nodes={folderCodeIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FolderOpenIcon(props: IconProps) { return <GlyphIcon nodes={folderOpenIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FolderSearchIcon(props: IconProps) { return <GlyphIcon nodes={folderSearchIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FolderTreeIcon(props: IconProps) { return <GlyphIcon nodes={folderTreeIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FrameIcon(props: IconProps) { return <GlyphIcon nodes={frameIconNodes} accent="var(--icon-violet, #8f6bc9)" {...props}/>; }
export function GitBranchIcon(props: IconProps) { return <GlyphIcon nodes={gitBranchIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function GridIcon(props: IconProps) { return <GlyphIcon nodes={gridIconNodes} accent="var(--icon-violet, #8f6bc9)" {...props}/>; }
export function HandIcon(props: IconProps) { return <GlyphIcon nodes={handIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function DiskIcon(props: IconProps) { return <GlyphIcon nodes={diskIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function InboxIcon(props: IconProps) { return <GlyphIcon nodes={inboxIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function InfoIcon(props: IconProps) { return <GlyphIcon nodes={infoIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function KeyIcon(props: IconProps) { return <GlyphIcon nodes={keyIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function LayersIcon(props: IconProps) { return <GlyphIcon nodes={layersIconNodes} accent="var(--icon-violet, #8f6bc9)" {...props}/>; }
export function LayoutPanelIcon(props: IconProps) { return <GlyphIcon nodes={layoutPanelIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function LibraryIcon(props: IconProps) { return <GlyphIcon nodes={libraryIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function LinkIcon(props: IconProps) { return <GlyphIcon nodes={linkIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ListIcon(props: IconProps) { return <GlyphIcon nodes={listIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function TodoIcon(props: IconProps) { return <GlyphIcon nodes={todoIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function LoaderIcon(props: IconProps) { return <GlyphIcon nodes={loaderIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function LocateIcon(props: IconProps) { return <GlyphIcon nodes={locateIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function LockIcon(props: IconProps) { return <GlyphIcon nodes={lockIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function FullscreenIcon(props: IconProps) { return <GlyphIcon nodes={fullscreenIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function MemoryIcon(props: IconProps) { return <GlyphIcon nodes={memoryIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function MenuIcon(props: IconProps) { return <GlyphIcon nodes={menuIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function RestoreIcon(props: IconProps) { return <GlyphIcon nodes={restoreIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function MinusIcon(props: IconProps) { return <GlyphIcon nodes={minusIconNodes} accent="var(--icon-yellow, #d4a940)" {...props}/>; }
export function MonitorOffIcon(props: IconProps) { return <GlyphIcon nodes={monitorOffIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function DeviceRotateIcon(props: IconProps) { return <GlyphIcon nodes={deviceRotateIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function MoreIcon(props: IconProps) { return <GlyphIcon nodes={moreIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function PointerIcon(props: IconProps) { return <GlyphIcon nodes={pointerIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function NetworkIcon(props: IconProps) { return <GlyphIcon nodes={networkIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function PlayIcon(props: IconProps) { return <GlyphIcon nodes={playIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function PlusIcon(props: IconProps) { return <GlyphIcon nodes={plusIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function PowerIcon(props: IconProps) { return <GlyphIcon nodes={powerIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function RedoIcon(props: IconProps) { return <GlyphIcon nodes={redoIconNodes} accent="var(--icon-violet, #8f6bc9)" {...props}/>; }
export function RefreshIcon(props: IconProps) { return <GlyphIcon nodes={refreshIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function RocketIcon(props: IconProps) { return <GlyphIcon nodes={rocketIconNodes} accent="var(--icon-yellow, #d4a940)" {...props}/>; }
export function RetryIcon(props: IconProps) { return <GlyphIcon nodes={retryIconNodes} accent="var(--icon-yellow, #d4a940)" {...props}/>; }
export function RowsIcon(props: IconProps) { return <GlyphIcon nodes={rowsIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function SaveIcon(props: IconProps) { return <GlyphIcon nodes={saveIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function SearchIcon(props: IconProps) { return <GlyphIcon nodes={searchIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function SendIcon(props: IconProps) { return <GlyphIcon nodes={sendIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function ServerIcon(props: IconProps) { return <GlyphIcon nodes={serverIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function ShieldIcon(props: IconProps) { return <GlyphIcon nodes={shieldIconNodes} accent="var(--icon-green, #4bb38b)" {...props}/>; }
export function SmartphoneIcon(props: IconProps) { return <GlyphIcon nodes={smartphoneIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function SparklesIcon(props: IconProps) { return <GlyphIcon nodes={sparklesIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function SplitIcon(props: IconProps) { return <GlyphIcon nodes={splitIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function DevtoolsIcon(props: IconProps) { return <GlyphIcon nodes={devtoolsIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function NoteIcon(props: IconProps) { return <GlyphIcon nodes={noteIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function TemperatureIcon(props: IconProps) { return <GlyphIcon nodes={temperatureIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function TrashIcon(props: IconProps) { return <GlyphIcon nodes={trashIconNodes} accent="var(--icon-red, #cf7478)" {...props}/>; }
export function UndoIcon(props: IconProps) { return <GlyphIcon nodes={undoIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function UserIcon(props: IconProps) { return <GlyphIcon nodes={userIconNodes} accent="var(--icon-blue-bright, #79a5df)" {...props}/>; }
export function CloseIcon(props: IconProps) { return <GlyphIcon nodes={closeIconNodes} accent="var(--icon-red, #cf7478)" {...props}/>; }

export const NewspaperIcon = TechTldrsIcon;
export const GalleryMediaIcon = GalerieIcon;
export const GalleryFilesIcon = FolderIcon;
export const PreviewIcon = PreviewsIcon;
export const ProjectIcon = ProjekteIcon;
export const DeviceIcon = SmartphoneIcon;
