import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import type { FilesystemEntry } from "@wrapt/contracts";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import ruby from "highlight.js/lib/languages/ruby";
import php from "highlight.js/lib/languages/php";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { apiClient } from "../../lib/apiClient";
import { previewKindOf, formatBytes, formatDate, type PreviewKind } from "../../lib/fileManager";
import { CloseIcon, DownloadIcon, FileIcon, CodeFileIcon, RefreshIcon, BookmarkIcon } from "../icons";
import { useResponsiveShell } from "../../lib/useResponsiveShell";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("dockerfile", dockerfile);

function highlightCode(code: string, language: string | null): string {
  if (!language || !hljs.getLanguage(language)) {
    const auto = hljs.highlightAuto(code, ["typescript", "javascript", "json", "css", "xml", "markdown", "bash", "python"]);
    return auto.value;
  }
  return hljs.highlight(code, { language }).value;
}

const KIND_LABELS: Record<PreviewKind, string> = {
  code: "Code",
  image: "Bild",
  video: "Video",
  audio: "Audio",
  pdf: "PDF-Dokument",
  html: "Website",
  markdown: "Markdown",
  text: "Text",
  fallback: "Datei",
};

function useLanguage(name: string): string | null {
  return useMemo(() => {
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    const map: Record<string, string> = {
      ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript",
      js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
      json: "json", jsonc: "json", css: "css", scss: "css", less: "css",
      html: "xml", htm: "xml", svg: "xml", xml: "xml",
      md: "markdown", markdown: "markdown", py: "python", sh: "bash", bash: "bash", zsh: "bash",
      sql: "sql", yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini",
      java: "java", go: "go", rs: "rust", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
      cs: "csharp", rb: "ruby", php: "php", diff: "diff", patch: "diff",
    };
    if (name.toLowerCase() === "dockerfile") return "dockerfile";
    return map[extension] ?? null;
  }, [name]);
}

export function FilePreview({ entry }: { entry: FilesystemEntry }) {
  const kind = previewKindOf(entry);
  const mediaUrl = apiClient.fileManagerMediaUrl(entry.path);
  const preview = useQuery({
    queryKey: ["filesystem", "preview", entry.path],
    queryFn: ({ signal }) => apiClient.fileManagerPreview(entry.path, signal),
    enabled: kind === "code" || kind === "markdown" || kind === "text",
    staleTime: 60_000,
  });
  const language = useLanguage(entry.name);

  if (kind === "code" || kind === "text") {
    if (preview.isLoading) return <div className="file-preview-loading"><span /><span /><span /><span /></div>;
    if (preview.isError) return <div className="file-preview-error">Die Datei konnte nicht gelesen werden.</div>;
    if (!preview.data) return null;
    const highlighted = highlightCode(preview.data.text, kind === "text" ? null : language);
    const lines = highlighted.split("\n");
    return <div className="file-preview-code">
      <div className="file-preview-code-body">
        {lines.map((line, index) => <div className="file-preview-code-line" key={index}><span className="file-preview-line-number">{index + 1}</span><code dangerouslySetInnerHTML={{ __html: line === "" ? " " : line }} /></div>)}
      </div>
      {preview.data.truncated ? <div className="file-preview-truncated">Vorschau nach {formatBytes(preview.data.sizeBytes)} gekürzt. Öffne die Datei im Editor für den vollständigen Inhalt.</div> : null}
    </div>;
  }

  if (kind === "markdown") {
    if (preview.isLoading) return <div className="file-preview-loading"><span /><span /><span /><span /></div>;
    if (preview.isError) return <div className="file-preview-error">Die Datei konnte nicht gelesen werden.</div>;
    if (!preview.data) return null;
    const html = DOMPurify.sanitize(marked.parse(preview.data.text, { async: false }) as string, { ADD_ATTR: ["target"] });
    return <div className="file-preview-markdown">
      <article dangerouslySetInnerHTML={{ __html: html }} />
      {preview.data.truncated ? <div className="file-preview-truncated">Vorschau nach {formatBytes(preview.data.sizeBytes)} gekürzt.</div> : null}
    </div>;
  }

  if (kind === "image") {
    return <div className="file-preview-media"><img src={mediaUrl} alt={entry.name} loading="lazy" /></div>;
  }

  if (kind === "video") {
    return <div className="file-preview-media"><video src={mediaUrl} controls playsInline preload="metadata" /></div>;
  }

  if (kind === "audio") {
    return <div className="file-preview-media"><audio src={mediaUrl} controls preload="metadata" /></div>;
  }

  if (kind === "pdf") {
    return <iframe className="file-preview-pdf" src={mediaUrl} title={entry.name} />;
  }

  if (kind === "html") {
    return <iframe className="file-preview-html" src={mediaUrl} title={entry.name} sandbox="" />;
  }

  return <div className="file-preview-fallback">
    <span className="file-preview-fallback-icon"><FileIcon className="h-10 w-10" /></span>
    <strong>{entry.name}</strong>
    <p>Für dieses Format gibt es keine Vorschau. Lade die Datei herunter, um sie zu öffnen.</p>
  </div>;
}

