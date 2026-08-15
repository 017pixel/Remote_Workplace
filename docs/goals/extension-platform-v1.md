# Goal: Remote Workplace Extension Platform V1

Stand: 2026-08-15

## Goal

Remote Workplace wird schrittweise zu einer lokalen, serverzentrierten Extension-Plattform
migriert. Der Kernel behält nur Sicherheits-, Identitäts-, Host-, Recovery-, Storage- und
Low-Level-Runtime-Aufgaben. Sichtbare Funktionen werden standardmäßig als Extensions über
dieselben öffentlichen Registries und Capability APIs bereitgestellt, die auch neue lokale
Extensions verwenden.

Der Browser bleibt Client. Installationsstatus, Aktivierung, Berechtigungen, Einstellungen,
Health, Jobs, Logs und serverweite Contributions sind serverseitig autoritativ. V1 verwendet
ausschließlich mitgelieferte lokale First-Party-Pakete, lokale Entwicklerverzeichnisse und
lokale `.rwext`-Pakete.

### Abschlussvertrag

- Die Plattform erfüllt die Definition of Done aus dem `/goal` einschließlich Manager,
  Manifest und API V1, Lifecycle, Permissions, Capabilities, Local Catalog, dynamischen UI
  Surfaces, Recovery, SDK, CLI, Test Harness, Dokumentation und Agent Skills.
- Bestehende Orbit-Dokumente, Präferenzen, Bookmarks, T3-Threads, Terminal-Sitzungen,
  Hermes-State und Preview-Runtimes bleiben kompatibel oder erhalten eine dokumentierte,
  getestete Migration mit Rollback.
- Jeder größere Meilenstein wird mit den passenden Quality Gates geprüft. UI-Meilensteine
  werden zusätzlich auf Desktop und Mobile im vorgeschriebenen Browser-Werkzeug verifiziert.
- Die Migration folgt `Introduce -> Adapt -> Migrate -> Verify -> Remove Legacy` und arbeitet
  immer an genau einem primären Subgoal.
- Nicht Teil von V1 sind öffentliche oder entfernte Registries, Publisher-Systeme,
  Community-Uploads, Bewertungen, Zahlungen und Installationen über Git, GitHub, npm oder HTTP.

## Current Repository State

- pnpm-Monorepo mit Node >= 22 und TypeScript 6 im strikten Modus.
- `apps/server` ist ein Fastify-5-Backend, `apps/web` eine React-19-/Vite-8-Anwendung,
  `packages/contracts` enthält Core-Verträge und `packages/extension-contracts` die neue
  öffentliche Extension-Vertragsgrenze.
- Das Workspace-Globbing umfasst bisher nur `apps/*` und `packages/*`. Ein `extensions/`
  Workspace und Extension-Packages existieren noch nicht.
- `App.tsx` enthält drei standalone Routen und 22 App-Shell-Routendeklarationen einschließlich
  Alias und 404. Die 15 Lazy-Module und 21 Prefetch-Pfade sind separat in `routeModules.ts`
  verdrahtet.
- Desktop- und Mobile-Navigation verwenden zwar dieselben statischen Nav-Arrays, Mobile führt
  aber zusätzlich eine eigene Path-to-Route-ID-Map. Sidebar-Präferenzen enthalten 18 geschlossene
  Page IDs und 20 geschlossene Orbit-Palette-IDs in Browser-`localStorage`.
- Orbit schreibt Dokumentversion 8 und liest Version 6 bis 8. Der Vertrag kennt 17 geschlossene
  Knotentypen. Werkzeugknoten hängen zusätzlich an dem geschlossenen `panelTypeSchema`.
- Persistente React-Routen, Route-spezifische Error Boundaries, Lazy Loading und Stale-Chunk-
  Recovery existieren bereits und müssen vom künftigen Route Host erhalten werden.
- `apps/server/src/app.ts` konstruiert Datenbanken, Dienste, Synchronisierer, Runtime Manager,
  Proxies und Feature-Routen direkt. Security Hooks, Rate Limits, CSP, Request Identity,
  Mutation-Origin-Prüfung und Audit sind bereits zentral vorhanden.
- Terminal/tmux, T3 Code, code-server, Preview Gateway, Chromium und Hermes besitzen getrennte
  Prozess-, Proxy- oder Runtime-Grenzen. Diese Grenzen bleiben Kernel-Substrat.
