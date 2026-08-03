export type TerminalClipboardAction = "copy" | "paste" | null;

export interface ClipboardShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function isApplePlatform(platform = globalThis.navigator?.platform ?? ""): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function terminalClipboardAction(
  event: ClipboardShortcutEvent,
  applePlatform = isApplePlatform(),
): TerminalClipboardAction {
  if (event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key !== "c" && key !== "v") return null;
  if (applePlatform) {
    if (!event.metaKey || event.ctrlKey || event.shiftKey) return null;
  } else if (!event.ctrlKey || event.metaKey || !event.shiftKey) return null;
  return key === "c" ? "copy" : "paste";
}

export function browserClipboardAction(
  event: ClipboardShortcutEvent,
  applePlatform = isApplePlatform(),
): TerminalClipboardAction {
  if (event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key !== "c" && key !== "v") return null;
  if (applePlatform) {
    if (!event.metaKey || event.ctrlKey) return null;
  } else if (!event.ctrlKey || event.metaKey) return null;
  return key === "c" ? "copy" : "paste";
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    position: "fixed",
    inset: "0 auto auto -9999px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.append(textarea);
  textarea.select();
  let copied: boolean;
  try { copied = document.execCommand("copy"); } catch { copied = false; }
  textarea.remove();
  if (selection) {
    selection.removeAllRanges();
    for (const range of ranges) selection.addRange(range);
  }
  activeElement?.focus({ preventScroll: true });
  return copied;
}

export async function writeClipboardText(text: string): Promise<void> {
  try {
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard API nicht verfügbar.");
    await globalThis.navigator.clipboard.writeText(text);
    return;
  } catch (error) {
    if (legacyCopy(text)) return;
    throw new Error("Kopieren wurde vom Browser nicht erlaubt.", { cause: error });
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function splitTerminalInput(value: string, maximumBytes = 60_000): string[] {
  if (!Number.isInteger(maximumBytes) || maximumBytes < 4) throw new Error("Ungültige Terminal-Blockgröße.");
  const chunks: string[] = [];
  let characters: string[] = [];
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > maximumBytes && characters.length) {
      chunks.push(characters.join(""));
      characters = [];
      bytes = 0;
    }
    characters.push(character);
    bytes += characterBytes;
  }
  if (characters.length) chunks.push(characters.join(""));
  return chunks;
}
