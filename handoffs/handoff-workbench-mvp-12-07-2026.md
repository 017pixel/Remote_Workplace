# Handoff: Benjamin Dev Workbench MVP

**Datum:** 12-07-2026  
**Erstellt von:** Backend-Agent (Codex / GPT 5.6)  
**Für:** Frontend-Agent (Design frei)

## 1. Überblick — Was wurde im Backend gebaut

Implementiert ist das vollständige read-only Brain der Benjamin Dev Workbench:

- Fastify-API mit echten Servermetriken, Tailscale-, Dienst-, Projekt- und Command-Reference-Daten.
- Gemeinsame Zod-Verträge für Server und Browser.
- Serverseitige JSON-Allowlist für Projekte, Previews und Dienste.
- Prüfung von Projektverfügbarkeit, Zugriffsrechten und Symlink-Abweichungen.
- Sichere Erzeugung der T3- und code-server-Links aus ausschließlich konfigurierten Daten.
- Einheitliches Fehlerformat ohne interne Details oder Secrets.
- TanStack-Query-Optionen für alle API-Ressourcen und deren Pollingintervalle.
- Zustand-Store für ausgewähltes Projekt, maximal zwei Panels, Layout, Größen, Fokus, Reload, Maximieren/Wiederherstellen und localStorage-Persistenz.
- Sicherer Empty-State-Fallback für ungültige gespeicherte Workspaces.
- Mobile Selektionslogik, die immer genau ein fokussiertes Werkzeug zurückgibt.
- Produktiver Web-Mount-Punkt, Vite-Build und statische Auslieferung durch Fastify.

Das visuelle Frontend wurde absichtlich nicht gestaltet. Der bestehende `App`-Mount-Punkt ist durch die vollständigen Ansichten und Komponenten zu ersetzen, ohne die API- und State-Verträge zu umgehen.

## 2. Allgemeiner App-Stil (nur Richtung, kein Detail-Design)

Die App soll ruhig, minimalistisch, technisch und hochwertig wirken. Desktop ist eine kompakte Entwickler-Workbench; Mobile ist eine klare, touchfreundliche Einzelnavigation. Hierarchie, Lesbarkeit, sichtbare Zustände und wenig visuelles Rauschen sind wichtiger als dekorative Effekte. Das konkrete Layout, Komponentenstyling und die visuelle Ausarbeitung entscheidet der Frontend-Agent.

## 3. Datenmodelle / Datenstrukturen

Alle verbindlichen Schemas und exportierten TypeScript-Typen liegen in `packages/contracts/src/index.ts`.

### Health

- `status`: immer `ok`.
- `version`: App-Version.
- `timestamp`: ISO-Zeitpunkt.

### ServerSummary

- `serverName`, `status`, `uptimeSeconds`, `lastUpdated`.
- `operatingSystem`: `platform`, `distro`, `release`, `kernel`.
- `tailscale`: `state`, `hostname`, `dnsName`.

### ServerMetrics

- `cpuPercent`.
- `memory`: verwendete, gesamte und verfügbare Bytes.
- `disks`: Mount, verwendete, gesamte und verfügbare Bytes sowie Prozentwert.
- `loadAverage`: 1-, 5- und 15-Minuten-Werte.
- `temperatureCelsius`: Zahl oder `null`.
- `lastUpdated`.

### Service

- `id`, `name`.
- `mode`: `embedded`, `external` oder `hybrid`.
- `state`: `active`, `inactive`, `error`, `unknown` oder `checking`.
- `publicUrl`: URL oder `null`.
- `message`: optionale verständliche Begründung.
- `lastChecked`.

### Project

- `id`, `name`, `description`, absoluter `path`, `enabled`, `sortOrder`.
- `availability`: `available`, `missing`, `inaccessible` oder `symlink`.
- `previews`: konfigurierte `id`, `name`, `url` und `mode`.
- `links.t3Code`: URL oder `null`.
- `links.codeServer`: bereits serverseitig mit korrekt codiertem `folder`-Parameter erzeugte URL oder `null`.

