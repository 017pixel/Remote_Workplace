// Sammelt Absturzberichte im Frontend und bereitet sie so auf, dass man sie in einem
// Rutsch kopieren und einem KI-Agenten geben kann. Bewusst ohne externe Abhängigkeit:
// ein Ringpuffer für Breadcrumbs, ein Abonnement für die Anzeige, ein Textformatierer.

export type CrashKind = "render" | "error" | "unhandledrejection";

export interface CrashReport {
  id: string;
  occurredAt: string;
  kind: CrashKind;
  message: string;
  stack: string | null;
  componentStack: string | null;
  route: string;
  breadcrumbs: string[];
}

export interface CrashEnvironment {
  appVersion: string | null;
  bootId: string | null;
  webBuildId: number | null;
  backendReachable: boolean;
}

const BREADCRUMB_LIMIT = 25;

interface Breadcrumb {
  at: string;
  message: string;
  count: number;
}

const breadcrumbs: Breadcrumb[] = [];

/**
 * Notiert einen Zwischenschritt (Seitenwechsel, API-Fehler, console.error) für den Bericht.
 * Wiederholungen werden zusammengefasst — sonst spült eine in Schleife feuernde Meldung
 * (etwa ein ResizeObserver) den gesamten nützlichen Verlauf aus dem Puffer.
 */
export function addBreadcrumb(message: string) {
  const trimmed = message.length > 500 ? `${message.slice(0, 500)}…` : message;
  const last = breadcrumbs.at(-1);
  if (last && last.message === trimmed) {
    last.count += 1;
    return;
  }
  breadcrumbs.push({ at: new Date().toISOString(), message: trimmed, count: 1 });
  if (breadcrumbs.length > BREADCRUMB_LIMIT) breadcrumbs.shift();
}

function snapshotBreadcrumbs(): string[] {
  return breadcrumbs.map(({ at, message, count }) => `${at} ${message}${count > 1 ? ` (${count}×)` : ""}`);
}

/** Nur für Tests: setzt den Ringpuffer zurück. */
export function resetBreadcrumbsForTest() {
  breadcrumbs.length = 0;
}

type Listener = (report: CrashReport | null) => void;

const listeners = new Set<Listener>();
let currentReport: CrashReport | null = null;

export function subscribeToCrash(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrentCrash(): CrashReport | null {
  return currentReport;
}

export function dismissCrash() {
  currentReport = null;
  for (const listener of listeners) listener(null);
}

// Defensiv gelesen: Ein Berichtsgenerator, der selbst am fehlenden DOM scheitert,
// verschluckt genau den Fehler, den er melden soll.
function currentRoute(): string {
  const location = globalThis.location;
  return location ? `${location.pathname}${location.search}` : "unbekannt";
}

function describe(value: unknown): { message: string; stack: string | null } {
  if (value instanceof Error) return { message: `${value.name}: ${value.message}`, stack: value.stack ?? null };
  if (typeof value === "string") return { message: value, stack: null };
  try {
    return { message: JSON.stringify(value) ?? String(value), stack: null };
  } catch {
    return { message: String(value), stack: null };
  }
}

// Meldungen, die der Browser über window.onerror schickt, obwohl nichts kaputt ist.
// Sie tragen keine verwertbare Information — ein Pop-Up dafür wäre nur Lärm, der den
// Blick auf echte Abstürze verstellt. Sie landen stattdessen im Verlauf.
const benignMessages = [
  // Laut Resize-Observer-Spezifikation harmlos: Der Browser konnte nicht alle
  // Benachrichtigungen im selben Frame zustellen und holt das im nächsten nach.
  // @xyflow/react im Orbit löst das beim Zoomen und Verschieben regelmäßig aus.
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
];

const isAbortError = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "name" in value &&
  (value as { name?: unknown }).name === "AbortError";

/**
 * Entscheidet, ob eine Meldung einen Bericht wert ist. Bewusst eng gehalten: Was hier
 * durchrutscht, sieht der Nutzer nie — die Liste darf nur nachweislich Harmloses enthalten.
 */
export function isBenignError(kind: CrashKind, error: unknown, message: string): boolean {
  if (benignMessages.some((entry) => message.includes(entry))) return true;
  // Cross-Origin-Skripte melden nur "Script error." — ohne Stack, Datei oder Zeile.
  // Daraus lässt sich kein Bericht bauen, mit dem jemand etwas anfangen kann.
  if (kind === "error" && /^Script error\.?$/.test(message.trim())) return true;
  // Abgebrochene Anfragen sind Normalbetrieb: React bricht laufende fetches beim
  // Verlassen einer Ansicht ab, das ist kein Fehlerfall.
  if (isAbortError(error)) return true;
  return false;
}

/**
 * Meldet einen Absturz. Der erste Bericht gewinnt: Folgefehler sind meistens
 * Nachbeben des ersten und würden die eigentliche Ursache aus der Anzeige drängen.
 */
export function reportCrash(input: { kind: CrashKind; error: unknown; componentStack?: string | null }) {
  if (currentReport) return;
  const { message, stack } = describe(input.error);
  if (isBenignError(input.kind, input.error, message)) {
    addBreadcrumb(`Ignoriert (harmlos): ${message}`);
    return;
  }
  currentReport = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    occurredAt: new Date().toISOString(),
    kind: input.kind,
    message,
    stack,
    componentStack: input.componentStack ?? null,
    route: currentRoute(),
    breadcrumbs: snapshotBreadcrumbs(),
  };
  for (const listener of listeners) listener(currentReport);
}

