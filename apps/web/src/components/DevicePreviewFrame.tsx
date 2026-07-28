import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  findDevicePreset,
  deviceBezel,
  deviceCutout,
  deviceHasHomeIndicator,
  type DeviceOrientation,
  type DevicePresetId,
} from "../config/devicePresets";

export type PreviewRuntimeKind = "iframe" | "shared-browser";

interface DevicePreviewFrameProps {
  deviceId: DevicePresetId;
  orientation: DeviceOrientation;
  children: ReactNode;
  runtime?: PreviewRuntimeKind;
  origin?: string | null;
}

// Zeigt dauerhaft an, woher der Preview stammt: direktes iframe auf den
// lokalen Devserver oder der auf dem Server laufende Chromium.
function PreviewSourceBadge({ runtime, origin }: { runtime: PreviewRuntimeKind | undefined; origin: string | null | undefined }) {
  if (!runtime) return null;
  return (
    <span className={`device-preview-source is-${runtime}`}>
      <i aria-hidden />
      <strong>{runtime === "iframe" ? "Direkt · iframe" : "Server · Chromium"}</strong>
      {origin ? <small>{origin}</small> : null}
    </span>
  );
}

export function DevicePreviewFrame({ deviceId, orientation, children, runtime, origin }: DevicePreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const device = findDevicePreset(deviceId);
  const portraitWidth = device.width;
  const portraitHeight = device.height;
  const width = orientation === "portrait" ? portraitWidth : portraitHeight;
  const height = orientation === "portrait" ? portraitHeight : portraitWidth;
  const bezel = deviceBezel(deviceId);
  const cutout = deviceCutout(deviceId);
  const desktop = deviceId.startsWith("desktop-");
  const tablet = deviceId.startsWith("ipad-");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || width === null || height === null) return;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      const availableWidth = Math.max(1, bounds.width - 48);
      const availableHeight = Math.max(1, bounds.height - 48);
      setScale(Math.min(1, availableWidth / (width + bezel * 2), availableHeight / (height + bezel * 2)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, [bezel, height, width]);

  if (width === null || height === null) {
    return (
      <div className="preview-responsive-frame">
        {children}
        <PreviewSourceBadge runtime={runtime} origin={origin} />
      </div>
    );
  }

  return (
    <div ref={stageRef} className="device-preview-stage">
      <div
        className={`device-preview-shell ${desktop ? "is-desktop" : tablet ? "is-tablet" : "is-phone"}`}
        style={{
          width: width + bezel * 2,
          height: height + bezel * 2,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div className="device-preview-screen" style={{ width, height }}>
          {children}
          {orientation === "portrait" && cutout !== "none" ? <span className={`device-preview-cutout is-${cutout}`} aria-hidden /> : null}
          {deviceHasHomeIndicator(deviceId) ? <span className={`device-preview-home ${tablet ? "is-tablet" : ""}`} aria-hidden /> : null}
        </div>
      </div>
      <span className="device-preview-caption" aria-hidden>
        {device.label} · {width} × {height}
      </span>
      <PreviewSourceBadge runtime={runtime} origin={origin} />
    </div>
  );
}
