// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reclaim: vi.fn(),
  verify: vi.fn(),
  resetReport: {
    serviceWorkers: 0,
    cacheStorages: 0,
    localStorageKeys: 0,
    sessionStorageKeys: 0,
    indexedDatabases: 0,
    verifiable: true,
  } as Record<string, unknown> | null,
}));

vi.mock("./apiClient", () => {
  class ApiClientError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    ApiClientError,
    apiClient: {
      reclaimPreviewSlot: mocks.reclaim,
      verifyPreviewSlotReset: mocks.verify,
    },
  };
});

vi.mock("./previewBridgeClient", () => ({
  PreviewBridgeClient: class {
    constructor(private readonly handlers: { onStatus?: (status: { connected: boolean }) => void }) {}
    beginEpoch() {}
    attach() { queueMicrotask(() => this.handlers.onStatus?.({ connected: true })); }
    resetStorage(nonce: string) { return Promise.resolve(mocks.resetReport ? { ...mocks.resetReport, nonce } : null); }
    dispose() {}
  },
}));

import { ApiClientError } from "./apiClient";
import { withPreviewSlotRecovery } from "./previewSlotRecovery";

describe("Preview-Slot-Wiederherstellung", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetReport = {
      serviceWorkers: 0,
      cacheStorages: 0,
      localStorageKeys: 0,
      sessionStorageKeys: 0,
      indexedDatabases: 0,
      verifiable: true,
    };
    mocks.reclaim.mockResolvedValue({ slotId: 4, nonce: "nonce", resetUrl: "https://server.test:8454/reset" });
    mocks.verify.mockResolvedValue({ state: "free", message: "frei" });
  });

  it("setzt einen alten Slot zurück und wiederholt die Veröffentlichung", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ApiClientError(409, "PREVIEW_SLOTS_EXHAUSTED", "Keine Slots frei"))
      .mockResolvedValue("https://server.test:8454/");
    const phases: string[] = [];

    await expect(withPreviewSlotRecovery(operation, (phase) => phases.push(phase)))
      .resolves.toBe("https://server.test:8454/");
    expect(operation).toHaveBeenCalledTimes(2);
    expect(mocks.reclaim).toHaveBeenCalledTimes(1);
    expect(mocks.verify).toHaveBeenCalledWith(4, expect.objectContaining({ nonce: "nonce", verifiable: true }));
    expect(phases).toEqual(["launching", "resetting-slot", "retrying"]);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("bereitet für eine mehrteilige Laufzeit mehrere Slot-Origins nacheinander vor", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new ApiClientError(409, "PREVIEW_SLOTS_EXHAUSTED", "Erster Slot fehlt"))
      .mockRejectedValueOnce(new ApiClientError(409, "PREVIEW_SLOTS_EXHAUSTED", "Zweiter Slot fehlt"))
      .mockResolvedValue("bereit");

    await expect(withPreviewSlotRecovery(operation)).resolves.toBe("bereit");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(mocks.reclaim).toHaveBeenCalledTimes(2);
    expect(mocks.verify).toHaveBeenCalledTimes(2);
  });

  it("meldet einen nicht erreichbaren Browser-Reset sofort als unverifizierbar", async () => {
    mocks.resetReport = null;
    mocks.verify.mockResolvedValue({ state: "quarantined", message: "Die Origin konnte nicht geleert werden." });
    const operation = vi.fn().mockRejectedValue(new ApiClientError(409, "PREVIEW_SLOTS_EXHAUSTED", "Keine Slots frei"));

    await expect(withPreviewSlotRecovery(operation)).rejects.toThrow("Die Origin konnte nicht geleert werden.");
    expect(mocks.verify).toHaveBeenCalledWith(4, expect.objectContaining({ nonce: "nonce", verifiable: false }));
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
