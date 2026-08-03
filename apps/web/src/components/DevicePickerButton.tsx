import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, SmartphoneIcon } from "./icons";
import { findDevicePreset, getGroupedDevicePresets, type DevicePresetId } from "../config/devicePresets";
import { useAnchoredOverlay } from "../lib/useAnchoredOverlay";
import { elementContainsEventTarget } from "../lib/domEvents";

export function DevicePickerButton({
  deviceId,
  onChange,
  className = "panel-device-picker",
  menuClassName = "panel-device-menu",
  iconOnly = false,
}: {
  deviceId: DevicePresetId;
  onChange: (id: DevicePresetId) => void;
  className?: string;
  menuClassName?: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStyle = useAnchoredOverlay(open, triggerRef, { width: 260, gap: 4 });
  const preset = findDevicePreset(deviceId);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: PointerEvent) => {
      if (!elementContainsEventTarget(wrapperRef.current, event.target) && !elementContainsEventTarget(menuRef.current, event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onClick);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", onClick);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="panel-device-picker-wrapper" ref={wrapperRef}>
      <button ref={triggerRef} type="button" className={`${className} ${iconOnly ? "is-icon-only" : ""}`} title={`Geräteansicht wählen: ${preset.label}`} aria-label={`Geräteansicht wählen, aktuell ${preset.label}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <SmartphoneIcon className="h-4 w-4" aria-hidden />
        {!iconOnly ? <span>{preset.label}</span> : null}
      </button>
      {open ? createPortal(
        <div ref={menuRef} className={`${menuClassName} is-portal`} style={menuStyle} role="menu" aria-label="Geräteauswahl">
          {getGroupedDevicePresets().map((group) => (
            <div className="panel-device-group" key={group.group}>
              <span className="panel-device-group-label">{group.label}</span>
              {group.devices.map((device) => (
                <button type="button" key={device.id} role="menuitem" className={`panel-device-option ${device.id === deviceId ? "is-active" : ""}`} onClick={() => { onChange(device.id); setOpen(false); }}>
                  <span>{device.label}</span>
                  {device.id === deviceId ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