### CommandReference

- `id`, `name`, `description`, `command`.
- Commands dürfen ausschließlich kopiert werden. Es existiert absichtlich keine Execute-Funktion.

### Workspace

- `version`: aktuell 1.
- `selectedProjectId`: ID oder `null`.
- `panels`: maximal zwei Einträge.
- Panel: `id`, Typ `t3-code`/`code-server`/`preview`, `projectId`, `previewId`, `reloadKey`.
- `layout`: `horizontal` oder `vertical`.
- `panelSizes`: zwei Prozentwerte, zusammen 100.
- `maximizedPanelId`, `focusedPanelId`: gültige Panel-ID oder `null`.

## 4. APIs / Funktionen / Schnittstellen

Alle Endpunkte sind read-only und liegen unter `/api/v1`.

- `GET /health`: Backend-Erreichbarkeit und Version.
- `GET /server/summary`: langsame Serverübersicht und Tailscale-Zustand.
- `GET /server/metrics`: CPU, RAM, Datenträger, Load und optionale Temperatur.
- `GET /services`: Status und feste Einbettungsmodi aller Dienste.
- `GET /projects`: aktivierte Projektliste mit Verfügbarkeit, Previews und sicheren Links.
- `GET /projects/:projectId`: einzelnes konfiguriertes Projekt. Unbekannte oder ungültige IDs liefern Fehler.
- `GET /commands`: statische, kopierbare Command Reference.

Der typisierte Client liegt in `apps/web/src/lib/apiClient.ts`. Fertige Query-Optionen mit den vereinbarten Pollingintervallen liegen in `apps/web/src/lib/queryOptions.ts`.