- Orbit, Usage, Notifications, Preview-Metadaten, Terminal-Metadaten, Browser-Metadaten,
  Projekte und News verwenden aktuell die gemeinsame externe Workbench-SQLite oder eigene
  Datenbankmodule. Extension-Fachdaten sind noch nicht getrennt provisioniert.
- `packages/extension-contracts` enthält stabile Extension- und Contribution-IDs, Manifest V1,
  Extension API 1, kanonische Semantic Versions und Compatibility Ranges. Das strikte
  Manifest-Grundschema validiert Metadaten, Engines, Trust, lokale Assets und JavaScript-
  Entrypoints und erzeugt ein versioniertes Draft-2020-12-JSON-Schema. 23 stabile Permission IDs,
  strukturierte Requests, explizite Scopes und hostdefinierte Risikostufen sind enthalten.
  Activation Events, Contributions, Manager, Capability Broker, SDK und Local Catalog folgen.
- Das vollständige Detailinventar liegt in
  [`extension-platform-v1-inventory.md`](extension-platform-v1-inventory.md). Es erfasst 25
  öffentliche Routenmuster einschließlich Alias und Fallback, 167 direkt registrierte
  Fastify-Endpunkte, fünf WebSocket-Flächen, drei Reverse Proxies, die Preview-Gateways,
  Hintergrunddienste, Timer, SQLite-Tabellen, Browser-Storage, Config, Env Vars und Skills.

## Current Branch

`master`, beim Start von Subgoal 1.3 fünf lokale Goal-Commits vor `origin/master`.

## Current Commit

`e6d3871f316863eee2e09515a8b76914cab6391f` als analysierter Ausgangspunkt von Subgoal 1.3.
Der Ergebniscommit enthält die Permission Requests V1 und diese Tracker-Aktualisierung.

## Current Remote Workplace Version

`0.44.0`

## Extension API Version

`1`; als unabhängige Major-Version und intern als `1.0.0` eingeführt. Runtime und SDK folgen in
späteren Phasen.

## Manifest Version

`1`; das strikte Zod-Grundschema, sein reproduzierbares JSON-Schema und strukturierte Permission
Requests sind eingeführt. Activation Events, Contributions und Abhängigkeiten folgen additiv.

## Current Phase

Phase 1, `in-progress`. Phase 0 ist abgeschlossen.

## Current Subgoal

Subgoal 1.4, Activation Events V1 mit strikter Grammatik und stabilen Referenzen planen.

## Next Concrete Action

Subgoal 1.4 definiert die statischen Activation Events und die namespaced Referenzformen für
Commands, Routes, Orbit Nodes, Events und Jobs. Doppelte sowie syntaktisch fremde Events werden
fail-closed abgelehnt; die Existenz referenzierter Contributions wird nach deren Contract geprüft.

## Phase Table

| Phase | Ergebnis | Status |
| --- | --- | --- |
| 0 | Vollständiges Inventar, Baselines, Migration Matrix und erste Architekturentscheidungen | done |
| 1 | Manifest V1, IDs, Versionen, Lifecycle, Permissions, Contributions und Catalog Contracts | in-progress |
| 2 | Typisierte Frontend Registries mit Legacy Built-in Contributions | not-started |
| 3 | Dynamic Shell, Route Host und gemeinsame Navigation Registry | not-started |
| 4 | Generisches Orbit Extension Model, Missing State und Legacy Migration | not-started |
| 5 | Serverseitiger Extension Manager, Discovery, Installation, Lifecycle, Health und Logs | not-started |
| 6 | Capability Layer für Files, Process, Network, Storage, Events, Jobs, Secrets und weitere Broker | not-started |
| 7 | Extension SDK, UI Kit, CLI, Scaffolds, Beispiele und Test Harness | not-started |
| 8 | Extension Development Skills und Agent Acceptance Test | not-started |
| 9 | Tech TLDRs als vollständige Canary Extension | not-started |
| 10 | Built-in Features einzeln über öffentliche Extension APIs migrieren | not-started |
| 11 | Lokale Extensions-UI mit Entdecken, Installiert, Updates, Berechtigungen und Entwickler | not-started |
| 12 | Ungefähr zehn optionale lokale First-Party Catalog Extensions | not-started |
| 13 | Safe Mode, Crash Isolation, Security, Recovery, Performance, Mobile und PWA Hardening | not-started |
| 14 | Verifizierte Legacy Adapter und statische Featurelisten entfernen | not-started |
| 15 | Finaler Architektur-, Design-, Security-, DX-, Migrations- und Quality-Gate-Review | not-started |

