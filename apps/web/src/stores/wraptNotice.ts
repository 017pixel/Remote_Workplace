import { create } from "zustand";

/**
 * Kurze, globale Rückmeldung für Aktionen ohne eigenen Platz im Layout
 * (z. B. „Panel-Limit erreicht" beim Öffnen eines Werkzeugs außerhalb der
 * Workbench-Seite). Verschwindet nach ein paar Sekunden von selbst.
 */
interface WraptNoticeState {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

let hideTimer: number | null = null;

export const useWraptNotice = create<WraptNoticeState>()((set) => ({
  message: null,
  show: (message) => {
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    set({ message });
    hideTimer = window.setTimeout(() => set({ message: null }), 4_000);
  },
  clear: () => {
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    hideTimer = null;
    set({ message: null });
  },
}));
