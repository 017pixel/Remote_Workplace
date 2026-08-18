import { create } from "zustand";

/**
 * Merkt sich, welcher T3-Thread in welchem Panel gerade geöffnet ist. Die
 * T3-Route-Bridge meldet den Thread-Wechsel per postMessage; ToolPanel ordnet
 * die Meldung dem richtigen iframe zu (event.source-Vergleich). Nur Panels,
 * die sichtbar gerendert sind, melden überhaupt. Nicht persistiert.
 */
interface PanelPresenceState {
  t3Threads: Record<string, string | null>;
  opencodeSessions: Record<string, string | null>;
  setT3Thread(panelId: string, threadId: string | null): void;
  setOpenCodeSession(panelId: string, sessionId: string | null): void;
  clearPanel(panelId: string): void;
}

export const usePanelPresenceStore = create<PanelPresenceState>((set) => ({
  t3Threads: {},
  opencodeSessions: {},
  setT3Thread: (panelId, threadId) => set((current) => {
    if (current.t3Threads[panelId] === threadId) return current;
    return { t3Threads: { ...current.t3Threads, [panelId]: threadId } };
  }),
  setOpenCodeSession: (panelId, sessionId) => set((current) => {
    if (current.opencodeSessions[panelId] === sessionId) return current;
    return { opencodeSessions: { ...current.opencodeSessions, [panelId]: sessionId } };
  }),
  clearPanel: (panelId) => set((current) => {
    const t3Threads = { ...current.t3Threads };
    const opencodeSessions = { ...current.opencodeSessions };
    delete t3Threads[panelId];
    delete opencodeSessions[panelId];
    return { t3Threads, opencodeSessions };
  }),
}));
