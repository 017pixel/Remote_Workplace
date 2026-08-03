import { describe, expect, it } from "vitest";
import { resolvePreviewDevice } from "./previewDevice";

describe("Gerätepräferenz", () => {
  it("bevorzugt das explizite Gerät des Slots", () => {
    const resolved = resolvePreviewDevice({ deviceId: "pixel-9", orientation: "landscape" }, { deviceId: "iphone-15", orientation: "portrait", updatedAt: null });
    expect(resolved).toEqual({ deviceId: "pixel-9", orientation: "landscape", inherited: false });
  });

  it("erbt die Benutzerpräferenz, wenn der Slot keinen Wert hat", () => {
    const resolved = resolvePreviewDevice({ deviceId: null, orientation: "portrait" }, { deviceId: "ipad-air", orientation: "landscape", updatedAt: null });
    expect(resolved).toEqual({ deviceId: "ipad-air", orientation: "landscape", inherited: true });
  });

  it("fällt ohne Präferenz auf iPhone 13 im Hochformat zurück", () => {
    expect(resolvePreviewDevice({ deviceId: null, orientation: "landscape" }, null))
      .toEqual({ deviceId: "iphone-13", orientation: "portrait", inherited: true });
  });

  it("ignoriert unbekannte Geräte-IDs auf beiden Ebenen", () => {
    expect(resolvePreviewDevice({ deviceId: "nokia-3310", orientation: "portrait" }, { deviceId: "auch-unbekannt", orientation: "portrait", updatedAt: null }).deviceId)
      .toBe("iphone-13");
  });

  it("behält ausdrücklich responsive Slots", () => {
    expect(resolvePreviewDevice({ deviceId: "responsive", orientation: "portrait" }, { deviceId: "iphone-15", orientation: "portrait", updatedAt: null }))
      .toEqual({ deviceId: "responsive", orientation: "portrait", inherited: false });
  });
});
