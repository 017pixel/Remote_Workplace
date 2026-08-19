import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, SmartphoneIcon } from "../icons";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { resolvePreviewDevice } from "../../lib/previewDevice";
import { elementContainsEventTarget } from "../../lib/domEvents";
import { findDevicePreset, getGroupedDevicePresets, type DeviceOrientation, type DevicePresetId } from "../../config/devicePresets";

export interface PreviewDeviceMenuProps {
  /** Expliziter Wert des Slots; `null` bedeutet „Standard verwenden“. */
  deviceId: string | null;
  orientation: DeviceOrientation;
  onSlotDeviceChange: (deviceId: string | null) => void;
  className?: string;
}

/**
 * Geräteauswahl mit klarer Vererbung: Ein erbender Slot ändert die
 * Benutzerpräferenz und bleibt auf „Standard verwenden“. Erst „Für diesen Slot
 * festlegen“ schreibt einen expliziten Wert.
 */
export function PreviewDeviceMenu({ deviceId, orientation, onSlotDeviceChange, className = "" }: PreviewDeviceMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const preference = useQuery(wraptQueries.previewDevicePreference());
  const resolved = resolvePreviewDevice({ deviceId, orientation }, preference.data);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!elementContainsEventTarget(menuRef.current, event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const select = async (next: DevicePresetId) => {
    setOpen(false);
    if (deviceId === null) {
      // Der Slot erbt: die Benutzerpräferenz wandert mit, der Slot bleibt auf Standard.
      await apiClient.savePreviewDevicePreference({ deviceId: next, orientation: resolved.orientation });
      await queryClient.invalidateQueries({ queryKey: ["preview-device-preference"] });
      return;
    }
    onSlotDeviceChange(next);
  };

  return (
    <div className={`orbit-preview-device ${className}`} ref={menuRef}>
      <button type="button" onClick={() => setOpen((value) => !value)} title="Geräte-Preset wählen" aria-expanded={open}>
        <SmartphoneIcon className="h-3 w-3" />
        <span>{findDevicePreset(resolved.deviceId).label}{resolved.inherited ? " · Standard" : ""}</span>
      </button>
      {open ? (
        <div className="orbit-preview-device-menu nodrag nopan nowheel">
          <div>
            <small>Vererbung</small>
            <button type="button" className={deviceId === null ? "is-active" : ""} onClick={() => { onSlotDeviceChange(null); setOpen(false); }}>
              Standard verwenden{deviceId === null ? <CheckIcon className="h-3 w-3" /> : null}
            </button>
            <button type="button" className={deviceId !== null ? "is-active" : ""} onClick={() => { onSlotDeviceChange(resolved.deviceId); setOpen(false); }}>
              Für diesen Slot festlegen{deviceId !== null ? <CheckIcon className="h-3 w-3" /> : null}
            </button>
          </div>
          {getGroupedDevicePresets().map((group) => (
            <div key={group.group}>
              <small>{group.label}</small>
              {group.devices.map((device) => (
                <button type="button" key={device.id} className={device.id === resolved.deviceId ? "is-active" : ""} onClick={() => void select(device.id)}>
                  {device.label}{device.id === resolved.deviceId ? <CheckIcon className="h-3 w-3" /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
