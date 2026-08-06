import type { PreviewExternalOpenMode } from "@workbench/contracts";

export interface PreviewLiveWindowInput {
  projectId: string;
  port: number;
  path?: string;
  title?: string;
  mode: PreviewExternalOpenMode;
}

export function previewLiveWindowUrl(input: Omit<PreviewLiveWindowInput, "mode">, origin = window.location.origin): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const url = new URL(`${base}/previews/live`, origin);
  url.searchParams.set("project", input.projectId);
  url.searchParams.set("port", String(input.port));
  url.searchParams.set("path", input.path?.startsWith("/") ? input.path : "/");
  if (input.title) url.searchParams.set("title", input.title);
  return url.toString();
}

export function openPreviewLiveWindow(input: PreviewLiveWindowInput): Window | null {
  const url = previewLiveWindowUrl(input);
  if (input.mode === "tab") return window.open(url, "_blank", "noopener,noreferrer");
  const width = Math.max(640, Math.round(window.screen.availWidth || 1_280));
  const height = Math.max(480, Math.round(window.screen.availHeight || 800));
  const name = `workbench-preview-${input.projectId}-${Date.now()}`;
  const opened = window.open(url, name, `popup=yes,noopener=yes,noreferrer=yes,width=${width},height=${height},left=0,top=0`);
  return opened ?? window.open(url, "_blank", "noopener,noreferrer");
}

export function openPreviewWindow(url: string, projectId: string): Window | null {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;
  const width = Math.max(640, Math.round(window.screen.availWidth || 1_280));
  const height = Math.max(480, Math.round(window.screen.availHeight || 800));
  const name = `preview-${projectId}-${Date.now()}`;
  const opened = window.open(target.toString(), name, `popup=yes,width=${width},height=${height},left=0,top=0`);
  if (opened) opened.opener = null;
  return opened;
}
