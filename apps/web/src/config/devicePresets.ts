export type DeviceGroup = "responsive" | "iphone" | "pixel" | "galaxy" | "nothing" | "ipad" | "desktop";
export type DeviceCutout = "none" | "notch" | "dynamic-island" | "punch-hole";

export const deviceGroupLabels: Record<DeviceGroup, string> = {
  responsive: "Responsive",
  iphone: "iPhone",
  pixel: "Google Pixel",
  galaxy: "Samsung Galaxy",
  nothing: "Nothing Phone",
  ipad: "iPad",
  desktop: "Desktop",
};

// Breite/Höhe sind CSS-Pixel im Hochformat (Viewport ohne Browser-UI).
// `cutout` bildet die Sensorzone ab: Notch bis iPhone 14 Plus und 16e,
// Dynamic Island ab iPhone 14 Pro, Punch-Hole bei Android-Geräten.
export const devicePresets = [
  { id: "responsive", label: "Responsive", width: null, height: null, group: "responsive" as const, cutout: "none" as const },

  { id: "iphone-13-mini", label: "iPhone 13 mini", width: 375, height: 812, group: "iphone" as const, cutout: "notch" as const },
  { id: "iphone-13", label: "iPhone 13", width: 390, height: 844, group: "iphone" as const, cutout: "notch" as const },
  { id: "iphone-13-pro-max", label: "iPhone 13 Pro Max", width: 428, height: 926, group: "iphone" as const, cutout: "notch" as const },
  { id: "iphone-14", label: "iPhone 14", width: 390, height: 844, group: "iphone" as const, cutout: "notch" as const },
  { id: "iphone-14-plus", label: "iPhone 14 Plus", width: 428, height: 926, group: "iphone" as const, cutout: "notch" as const },
  { id: "iphone-14-pro", label: "iPhone 14 Pro", width: 393, height: 852, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max", width: 430, height: 932, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-15", label: "iPhone 15", width: 393, height: 852, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-15-plus", label: "iPhone 15 Plus", width: 430, height: 932, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-15-pro", label: "iPhone 15 Pro", width: 393, height: 852, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-15-pro-max", label: "iPhone 15 Pro Max", width: 430, height: 932, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-16e", label: "iPhone 16e", width: 390, height: 844, group: "iphone" as const, cutout: "notch" as const },
  { id: "iphone-16", label: "iPhone 16", width: 393, height: 852, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-16-plus", label: "iPhone 16 Plus", width: 430, height: 932, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-16-pro", label: "iPhone 16 Pro", width: 402, height: 874, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-16-pro-max", label: "iPhone 16 Pro Max", width: 440, height: 956, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-17", label: "iPhone 17", width: 402, height: 874, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-air", label: "iPhone Air", width: 420, height: 912, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-17-pro", label: "iPhone 17 Pro", width: 402, height: 874, group: "iphone" as const, cutout: "dynamic-island" as const },
  { id: "iphone-17-pro-max", label: "iPhone 17 Pro Max", width: 440, height: 956, group: "iphone" as const, cutout: "dynamic-island" as const },

  { id: "pixel-8", label: "Pixel 8", width: 412, height: 915, group: "pixel" as const, cutout: "punch-hole" as const },
  { id: "pixel-8-pro", label: "Pixel 8 Pro", width: 448, height: 998, group: "pixel" as const, cutout: "punch-hole" as const },
  { id: "pixel-9", label: "Pixel 9", width: 412, height: 923, group: "pixel" as const, cutout: "punch-hole" as const },
  { id: "pixel-9-pro", label: "Pixel 9 Pro", width: 412, height: 919, group: "pixel" as const, cutout: "punch-hole" as const },

  { id: "galaxy-s20", label: "Galaxy S20", width: 360, height: 800, group: "galaxy" as const, cutout: "punch-hole" as const },
  { id: "galaxy-s22", label: "Galaxy S22", width: 360, height: 780, group: "galaxy" as const, cutout: "punch-hole" as const },
  { id: "galaxy-s24", label: "Galaxy S24", width: 360, height: 780, group: "galaxy" as const, cutout: "punch-hole" as const },
  { id: "galaxy-s25", label: "Galaxy S25", width: 360, height: 780, group: "galaxy" as const, cutout: "punch-hole" as const },
  { id: "galaxy-s25-plus", label: "Galaxy S25+", width: 384, height: 832, group: "galaxy" as const, cutout: "punch-hole" as const },
  { id: "galaxy-s25-ultra", label: "Galaxy S25 Ultra", width: 412, height: 891, group: "galaxy" as const, cutout: "punch-hole" as const },
  { id: "galaxy-s26", label: "Galaxy S26", width: 360, height: 800, group: "galaxy" as const, cutout: "punch-hole" as const },

  { id: "nothing-phone-2a", label: "Nothing Phone (2a)", width: 412, height: 915, group: "nothing" as const, cutout: "punch-hole" as const },
  { id: "nothing-phone-3a", label: "Nothing Phone (3a)", width: 412, height: 915, group: "nothing" as const, cutout: "punch-hole" as const },

  { id: "ipad-mini", label: "iPad Mini", width: 744, height: 1133, group: "ipad" as const, cutout: "none" as const },
  { id: "ipad-air", label: "iPad Air 11\"", width: 820, height: 1180, group: "ipad" as const, cutout: "none" as const },
  { id: "ipad-pro-11", label: "iPad Pro 11\"", width: 834, height: 1210, group: "ipad" as const, cutout: "none" as const },
  { id: "ipad-pro-13", label: "iPad Pro 13\"", width: 1032, height: 1376, group: "ipad" as const, cutout: "none" as const },

  { id: "desktop-1280", label: "Desktop 1280", width: 1280, height: 800, group: "desktop" as const, cutout: "none" as const },
  { id: "desktop-1440", label: "Desktop 1440", width: 1440, height: 900, group: "desktop" as const, cutout: "none" as const },
  { id: "desktop-1920", label: "Desktop 1920", width: 1920, height: 1080, group: "desktop" as const, cutout: "none" as const },
] as const;

export type DevicePresetId = (typeof devicePresets)[number]["id"];
export type DeviceOrientation = "portrait" | "landscape";

// Neue Preview-Slots starten mit iPhone-13-Maßen statt im freien Responsive-Modus.
export const defaultPreviewDeviceId: DevicePresetId = "iphone-13";

export function findDevicePreset(id: DevicePresetId) {
  return devicePresets.find((device) => device.id === id) ?? devicePresets[0];
}

export function getGroupedDevicePresets(): Array<{ group: DeviceGroup; label: string; devices: Array<(typeof devicePresets)[number]> }> {
  const groups: DeviceGroup[] = ["responsive", "iphone", "pixel", "galaxy", "nothing", "ipad", "desktop"];
  return groups.map((group) => ({
    group,
    label: deviceGroupLabels[group],
    devices: devicePresets.filter((device) => device.group === group),
  }));
}

export function deviceCutout(id: DevicePresetId): DeviceCutout {
  return findDevicePreset(id).cutout;
}

export function deviceHasHomeIndicator(id: DevicePresetId): boolean {
  return id.startsWith("iphone-") || id.startsWith("ipad-");
}

export function deviceBezel(id: DevicePresetId): number {
  if (id.startsWith("desktop-")) return 2;
  if (id.startsWith("ipad-")) return 10;
  return 8;
}
