import ClaudeCodeColor from "@lobehub/icons/es/ClaudeCode/components/Color.js";
import CodexMono from "@lobehub/icons/es/Codex/components/Mono.js";
import OpenCodeMono from "@lobehub/icons/es/OpenCode/components/Mono.js";
import { useId, type ReactNode, type SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function IconSvg({ children, viewBox = "0 0 24 24", className, ...props }: IconProps & { children: ReactNode }) {
  const labelled = Boolean(props["aria-label"]);
  return <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision" className={["app-icon", className].filter(Boolean).join(" ")} aria-hidden={labelled ? undefined : true} focusable="false" {...props}>{children}</svg>;
}

function brandProps<T>(props: IconProps): T {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as T;
}

export function RemoteWorkbenchIcon(props: IconProps) {
  return <IconSvg {...props}><rect x="2.5" y="4" width="13.5" height="12" rx="2.4" fill="var(--icon-surface-raised, #262626)" stroke="var(--icon-blue-bright, #79a5df)" strokeWidth="1.8"/><path d="M6.25 8.25 8.5 10.5l-2.25 2.25M10.25 12.75h2.5" stroke="var(--icon-text, #e8e8e8)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M16 8.2h2.2a2 2 0 0 1 2 2v1.1M16 14.1h2.2a2 2 0 0 0 2-2v-.8" stroke="var(--icon-cyan, #4aaebd)" strokeWidth="1.7" strokeLinecap="round"/><circle cx="20.2" cy="7.1" r="1.55" fill="var(--icon-cyan, #4aaebd)"/><circle cx="20.2" cy="16.9" r="1.55" fill="var(--icon-violet, #8f6bc9)"/></IconSvg>;
}

export function T3CodeIcon(props: IconProps) {
  return <IconSvg viewBox="0 0 24 24" {...props}><image href={`${import.meta.env.BASE_URL}icons/t3-nightly.png`} width="24" height="24" preserveAspectRatio="xMidYMid meet" /></IconSvg>;
}

export function HermesIcon(props: IconProps) {
  return <IconSvg viewBox="0 0 24 24" {...props}><image href={`${import.meta.env.BASE_URL}icons/hermes-agent.png`} width="24" height="24" preserveAspectRatio="xMidYMid meet" /></IconSvg>;
}

export function CodeServerIcon(props: IconProps) {
  const maskId = useId();
  return <IconSvg viewBox="0 0 100 100" {...props}><mask id={maskId} width="100" height="100" x="0" y="0" maskUnits="userSpaceOnUse" style={{ maskType: "alpha" }}><path fill="#fff" fillRule="evenodd" d="M70.912 99.317a6.223 6.223 0 0 0 4.96-.19l20.589-9.907A6.25 6.25 0 0 0 100 83.587V16.413a6.25 6.25 0 0 0-3.54-5.632L75.874.874a6.226 6.226 0 0 0-7.104 1.21L29.355 38.04 12.187 25.01a4.162 4.162 0 0 0-5.318.236l-5.506 5.009a4.168 4.168 0 0 0-.004 6.162L16.247 50 1.36 63.583a4.168 4.168 0 0 0 .004 6.162l5.506 5.01a4.162 4.162 0 0 0 5.318.236l17.168-13.032L68.77 97.917a6.217 6.217 0 0 0 2.143 1.4ZM75.015 27.3 45.11 50l29.906 22.701V27.3Z" clipRule="evenodd" /></mask><g mask={`url(#${maskId})`}><path fill="#0065A9" d="M96.461 10.796 75.857.876a6.23 6.23 0 0 0-7.107 1.207l-67.451 61.5a4.167 4.167 0 0 0 .004 6.162l5.51 5.009a4.167 4.167 0 0 0 5.32.236l81.228-61.62c2.725-2.067 6.639-.124 6.639 3.297v-.24a6.25 6.25 0 0 0-3.539-5.63Z"/><path fill="#007ACC" d="m96.461 89.204-20.604 9.92a6.229 6.229 0 0 1-7.107-1.207l-67.451-61.5a4.167 4.167 0 0 1 .004-6.162l5.51-5.009a4.167 4.167 0 0 1 5.32-.236l81.228 61.62c2.725 2.067 6.639-.124 6.639-3.297v.24a6.25 6.25 0 0 1-3.539 5.63Z"/><path fill="#1F9CF0" d="M75.858 99.126a6.232 6.232 0 0 1-7.108-1.21c2.306 2.307 6.25.674 6.25-2.588V4.672c0-3.262-3.944-4.895-6.25-2.589a6.232 6.232 0 0 1 7.108-1.21l20.6 9.908A6.25 6.25 0 0 1 100 16.413v67.174a6.25 6.25 0 0 1-3.541 5.633l-20.601 9.906Z"/></g></IconSvg>;
}

export function OpenCodeIcon({ className, ...props }: IconProps) {
  return <OpenCodeMono className={["app-icon", className].filter(Boolean).join(" ")} {...brandProps<Parameters<typeof OpenCodeMono>[0]>(props)} />;
}

export function CodexIcon({ className, ...props }: IconProps) {
  return <CodexMono className={["app-icon", className].filter(Boolean).join(" ")} {...brandProps<Parameters<typeof CodexMono>[0]>(props)} />;
}

export function ClaudeCodeIcon({ className, ...props }: IconProps) {
  return <ClaudeCodeColor className={["app-icon", className].filter(Boolean).join(" ")} {...brandProps<Parameters<typeof ClaudeCodeColor>[0]>(props)} />;
}
