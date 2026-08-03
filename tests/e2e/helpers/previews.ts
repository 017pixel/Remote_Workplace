/**
 * Preview-Tests brauchen eine erlaubte Tailscale-Identität. Sie kommt aus
 * `WORKBENCH_E2E_USER` beziehungsweise `WORKBENCH_DEV_TAILSCALE_USER`; ohne
 * hinterlegten Benutzer überspringen sich die Tests, statt an `401` zu scheitern.
 */
const identity = process.env.WORKBENCH_E2E_USER ?? process.env.WORKBENCH_DEV_TAILSCALE_USER ?? "";

export const previewsEnabled = identity.length > 0;

export const previewsReason =
  "Setze WORKBENCH_E2E_USER auf eine in `tailscale.allowedUsers` erlaubte Adresse.";

export const previewIdentity: Record<string, string> = {
  "tailscale-user-login": identity,
  // Mutierende Endpunkte verlangen eine gültige Same-Origin-Anfrage.
  origin: process.env.WORKBENCH_E2E_URL?.replace(/\/workbench$/, "") ?? "http://127.0.0.1:3010",
};