interface QuickLookProps {
  open: boolean;
  entry: FilesystemEntry | null;
  isFavorite: boolean;
  onClose: () => void;
  onNavigate: (direction: 1 | -1) => void;
  onDownload: (entry: FilesystemEntry) => void;
  onOpenInEditor: (entry: FilesystemEntry) => void;
  onToggleFavorite: (path: string) => void;
}

export function QuickLook({ open, entry, isFavorite, onClose, onNavigate, onDownload, onOpenInEditor, onToggleFavorite }: QuickLookProps) {
  const responsive = useResponsiveShell();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Wischen nach unten schließt das Sheet. Der Versatz folgt dem Finger, damit
  // die Geste sichtbar ist, bevor sie greift.
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  const isSheet = responsive.isTouchShell;

  const startSheetDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!isSheet || event.pointerType === "mouse") return;
    if (event.target instanceof HTMLElement && event.target.closest("button, a, input")) return;
    dragStartRef.current = event.clientY;
  };
  const moveSheetDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (dragStartRef.current === null) return;
    setDragOffset(Math.max(0, event.clientY - dragStartRef.current));
  };
  const endSheetDrag = () => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    setDragOffset((offset) => {
      if (offset > 110) onClose();
      return 0;
    });
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); onNavigate(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); onNavigate(1); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onNavigate, open]);

  useEffect(() => {
    setReloadKey((key) => key + 1);
  }, [entry?.path]);

  if (!open || !entry) return null;
  const kind = previewKindOf(entry);
  const kindLabel = KIND_LABELS[kind];

  const panel = (
    <div
      className={isSheet ? `file-quicklook-sheet ${dragStartRef.current !== null ? "is-dragging" : ""}` : "file-quicklook-modal"}
      role="dialog"
      aria-modal="true"
      aria-label={`Vorschau von ${entry.name}`}
      style={isSheet && dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
    >
      <header
        className="file-quicklook-header"
        onPointerDown={startSheetDrag}
        onPointerMove={moveSheetDrag}
        onPointerUp={endSheetDrag}
        onPointerCancel={endSheetDrag}
      >
        <div className="file-quicklook-title min-w-0">
          <strong className="truncate">{entry.name}</strong>
          <span>{kindLabel} · {formatBytes(entry.sizeBytes)} · {formatDate(entry.modifiedAt)}</span>
        </div>
        <div className="file-quicklook-actions">
          <button type="button" className="icon-button" onClick={() => setReloadKey((key) => key + 1)} aria-label="Neu laden" title="Neu laden"><RefreshIcon className="h-4 w-4" /></button>
          <button type="button" className={`icon-button ${isFavorite ? "is-active" : ""}`} onClick={() => onToggleFavorite(entry.path)} aria-label={isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"} title={isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}><BookmarkIcon className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} /></button>
          <button type="button" className="icon-button" onClick={() => onDownload(entry)} aria-label="Herunterladen" title="Herunterladen"><DownloadIcon className="h-4 w-4" /></button>
          {kind === "code" || kind === "markdown" || kind === "text" || kind === "html" ? (
            <button type="button" className="icon-button" onClick={() => onOpenInEditor(entry)} aria-label="Im Editor öffnen" title="Im Editor öffnen"><CodeFileIcon className="h-4 w-4" /></button>
          ) : null}
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={onClose} aria-label="Vorschau schließen" title="Schließen (Esc)"><CloseIcon className="h-4 w-4" /></button>
        </div>
      </header>
      <div className="file-quicklook-body" key={`${entry.path}-${reloadKey}`}>
        <FilePreview entry={entry} />
      </div>
      <footer className="file-quicklook-footer">
        <span className="file-quicklook-path mono" title={entry.path}>{entry.path}</span>
        <span className="file-quicklook-nav-hint"><span className="kbd">←</span><span className="kbd">→</span> wechseln · <span className="kbd">Esc</span> schließen</span>
      </footer>
    </div>
  );

  return createPortal(
    <div className="file-quicklook-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {panel}
    </div>,
    document.body,
  );
}
