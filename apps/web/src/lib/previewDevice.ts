import type { PreviewDevicePreference } from "@wrapt/contracts";
import { devicePresets, type DeviceOrientation, type DevicePresetId } from "../config/devicePresets";

/** Verbindlicher Fallback, wenn weder Slot noch Benutzerpräferenz etwas vorgeben. */
export const fallbackPreviewDevice: { deviceId: DevicePresetId; orientation: DeviceOrientation } = {
  deviceId: "iphone-13",
  orientation: "portrait",
};

function isKnownDevice(value: string | null | undefined): value is DevicePresetId {
  return typeof value === "string" && devicePresets.some((device) => device.id === value);
}

/**
 * Reihenfolge laut Plan: explizites Gerät des Slots, sonst Benutzerpräferenz,
 * sonst iPhone 13 im Hochformat.
 */
export function resolvePreviewDevice(
  slot: { deviceId: string | null; orientation: DeviceOrientation },
  preference: PreviewDevicePreference | null | undefined,
): { deviceId: DevicePresetId; orientation: DeviceOrientation; inherited: boolean } {
  if (isKnownDevice(slot.deviceId)) {
    return { deviceId: slot.deviceId, orientation: slot.orientation, inherited: false };
  }
  if (preference && isKnownDevice(preference.deviceId)) {
    return { deviceId: preference.deviceId, orientation: preference.orientation, inherited: true };
  }
  return { ...fallbackPreviewDevice, inherited: true };
}
