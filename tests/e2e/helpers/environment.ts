/**
 * Basis-Adresse für End-to-End-Tests.
 *
 * Ohne `WORKBENCH_E2E_URL` läuft alles gegen die lokale Workbench auf
 * `127.0.0.1:3010` — die startet Playwright bei Bedarf selbst (siehe `webServer`
 * in `playwright.config.ts`). `WORKBENCH_E2E_URL` zeigt immer auf den reinen
 * Origin des Testservers; diese Adresse ergänzt den Basispfad `/workbench`,
 * unter dem das Frontend ausgeliefert wird.
 *
 * Manche Tests brauchen mehr als einen laufenden Server: eine Instanz mit den
 * erwarteten Projekten, eine Tailscale-Identität für PTY-Sitzungen oder
 * synchronisierte News samt API-Schlüssel. Diese Tests prüfen
 * `hasPrivateWorkbench` und überspringen sich, statt mit
 * `ERR_NAME_NOT_RESOLVED` zu scheitern und den Lauf rot zu färben.
 */
export const hasPrivateWorkbench = Boolean(process.env.WORKBENCH_E2E_URL);

export const workbenchUrl = `${(process.env.WORKBENCH_E2E_URL ?? "http://127.0.0.1:3010").replace(/\/$/, "")}/workbench`;

/** Begründung für übersprungene Tests, die eine eingerichtete Instanz voraussetzen. */
export const privateWorkbenchReason =
  "Setze WORKBENCH_E2E_URL auf eine eingerichtete Workbench (Projekte, Tailscale-Identität, Dienste).";

/**
 * Identitäts-Header für API-Zugriffe über `page.request`/`context.request`.
 * Playwright sendet `extraHTTPHeaders` nur für Browser-Requests, nicht für die
 * API-Request-Kontexte — die Server-Authentifizierung verlangt die Identität
 * aber überall, also muss sie hier explizit mitgegeben werden.
 */
export function apiIdentityHeaders(login: string): Record<string, string> {
  return { "tailscale-user-login": login };
}