Statuswerte: `not-started`, `planning`, `in-progress`, `blocked`, `verification`, `done`.

## Migration Matrix

Die Reihenfolge ist nach dem vollständigen Inventar priorisiert. Die Phasen 1 bis 3 schaffen
zuerst additive Verträge und UI-Registries ohne Datenmigration. Orbit folgt wegen seiner
persistierten Revisionen separat. Server Manager und Capability Broker werden danach aufgebaut,
bevor der Canary oder andere sichtbare Features migrieren.

| Bereich | Aktueller Zustand | Ziel | Phase | Status |
| --- | --- | --- | --- | --- |
| App Shell und Router | Statische Routen, Lazy Loader und Pfad-Sonderlogik | Kernel Route Host plus Extension Route Contributions | 2-3 | planning |
| Desktop/Mobile Navigation | Statische Arrays, zusätzliche Mobile Path Map | Eine Registry mit serverseitig synchronisierten User Preferences | 2-3 | planning |
| Persistente Routen | `PersistentOutlet` hält besuchte Routen gemountet | Metadata `persistent` mit sauberem Dispose bei Disable | 3 | planning |
| Orbit | 17 geschlossene Knotentypen, Dokumentversion 8 | Generischer Extension Node, Missing State und versionierte Migration | 4 | planning |
| Dashboard | Produktbezogene Sections in einer großen View | Declarative Metrics, Cards, Actions und Health Contributions | 2, 10 | planning |
| Settings | Featurebereiche direkt in `Settings.tsx` | Core Settings plus schema-driven Extension Settings | 2, 10 | planning |
| Commands | Config-/Feature-spezifische Ausführung | Gemeinsame Command Registry für UI, Agenten, Jobs und API | 2, 6 | planning |
| Server Bootstrap | Dienste und Routen direkt in `app.ts` | Kernel Bootstrap plus deterministischer Extension Manager | 5 | planning |
| Storage | Featuretabellen in Workbench-DB | Registry-Metadaten zentral, Fachdaten je Extension getrennt | 5-6 | planning |
| Permissions | Zentrale Security, aber keine Extension Grants | Permission Manager und Capability Broker mit Scopes | 1, 6 | planning |
| Events und Jobs | Direkte Listener, Timer und Service-Start-Aufrufe | Typisierter Event Bus und Scheduler mit Cleanup | 5-6 | planning |
| Agent Integration | Globaler Skill Editor, featuregebundene Agentenflächen | Provenance-basierte Skills, Tools und Agent Contributions | 6, 8 | planning |
| Tech TLDRs | UI, API, SQLite, Sync und Network fest eingebaut | `workbench.tech-tldrs` Canary Extension | 9 | not-started |
| Usage | UI und Services fest eingebaut | `workbench.usage` Built-in Extension | 10 | not-started |
| Skills UI | Route und Serverdienst fest eingebaut | `workbench.skills` Built-in Extension auf bestehender Infrastruktur | 10 | not-started |
| T3 Code | Eigener Prozess/Proxy, statische UI Surfaces | Runtime im Kernel, UI/Navigation/Orbit/Settings als `workbench.t3-code` | 10 | not-started |
| code-server | Eigener Prozess/Proxy, statische UI Surfaces | Runtime im Kernel, sichtbare Surfaces als `workbench.code-server` | 10 | not-started |
| Terminal und KI-CLIs | PTY/tmux Runtime plus statische Seiten | Runtime im Kernel, UI und Contributions als Built-ins | 10 | not-started |
| Hermes | Eigene SPA, Proxy, Bridge und Services | Kernel Runtime/Proxy, UI Contributions als `workbench.hermes` | 10 | not-started |
| Browser/Previews/Files | Sicherheitskritische Broker plus statische UI | Broker im Kernel, sichtbare UI als Built-in Extensions | 10 | not-started |
| Projects/Inbox/Dashboard | Zentrale sichtbare Features | Built-in Extensions auf Workspace- und Notification-Substrat | 10 | not-started |
| Local Catalog | Nicht vorhanden | Lokaler Bundled Catalog mit echtem Installationspfad | 5, 11-12 | not-started |

Priorisierte Abhängigkeiten:

1. Contracts und stabile IDs vor jeder Registry oder Persistenz.
2. Legacy Built-in Contributions vor dem dynamischen Shell-Umbau.
3. Dynamische Shell mit Persistenztests vor Orbit- oder Featuremigrationen.
4. Extension Manager vor Capability Brokern und Local-Catalog-UI.
5. Capabilities, SDK, Test Harness und Agent Skills vor dem Tech-TLDRs-Canary.
6. Sicherheitskritische Runtime-UIs erst nach erfolgreichem Canary einzeln migrieren.