Fehler haben immer die Form `error.code` plus `error.message`. Relevante Codes sind `PROJECT_NOT_FOUND`, `VALIDATION_ERROR`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR` und clientseitig `REQUEST_FAILED`.

Die Workspace-Funktionen liegen in `apps/web/src/stores/workspace.ts`:

- Projekt auswählen.
- Panel öffnen, schließen, fokussieren und neu laden.
- Horizontal/vertikal setzen.
- Zwei Panelgrößen speichern.
- Panel maximieren und vorherige Mehrpanelansicht wiederherstellen.
- Workspace zurücksetzen.
- Sichtbare Panels abhängig von Mobile/Desktop bestimmen.
- Persistierten Zustand sicher validieren.

## 5. Verbindungspunkte fürs Frontend

- Dashboard: Summary-, Metrics-, Services-, Projects- und Commands-Queries verbinden. Optionale Temperatur nur bei Wert ungleich `null` anzeigen.
- Projektseite: Projects-Query verwenden. Aktionen deaktivieren oder erklären, wenn `availability` nicht `available` oder der jeweilige Link `null` ist.
- Workbench Empty State: ausgewähltes Projekt und `openPanel` verbinden. Eine Preview darf nur mit einer Preview-ID aus dem gewählten Project geöffnet werden.
- T3-Ansicht: ausschließlich `project.links.t3Code` bzw. den T3-Service verwenden; bei `hybrid` iframe plus externe Öffnungsaktion anbieten.
- Editor-Ansicht: ausschließlich `project.links.codeServer` verwenden. Niemals einen Pfad aus einem Eingabefeld an die URL hängen.
- Preview-Ansicht: ausschließlich `project.previews` verwenden. Modus respektieren; `external` nicht in einen iframe zwingen.
- Panel-Header: `reloadPanel` erhöht `reloadKey`; diesen Wert als iframe-Neulade-Schlüssel verwenden. Maximieren, Wiederherstellen, Fokussieren, Schließen und externe URL direkt an die Store-Aktionen anbinden.
- Resizable Panels: Änderungen gedrosselt an `setPanelSizes` geben. Bei einem Panel keine unnötige zweite Gruppe erzeugen.
- Mobile: `visiblePanels(workspace, true)` verwenden und keinen Multi-Panel-DOM rendern. Navigation und Werkzeugansicht dürfen getrennte Routen/States sein.
- Statusleiste: Health-/Service-Daten, selectedProject, focusedPanel und Panelanzahl aus Query/Store ableiten.
- Einstellungen/Info: die Version aus der Health-Antwort anzeigen; keine zweite hartkodierte UI-Version pflegen.
- Command Reference: Clipboard API verwenden; niemals einen Backend-Aufruf zum Ausführen ergänzen.

## 6. State / Flows / Auth

### Start und Wiederherstellung

Zustand persistiert unter `benjamin-dev-workbench.workspace.v1`. Der Store validiert den gespeicherten Teil beim Merge. Ungültige Daten werden vollständig durch den sicheren Empty State ersetzt. Die UI soll diesen Fallback verständlich, aber nicht alarmistisch erklären.

### Projekt- und Panel-Flow

Projektwahl setzt `selectedProjectId`. Ein Panel wird mit dem Typ und der konfigurierten Projekt-/Preview-ID geöffnet. Das dritte Panel und ein zweites code-server-Panel werden durch den Store abgewiesen. Die UI muss bei `null`-Rückgabe erklären, dass das MVP-Limit erreicht ist.

Maximieren entfernt kein Panel aus dem State. `visiblePanels` filtert nur die Darstellung. Wiederherstellen setzt ausschließlich den maximierten Zustand zurück, sodass iframe-Instanzen bei geeigneter Komponentenstruktur nicht unnötig neu erzeugt werden.

### Mobile

Auf Mobile bleibt der vollständige Workspace gespeichert, sichtbar ist aber nur das fokussierte Panel. So kann derselbe Browserzustand beim Wechsel zwischen Hoch-/Querformat und Desktop-Breakpoint erhalten bleiben.

### Auth

Die Workbench hat keine eigene Anmeldung. Netzwerkzugriff wird durch Tailscale/ACLs begrenzt. T3 Code und code-server behalten ihre eigene Authentifizierung. Tokens, Cookies oder Credentials dürfen weder von iframe-Inhalten ausgelesen noch im Zustand gespeichert werden.

### Loading und Fehler

Queries liefern unabhängige Loading-/Error-States. Ein ausgefallener Dienst darf Dashboard oder andere Panels nicht blockieren. Ein iframe-`load`-Event allein beweist keine gesunde Anwendung; Service-State, Timeout und externe Fallbackaktion sollen gemeinsam verwendet werden.

## 7. Offene Punkte / Hinweise

- code-server ist auf dem Server noch nicht installiert. `links.codeServer` ist deshalb aktuell `null`, der Dienst `inactive` und der Modus `external`. Die UI muss diesen realen Zustand anzeigen, keine Demo-URL erfinden.
- Die aktuelle TG-VereinsApp-Preview läuft nur über HTTP Port 1234. Sie ist als `external` konfiguriert, weil eine HTTPS-Workbench sie als Mixed Content blockieren würde.
- T3 Code wurde im iframe bis zur Pairing-Seite geprüft. Eine authentifizierte iframe-Session muss Benjamin regulär pairen und anschließend abnehmen; externer Fallback ist Pflicht.
- Die finalen physischen iPad-/Android-Tests, Safe Areas und virtuelle Tastatur sind nach dem visuellen Frontend durchzuführen.
- PWA, CodexBar, zweite code-server-Instanz und einklappbare Sidebar sind P1 und sollen das MVP nicht verzögern.
- Deployment-Vorlagen sind vorhanden, wurden aber bewusst nicht live angewendet. Bestehender T3-Port 443 darf nicht ersetzt werden.
- Die verbindlichen Auditdetails und Risiken stehen in `docs/server-audit.md` und `docs/embedding-test.md`.
