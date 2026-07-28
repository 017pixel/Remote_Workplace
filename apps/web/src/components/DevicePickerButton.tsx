import { useEffect, useRef, useState } from "react";
import { Check, Smartphone } from "lucide-react";
import { findDevicePreset, getGroupedDevicePresets, type DevicePresetId } from "../config/devicePresets";

export function DevicePickerButton({
  deviceId,
  onChange,
  className = "panel-device-picker",
  menuClassName = "panel-device-menu",
}: {
  deviceId: DevicePresetId;
  onChange: (id: DevicePresetId) => void;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="panel-device-picker-wrapper" ref={wrapperRef}>
      <button type="button" className={className} title="Geräteansicht wählen" aria-label="Geräteansicht wählen" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Smartphone className="h-4 w-4" aria-hidden />
        <span>{findDevicePreset(deviceId).label}</span>
      </button>
      {open ? (
        <div className={menuClassName} role="menu" aria-label="Geräteauswahl">
          {getGroupedDevicePresets().map((group) => (
            <div className="panel-device-group" key={group.group}>
              <span className="panel-device-group-label">{group.label}</span>
              {group.devices.map((device) => (
                <button type="button" key={device.id} role="menuitem" className={`panel-device-option ${device.id === deviceId ? "is-active" : ""}`} onClick={() => { onChange(device.id); setOpen(false); }}>
                  <span>{device.label}</span>
                  {device.id === deviceId ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