## Decision Log

| Datum | Entscheidung | Begründung und Alternativen |
| --- | --- | --- |
| 2026-08-15 | V1 verwendet nur lokale Quellen. | Bundled Catalog, Entwicklerverzeichnis und `.rwext` prüfen den echten Installationspfad. Remote Registry, Git, npm und HTTP bleiben ausdrücklich außerhalb des Scopes. Siehe [`extension-local-catalog-v1.md`](../adr/extension-local-catalog-v1.md). |
| 2026-08-15 | Der Server ist für Extension-State autoritativ. | Installation, Aktivierung, Grants, Settings, Health, Jobs und Logs dürfen nicht von Browser-Storage abhängen. Browser-Storage bleibt nur für ephemere Darstellung und kompatible Drafts. Siehe [`extension-server-authority.md`](../adr/extension-server-authority.md). |
| 2026-08-15 | Runtime Broker bleiben Kernel, sichtbare Features werden Extensions. | Dadurch bleiben die bestehenden Sicherheits- und Prozessgrenzen erhalten, während UI und Contributions dogfooding-fähig werden. Siehe [`extension-kernel-boundary.md`](../adr/extension-kernel-boundary.md). |
| 2026-08-15 | First-Party Extensions verwenden dieselben öffentlichen Registries. | Feature-spezifische Host-Verzweigungen sind nur für Security, Bootstrap oder Recovery zulässig und werden als `hostOnly` dokumentiert. Siehe [`extension-kernel-boundary.md`](../adr/extension-kernel-boundary.md). |
| 2026-08-15 | Migration erfolgt inkrementell mit Legacy Adaptern. | Ein Big-Bang würde Persistenz, laufende Sessions und Preview-Runtimes unnötig gefährden. Legacy wird erst nach nachgewiesener Migration entfernt. |
| 2026-08-15 | Node-Prozesse unter demselben Linux-Benutzer gelten nicht als Sandbox. | V1 führt nur vertrauenswürdigen First-Party- oder expliziten Developer-Code aus. Beliebiger Third-Party-Servercode benötigt später OS-Isolation oder einen eingeschränkten Runtime-Typ. Siehe [`extension-kernel-boundary.md`](../adr/extension-kernel-boundary.md). |
| 2026-08-15 | Extension Contracts erhalten ein eigenes Workspace-Package. | Die bestehende zentrale Contracts-Datei ist bereits breit gekoppelt. Ein eigenes Package hält Manifest und öffentliche Extension API versionierbar, ohne Core-Verträge zu duplizieren. Siehe [`extension-manifest-v1.md`](../adr/extension-manifest-v1.md). |
| 2026-08-15 | Lokale Manifestpfade sind eng und hostunabhängig. | Das Schema akzeptiert nur POSIX-Paketpfade mit `./`, JavaScript-Entrypoints, Markdown-Dokumente und nicht ausführbare Raster-Icons. Realpath- und Symlink-Prüfung bleibt Aufgabe des Installers. Siehe [`extension-manifest-v1.md`](../adr/extension-manifest-v1.md). |
| 2026-08-15 | Manifest Permissions sind strukturierte Requests, keine Grants. | 23 stabile IDs verwenden passende Project-, Process-, Network-, Secret- oder Service-Scopes. Grants bleiben serverseitig, dürfen Requests nur einschränken und können durch Agenten nicht erhöht werden. Siehe [`extension-permission-model.md`](../adr/extension-permission-model.md). |

## Risk Register

