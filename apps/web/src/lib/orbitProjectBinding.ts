export function resolveOrbitProjectId(
  payloadProjectId: string | undefined,
  focusedProjectId: string | null | undefined,
  selectedProjectId: string | null,
  nearbyProjectId: string | null | undefined,
): string | null {
  return payloadProjectId ?? focusedProjectId ?? selectedProjectId ?? nearbyProjectId ?? null;
}
