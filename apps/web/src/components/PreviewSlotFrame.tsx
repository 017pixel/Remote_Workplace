import type { DeviceOrientation } from "../config/devicePresets";
import { LocalPreviewRuntime, relayCanvasPinch } from "./preview/LocalPreviewRuntime";

export { relayCanvasPinch };

/**
 * Bestandsname der lokalen Preview. Die eigentliche Laufzeit liegt in
 * `LocalPreviewRuntime`, damit Canvas, Sidebar, Vollbild und Browser-Panel
 * dieselbe Implementierung verwenden.
 */
export function PreviewSlotFrame(props: {
  targetPort: number;
  path?: string;
  requestedSlotId?: number | null;
  isolate?: boolean;
  storageProfileId?: string | null;
  previewNodeId?: string | null;
  deviceId?: string | null;
  orientation?: DeviceOrientation;
  reloadKey?: number;
  title?: string;
  lazy?: boolean;
  showControls?: boolean;
  interactionLocked?: boolean;
  onSlotAssigned?: (slotId: number, url: string) => void;
  onOrientationChange?: (orientation: DeviceOrientation) => void;
  onFocus?: () => void;
  projectId?: string | null;
  sessionKey?: string;
}) {
  return <LocalPreviewRuntime {...props} />;
}
