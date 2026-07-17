import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  findDevicePreset,
  type DeviceOrientation,
  type DevicePresetId,
} from "../config/devicePresets";

interface DevicePreviewFrameProps {
  deviceId: DevicePresetId;
  orientation: DeviceOrientation;
  children: ReactNode;
}

export function DevicePreviewFrame({ deviceId, orientation, children }: DevicePreviewFrameProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const device = findDevicePreset(deviceId);
  const portraitWidth = device.width;
  const portraitHeight = device.height;
  const width = orientation === "portrait" ? portraitWidth : portraitHeight;
  const height = orientation === "portrait" ? portraitHeight : portraitWidth;
  const bezel = 8;

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
  }, [height, width]);

  if (width === null || height === null) {
    return <div className="preview-responsive-frame">{children}</div>;
  }

  return (
    <div ref={stageRef} className="device-preview-stage">
      <div
        className="device-preview-shell"
        style={{
          width: width + bezel * 2,
          height: height + bezel * 2,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div className="device-preview-screen" style={{ width, height }}>{children}</div>
      </div>
      <span className="device-preview-caption" aria-hidden>
        {device.label} · {width} × {height}
      </span>
    </div>
  );
}
