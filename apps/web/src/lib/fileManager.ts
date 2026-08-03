import type { FilesystemEntry } from "@workbench/contracts";

export type PreviewKind =
  | "code"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "html"
  | "markdown"
  | "text"
  | "fallback";

const CODE_EXTENSIONS = new Set([
  "ts", "mts", "cts", "tsx", "js", "mjs", "cjs", "jsx", "json", "jsonc", "css", "scss", "less",
  "html", "htm", "xml", "svg", "yaml", "yml", "toml", "ini", "env", "gitignore", "dockerignore",
  "npmrc", "py", "sh", "bash", "zsh", "sql", "java", "go", "rs", "c", "h", "cpp", "hpp", "cs",
  "rb", "php", "swift", "kt", "kts", "diff", "patch", "log", "csv", "txt", "conf",
]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "avi"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "oga", "flac", "m4a", "opus"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);

export function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function previewKindOf(entry: Pick<FilesystemEntry, "name">): PreviewKind {
  const extension = extensionOf(entry.name);
  const lower = entry.name.toLowerCase();
  if (extension === "md" || extension === "markdown") return "markdown";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (AUDIO_EXTENSIONS.has(extension)) return "audio";
  if (extension === "pdf") return "pdf";
  if (HTML_EXTENSIONS.has(extension)) return "html";
  if (CODE_EXTENSIONS.has(extension) || lower === "dockerfile" || lower === "makefile") return "code";
  return "fallback";
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " · " + date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function parentPath(path: string): string {
  const end = path.lastIndexOf("/");
  return end <= 0 ? "/" : path.slice(0, end);
}

export function relativePath(root: string, path: string): string {
  if (path === root) return "";
  if (path.startsWith(`${root}/`)) return path.slice(root.length + 1);
  return path;
}

export interface BreadcrumbItem {
  label: string;
  path: string;
}

export function breadcrumbsFor(root: string, path: string): BreadcrumbItem[] {
  const result: BreadcrumbItem[] = [{ label: "Home", path: root }];
  const rest = relativePath(root, path);
  if (!rest) return result;
  let current = root;
  for (const segment of rest.split("/")) {
    current = `${current}/${segment}`;
    result.push({ label: segment, path: current });
  }
  return result;
}

export function sortEntries(entries: FilesystemEntry[], sortKey: "name" | "size" | "modified", direction: "asc" | "desc"): FilesystemEntry[] {
  const multiplier = direction === "asc" ? 1 : -1;
  const dirRank = (entry: FilesystemEntry) => entry.kind === "directory" ? 0 : 1;
  return [...entries].sort((left, right) => {
    const dirDifference = dirRank(left) - dirRank(right);
    if (dirDifference !== 0) return dirDifference;
    let result: number;
    if (sortKey === "size") {
      result = (left.sizeBytes ?? -1) - (right.sizeBytes ?? -1);
    } else if (sortKey === "modified") {
      result = (left.modifiedAt ?? "").localeCompare(right.modifiedAt ?? "");
    } else {
      result = left.name.localeCompare(right.name, "de", { sensitivity: "base", numeric: true });
    }
    return result * multiplier;
  });
}