| Risiko | Auswirkung | Gegenmaßnahme | Status |
| --- | --- | --- | --- |
| Dynamische Routen remounten Iframes, Terminals oder WebSockets | Verlust laufender UI-Sitzungen | Persistent Route Semantik vor Migration vertraglich testen | offen |
| Orbit-Schemaänderung beschädigt Revisionen oder Backups | Datenverlust | Additives Extension Node Modell, Load/Write Migration, alte Versionen weiter lesen | offen |
| Disable beendet user-owned Runtimes | Verlust laufender Arbeit | Contributions disposen, Runtime-Löschung nur über explizite Nutzeraktion | offen |
| Permissions vermitteln falsche Sandbox-Sicherheit | Sicherheitsfehlannahme | Trust Levels und fehlende OS-Isolation sichtbar dokumentieren | offen |
| Server Bootstrap wird durch Extensions instabil | Workbench startet nicht | Required-System-Layer, Safe Mode, Crash Loop Quarantäne und Recovery Host | offen |
| Catalog-Installation hinterlässt halben Zustand | Inkonsistente Versionen oder Daten | Staging, Backup, Migration, Health Check und atomare Aktivierung | offen |
| Browser-Preferences gehen bei Servermigration verloren | Veränderte Navigation und Layouts | Versionierter einmaliger Import, Dual Read und unangetasteter Fallback | offen |
| Initial Bundle lädt alle Extensions | Start- und Speicherregression | Server-Metadaten, Lazy Activation, Route Chunks und Performance Gates | offen |
| Extension UI verwässert das Designsystem | Inkonsistente Desktop-/Mobile-UX | Bestehende Tokens, gemeinsames UI Kit und visuelle Browser-Abnahme | offen |
| Ein lexikalisch gültiger Paketpfad folgt einem Symlink aus dem Staging-Verzeichnis | Lesen oder Aktivieren fremder Host-Dateien | Installer löst `realpath` innerhalb einer kanonischen Paketwurzel auf und lehnt Escapes fail-closed ab | offen |
| Ein fehlender Permission Scope wird als harmloser Default missverstanden | Unbeabsichtigt breiter Grant | UI kennzeichnet globale Requests ausdrücklich; Grants können serverseitig auf eine Scope-Teilmenge reduziert werden | offen |

## Compatibility Matrix

| Vertrag/Zustand | Aktuell | Ziel und Kompatibilitätsregel |
| --- | --- | --- |
| Remote Workplace | 0.44.0 | SemVer bleibt getrennt von Extension API und Manifest |
| Extension API | Version 1 als Contract-Grundlage | Runtime bleibt innerhalb Major 1 kompatibel; Compatibility Range wird im Manifest geprüft |
| Manifest | Version 1 mit strengem Grundschema und generiertem JSON Schema | Neue V1-Bereiche werden nur additiv geöffnet; unbekannte Versionen und Felder bleiben fail-closed |
| Permission Requests | 23 V1-IDs mit typisierten optionalen Scopes | Manifest fordert nur an; serverseitige Grants dürfen den Request nie erweitern |
| Orbit Dokument | liest 6-8, schreibt 8 | Historische Versionen bleiben lesbar; Extension Nodes werden additiv migriert |
| Sidebar Preferences | localStorage Key `remote-workplace.sidebar-preferences.v1`, Persist v2 | Versionierter Import zu stabilen Contribution IDs, alte Daten bleiben als Fallback |
| Route Bookmarks | bestehende Pfade wie `/t3-code`, `/terminal`, `/files` | Bestehende Pfade bleiben direkte Routes oder Aliase |
| Runtime Sessions | T3, tmux, Preview, Chromium und Hermes getrennt | UI-Disable löscht oder beendet sie nicht automatisch |
| Extension-Daten | noch keine getrennten Stores | Eigene SQLite und Files je Extension, Core DB enthält nur Registry-Metadaten |

## Test Status

| Prüfung | Letztes Ergebnis | Scope |
| --- | --- | --- |
| Git-Baseline | sauber | Start von Subgoal 0.1 |
| `pnpm typecheck` | bestanden am 2026-08-15 | Subgoal 1.3, alle fünf Workspaces |
| `pnpm lint` | bestanden am 2026-08-15 | Subgoal 1.3 |
| `pnpm test` | bestanden am 2026-08-15, 114 Extension Contracts, 18 Contracts, 396 Server, 279 Web | Subgoal 1.3, 807 Tests |
| `pnpm build` | bestanden am 2026-08-15 | Subgoal 1.3, vollständiger Produktionsbuild und aktualisiertes JSON Schema |
| Browser-Baseline | bestanden am 2026-08-15 | isolierter Testserver, Playwright MCP, Dashboard, Orbit und Settings |
| `pnpm test:e2e` | noch nicht in diesem Goal ausgeführt | erster UI-Milestone |
| `pnpm security:audit` | High-Severity-Gate bestanden am 2026-08-15; eine moderate bestehende DOMPurify-Advisory | Subgoal 1.1, nicht durch `semver` eingeführt |

## Performance Baseline

