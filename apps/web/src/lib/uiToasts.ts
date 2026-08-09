export type UiToastSeverity = "info" | "success" | "warn" | "error";

export interface UiToastInput {
  title: string;
  body?: string;
  severity?: UiToastSeverity;
}

export interface UiToast extends UiToastInput {
  id: string;
}

type UiToastListener = (toast: UiToast) => void;

const listeners = new Set<UiToastListener>();

function createToastId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Kleiner Ereignis-Bus für lokale UI-Rückmeldungen (z. B. "Kopiert" im
 * Terminal). Der Host (NotificationCenter) zeigt die Toasts im selben Stapel
 * wie die Benachrichtigungen an — bewusst ohne Einstellungs- oder Quellenfilter.
 */
export function showUiToast(input: UiToastInput): void {
  const toast: UiToast = { ...input, severity: input.severity ?? "info", id: createToastId() };
  listeners.forEach((listener) => listener(toast));
}

export function subscribeUiToasts(listener: UiToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