const kindLabels: Record<CrashKind, string> = {
  render: "React-Renderfehler",
  error: "Unbehandelter Fehler",
  unhandledrejection: "Nicht abgefangenes Promise",
};

/** Der kopierbare Bericht — Kontext zuerst, dann eine klare Arbeitsanweisung für den Agenten. */
export function formatCrashReport(report: CrashReport, environment: CrashEnvironment): string {
  const lines = [
    "# Crash-Report — Wrapt",
    "",
    `- Zeitpunkt: ${report.occurredAt}`,
    `- Art: ${kindLabels[report.kind]} (${report.kind})`,
    `- Route: ${report.route}`,
    `- App-Version: ${environment.appVersion ?? "unbekannt"}`,
    `- Backend erreichbar: ${environment.backendReachable ? "ja" : "nein"}`,
    `- bootId: ${environment.bootId ?? "unbekannt"}`,
    `- webBuildId: ${environment.webBuildId ?? "unbekannt"}`,
    `- User-Agent: ${globalThis.navigator?.userAgent ?? "unbekannt"}`,
    `- Viewport: ${globalThis.innerWidth ?? "?"}x${globalThis.innerHeight ?? "?"}`,
    "",
    "## Fehlermeldung",
    "",
    "```",
    report.message,
    "```",
  ];

  if (report.stack) lines.push("", "## Stacktrace", "", "```", report.stack, "```");
  if (report.componentStack) lines.push("", "## React-Komponentenbaum", "", "```", report.componentStack.trim(), "```");
  if (report.breadcrumbs.length) lines.push("", "## Verlauf vor dem Absturz", "", "```", ...report.breadcrumbs, "```");

  lines.push(
    "",
    "## Auftrag an den KI-Agenten",
    "",
    "Du arbeitest im Wrapt-Repository (pnpm-Monorepo: `apps/server` Fastify,",
    "`apps/web` React/Vite, `packages/contracts` Zod). Bitte:",
    "",
    "1. Finde anhand von Stacktrace und Komponentenbaum die auslösende Stelle im Quellcode.",
    "2. Erkläre kurz die Ursache — nicht nur das Symptom.",
    "3. Behebe die Ursache und achte auf gleichartige Stellen im Projekt.",
    "4. Prüfe mit `pnpm typecheck` (nach Schema-Änderungen zuerst",
    "   `pnpm --filter @wrapt/contracts build`) und mit `pnpm test`.",
    "5. Baue neu und starte neu: `bash scripts/restart-all.sh`.",
    "",
    "Antworte auf Deutsch.",
  );

  return lines.join("\n");
}

let installed = false;

/**
 * Hängt sich an die globalen Fehlerkanäle. Ohne das verschwinden Fehler außerhalb des
 * React-Renderings (Event-Handler, Promises) stillschweigend in der Konsole.
 */
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    // Fehlgeschlagene Bild-/Skript-Downloads sind keine Abstürze — nur notieren.
    if (event.target && event.target !== window) {
      const element = event.target as Partial<HTMLElement> & { src?: string; href?: string };
      addBreadcrumb(`Ressource nicht geladen: ${element.src ?? element.href ?? element.tagName ?? "unbekannt"}`);
      return;
    }
    reportCrash({ kind: "error", error: event.error ?? event.message });
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    reportCrash({ kind: "unhandledrejection", error: event.reason });
  });

  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    addBreadcrumb(`console.error: ${args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(" ")}`);
    originalConsoleError(...args);
  };
}