Die vollständige Messtabelle und Methodik stehen im
[`Phase-0-Inventar`](extension-platform-v1-inventory.md#9-performance-baseline). Gemessen wurde
mit Produktionsbuild und isoliertem Testserver, ohne Nutzer-Previews oder produktive Dienste zu
verändern.

| Kennzahl | Baseline |
| --- | ---: |
| Server Boot bis Health | 1.061 ms |
| Main JS | 477,33 kB raw, 143,90 kB gzip |
| Global CSS | 496,78 kB raw, 100,61 kB gzip |
| First Contentful Paint | 472 ms |
| Kalter Orbit Load | 416 ms |
| Bereits gemountete Rückroute | 61 ms |
| Server RSS | 288,24 MB |
| Health API p95 | 1,746 ms |
| Projects API p95 | 1,379 ms |

## Known Regressions

Keine durch dieses Goal verursachten Regressionen bekannt. Die Baseline-Prüfung fand eine
zeitabhängige Usage-Testfixture, deren fester 15. Juli am 15. August aus dem getesteten
30-Tage-Fenster gefallen war. Die Fixture verwendet jetzt den aktuellen UTC-Tag und der gesamte
Testlauf ist wieder grün. Vorhandene `Unreleased`-Änderungen im Changelog stammen aus der
laufenden Entwicklung vor Goal-Start und werden nicht umgeschrieben.

Der Production Audit meldet `GHSA-55q2-fjhq-7xh7` für das bereits verwendete
`dompurify@3.4.12`. Die betroffene Kombination aus `IN_PLACE` und Element-removing Hooks wird in
den beiden aktuellen Aufrufstellen nicht verwendet; `semver` hat die Advisory nicht eingeführt.
Das High-Severity-Gate bleibt grün. Das Patch-Upgrade auf DOMPurify 3.4.13 oder neuer wird als
separate Security-Wartung behandelt und nicht in den Extension-Contract-Commit gemischt.

## Blocked Items

Keine.

## Relevant Commits

| Commit | Bedeutung |
| --- | --- |
| `479bfa7` | Ausgangscommit, korrigiert Routen-Synchronisierung in inaktiven Flächen |
| `7662f2c` | Subgoal 0.1, Goal-Tracker und Repository-Baseline |
| `7117e6f` | Subgoal 0.2, Detailinventar und Performance-Baseline |
| `2899706` | Subgoal 0.3, Kernel Boundary und bindende Phase-1-ADRs |
| `d40cb91` | Subgoal 1.1, ID- und Versionsgrundlagen |
| `e6d3871` | Subgoal 1.2, Manifest-Grundschema und JSON Schema |
| Ergebniscommit dieser Aktualisierung | Subgoal 1.3, Permission Requests V1 und Permission-ADR |

## Subgoal Log

| Subgoal | Status | Nachweis | Nächster Schritt |
| --- | --- | --- | --- |
| 0.1 Goal-Tracker und Baseline | done | Git, Konfiguration, Architektur, Router, Navigation, Orbit und Server Bootstrap gelesen; Typecheck, Lint und 693 Tests grün | Subgoal 0.2, vollständiges Inventar |
| 0.2 Vollständiges Phase-0-Inventar | done | Vollständiges Detailinventar, Produktionsbuild, isolierte Browser-/API-Baseline, Typecheck, Lint und 693 Tests grün | Subgoal 0.3, Kernel Boundary und ADRs |
| 0.3 Kernel Boundary und Phase-1-ADRs | done | Vier akzeptierte ADRs gegen Security-, Runtime- und Persistenzgrenzen geprüft; Typecheck, Lint und 693 Tests grün | Subgoal 1.1, ID- und Versionsgrundlagen |
| 1.1 ID- und Versionsgrundlagen | done | Neues Contract-Package, stabile Namespaces, SemVer Compatibility, 45 Tests und vollständige Quality Gates grün | Subgoal 1.2, Manifest-Grundschema |
| 1.2 Manifest-Grundschema | done | Striktes Zod-Schema, Draft-2020-12-Artefakt, Drift-Prüfung, Path-Escape-Tests und 768 grüne Repository-Tests | Subgoal 1.3, Permission Requests V1 |
| 1.3 Permission Requests V1 | done | 23 IDs, sechs Request-Varianten, fünf Scope-Typen, Risikomatrix, Permission-ADR und 807 grüne Repository-Tests | Subgoal 1.4, Activation Events V1 |
| 1.4 Activation Events V1 | planning | Activation-Grammatik und Referenztypen im Manifest-ADR festgelegt | Event-Schemas, Namespace-Prüfung und Deduplizierung implementieren |
