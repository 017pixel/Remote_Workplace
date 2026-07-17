export const devicePresets = [
  { id: "responsive", label: "Responsive", width: null, height: null },
  { id: "iphone-13", label: "iPhone 13", width: 390, height: 844 },
  { id: "iphone-14", label: "iPhone 14", width: 390, height: 844 },
  { id: "iphone-14-pro", label: "iPhone 14 Pro", width: 393, height: 852 },
  { id: "iphone-14-pro-max", label: "iPhone 14 Pro Max", width: 430, height: 932 },
  { id: "iphone-17", label: "iPhone 17", width: 402, height: 874 },
  { id: "iphone-17-pro-max", label: "iPhone 17 Pro Max", width: 440, height: 956 },
  { id: "galaxy-s25", label: "Galaxy S25", width: 360, height: 780 },
  { id: "galaxy-s25-plus", label: "Galaxy S25+", width: 384, height: 832 },
  { id: "galaxy-s25-ultra", label: "Galaxy S25 Ultra", width: 412, height: 891 },
] as const;

export type DevicePresetId = (typeof devicePresets)[number]["id"];
export type DeviceOrientation = "portrait" | "landscape";

export function findDevicePreset(id: DevicePresetId) {
  return devicePresets.find((device) => device.id === id) ?? devicePresets[0];
}
