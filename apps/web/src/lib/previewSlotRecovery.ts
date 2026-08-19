import type { PreviewSlotResetReport } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "./apiClient";
import { PreviewBridgeClient } from "./previewBridgeClient";

export type PreviewSlotRecoveryPhase = "launching" | "resetting-slot" | "retrying";

const maximumRecoveryAttempts = 12;

function unverifiableReport(nonce: string): PreviewSlotResetReport {
  return {
    nonce,
    serviceWorkers: 0,
    cacheStorages: 0,
    localStorageKeys: 0,
    sessionStorageKeys: 0,
    indexedDatabases: 0,
    verifiable: false,
  };
}

/**
 * Leert die Browserdaten auf der betroffenen Slot-Origin. Der Handshake wird
 * ausdrücklich abgewartet, damit der Reset nicht während des iframe-Ladens
 * verloren geht.
 */
export async function runPreviewSlotReset(resetUrl: string, nonce: string): Promise<PreviewSlotResetReport | null> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
  let confirmReady: (ready: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => { confirmReady = resolve; });
  const client = new PreviewBridgeClient({
    onStatus: (status) => { if (status.connected) confirmReady(true); },
  });
  document.body.append(frame);
  try {
    client.beginEpoch();
    client.attach(frame, resetUrl);
    frame.src = resetUrl;
    const connected = await Promise.race([
      ready,
      new Promise<false>((resolve) => window.setTimeout(() => resolve(false), 12_000)),
    ]);
    if (!connected) return null;
    return await client.resetStorage(nonce);
  } finally {
    client.dispose();
    frame.remove();
  }
}

async function recoverOnePreviewSlot(): Promise<void> {
  const started = await apiClient.reclaimPreviewSlot();
  if (!started) throw new Error("Der Preview-Slot konnte nicht vorbereitet werden.");
  const report = await runPreviewSlotReset(started.resetUrl, started.nonce);
  const verification = await apiClient.verifyPreviewSlotReset(started.slotId, report ?? unverifiableReport(started.nonce));
  if (!report || !verification || verification.state !== "free") {
    throw new Error(verification?.message ?? "Die Slot-Origin konnte im Browser nicht verifiziert zurückgesetzt werden.");
  }
}

/**
 * Wiederholt eine Veröffentlichung nach jedem erfolgreich zurückgesetzten Slot.
 * Mehrteilige Projektlaufzeiten können dadurch mehrere alte Origins nacheinander
 * übernehmen, ohne dass der Nutzer die Diagnoseoberfläche öffnen muss.
 */
export async function withPreviewSlotRecovery<T>(
  operation: () => Promise<T>,
  onPhase?: (phase: PreviewSlotRecoveryPhase) => void,
): Promise<T> {
  onPhase?.("launching");
  for (let attempt = 0; attempt <= maximumRecoveryAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.code !== "PREVIEW_SLOTS_EXHAUSTED" || attempt === maximumRecoveryAttempts) throw error;
      onPhase?.("resetting-slot");
      await recoverOnePreviewSlot();
      onPhase?.("retrying");
    }
  }
  throw new Error("Die Preview konnte nach der Slot-Wiederherstellung nicht veröffentlicht werden.");
}
