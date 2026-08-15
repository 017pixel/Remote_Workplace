# Extension Platform V1: Phase-0-Inventar

Stand: 2026-08-15

Analysierter Ausgangscommit: `7662f2c`

Remote Workplace: `0.44.0`

Dieses Inventar beschreibt den tatsächlichen Extension-relevanten Zustand vor der ersten
Plattformimplementierung. Es ist ein Detailartefakt des Trackers
[`extension-platform-v1.md`](extension-platform-v1.md). Vor jeder späteren Phase werden die
betroffenen Bereiche erneut gegen den aktuellen Repository-Stand geprüft.

## 1. Repository und Build

| Bereich | Ist-Zustand |
| --- | --- |
| Workspace | pnpm 10 mit `apps/*` und `packages/*` |
| Runtime | Node >= 22, ESM, TypeScript 6 mit strict, noUncheckedIndexedAccess und exactOptionalPropertyTypes |
| Frontend | React 19, React Router 8, Vite 8, TanStack Query, Zustand, Tailwind 4, React Flow |
| Backend | Fastify 5, Zod 4, Node SQLite, WebSocket, node-pty, execa, undici |
| Geteilte Verträge | `packages/contracts/src/index.ts`, eine große kanonische Zod-Datei |
| Tests | Vitest in allen drei Workspaces, Playwright E2E gegen eine isolierte Testinstanz |
| CI | Typecheck, ESLint, Tests, Build und Production Audit über `.github/workflows/quality.yml` |
| Noch nicht vorhanden | `extensions/`, Extension-Packages, Manifest, SDK, CLI, Runtime und Test Harness |

## 2. Frontend-Inventar

### 2.1 Routen und Pages

`App.tsx` deklariert drei standalone Routen und 22 Einträge innerhalb der App Shell. Jede
Feature-Route verwendet bereits eine eigene Error Boundary. `PersistentOutlet` hält besuchte
Shell-Routen anhand des Pfads gemountet.

| Pfad | Ansicht | Shell | Kopplung |
| --- | --- | --- | --- |
| `/` | Dashboard | standard | eager import, statischer Index |
| `/workbench` | Orbit Workbench | full-bleed | eigener Lazy Loader, Shell-Sonderfall |
| `/inbox` | Inbox | standard | eigener Lazy Loader |
| `/tech-tldrs` | Tech TLDRs | full-bleed | eigener Lazy Loader, Shell-Sonderfall |
| `/projects` | Projekte | standard | eigener Lazy Loader |
| `/projects/:projectId` | Projektdetail | standard | eigener Loader, dynamischer Breadcrumb |
| `/files` | Dateimanager | standard | eigener Loader, standalone Actions |
| `/ki-skills` | Skill Editor | standard | eigener Loader |
| `/gallery` | Alias auf `/files` | standard | statischer Redirect |
| `/settings` | Einstellungen | standard | eigener Loader, Recovery-relevant |
| `/usage` | Nutzung | standard | eigener Loader |
| `/t3-code` | T3 Code | standard | ToolRoute Loader, Topbar-Sonderfall |
| `/hermes-agent` | Hermes SPA | standard | eigener Loader, persistentes Iframe |
| `/code-editor` | code-server | standard | ToolRoute Loader, Topbar-Sonderfall |
| `/previews` | Preview Hub | standard | ToolRoute Loader |
| `/previews/gruppe/:groupId` | Preview-Gruppe | standard | eigener Loader |
| `/browser` | Browser | standard | ToolRoute Loader |
| `/terminal` | Terminal | standard | eigener Loader, Fokusmodus |
| `/codex` | Codex CLI | standard | gemeinsamer CLI Loader, Fokusmodus |
| `/opencode` | OpenCode CLI | standard | gemeinsamer CLI Loader, Fokusmodus |
| `/claude` | Claude Code CLI | standard | gemeinsamer CLI Loader, Fokusmodus |
| `/previews/fenster/:groupId` | Preview-Fenster | standalone | keine App Shell |
| `/previews/live` | Live-Preview | standalone | keine App Shell |
| `/terminal/fenster/:runtimeId` | Terminalfenster | standalone | keine App Shell |
| `*` | 404 | standard | statischer Fallback |

`routeModules.ts` führt zusätzlich 15 Loader-Definitionen und 21 statische Prefetch-Präfixe.
Stale-Chunk-Recovery lädt bei einem fehlenden alten Vite-Chunk genau einmal die aktuelle App.

### 2.2 Desktop- und Mobile-Navigation

Die sichtbaren Navigationseinträge stammen aus einem gemeinsamen statischen Array. Stable IDs
liegen aber nicht auf den Einträgen. Mobile übersetzt alle Pfade erneut in die geschlossene
`PageRouteId`-Union.

| Gruppe | Einträge |
| --- | --- |
| Workspace | Dashboard, Inbox, Workbench, Tech TLDRs, Projekte |
| Werkzeuge | T3 Code, Hermes Agent, Code-Server, Terminal, OpenCode, Codex, Claude Code, Previews, Dateien, Browser, KI-Skills |
| Account und System | Nutzung, Einstellungen |

Relevante Kopplungen:

- `PageRouteId` und `allPageRoutes` enthalten 18 feste IDs.
- `MobileNav.pathToRouteId` wiederholt die 18 Pfadzuordnungen.
- Sidebar und Mobile filtern anhand derselben browserlokalen Hidden-Page-Sets.
- `settings` ist derzeit die einzige immer sichtbare Recovery-nahe Route.
- Mobile erhält Focus Trap, Browser-History-Overlay, Reduced Motion und eine 240-ms-Exitphase.
- `AppShell` enthält Pfadabfragen für Title, Project Detail, Orbit, Tech TLDRs, T3, code-server,
  Files sowie alle vier Terminal-/CLI-Flächen.

### 2.3 Persistente Routen

- `PersistentOutlet` hält jede besuchte Pathname-Instanz gemountet.
- `DeferredRoute` hält den Boundary-Key des ersten Mounts stabil.
- T3, code-server, Hermes, Terminals, Browser, Previews und Agenten-CLIs hängen an dieser Semantik.
- Der spätere Route Host braucht Metadata für `persistent`, `shell`, `topbar`, `breadcrumbs`,
  `projectContext`, `standaloneActions`, `mobileNavigation` und `prefetch`.
- Disable darf die Contribution unmounten, aber keine tmux-, Preview-, T3-, Chromium- oder
  Hermes-Runtime ungefragt beenden.

### 2.4 Orbit

Orbit liest Dokumentversion 6 bis 8 und schreibt Version 8. Grenzen: 8 Boards, 600 Nodes je
Board, 1.200 Edges und 96 Tool Nodes.

Geschlossene Knotentypen:

```text
project, tool, previewGroup, previewSlot, note, todo, snippet, file, asset,
gallery, fileGallery, frame, usage, hermesStatus, hermesTasks, hermesCron,
hermesResults
```

Geschlossene Paneltypen:

```text
t3-code, code-server, preview, browser, terminal, codex, opencode, files,
hermes, notion
```

Die Sidebar-Palette kennt davon neun Tooltypen, vier Preview-Layouts und sieben Blocktypen.
Notion ist im Panelvertrag vorhanden, aber nicht in der Sidebar-`OrbitToolType`-Union. Der
separate `OrbitPalettePayload` kennt 15 feste Erzeugungstypen. Renderer, Inspector,
Kontextaktionen, Größenlogik und Migrationen verzweigen direkt auf diese Typen.

### 2.5 Dashboard

Das Dashboard kennt neun feste Sektionen. Server-Config und browserlokale Hidden-Sets bilden
zusammen die Sichtbarkeit.

```text
quickActions, server, metrics, services, runtime, diagnostics, usage, news,
commands
```

Die View enthält produktbezogene Bereiche für Serverdiagnose, Workbench-Diagnose, Dienste,
laufende Arbeit, Nutzung, Tech-News, Schnellzugriff und Command Reference. Das Zielmodell braucht
generische Metric-, Status-, Card-, Quick-Action-, List-, Chart-, Error- und Health-Contributions.

### 2.6 Settings

`Settings.tsx` enthält elf feste Cards:

```text
Version
Dienst neu starten
T3 Code Kanal
Limitüberwachung
Workspace
Dashboard
Benachrichtigungen
App installieren
Orbit-Sidebar
Seiten-Sichtbarkeit
Sicherheit
```

Version, allgemeine Security, Extensions und Recovery bleiben Core. T3, Usage,
Notifications-Quellen sowie spätere Featurebereiche werden Settings Contributions. Dashboard,
Navigation und Orbit-Präferenzen wechseln zu stabilen Contribution IDs und serverseitiger
User-Personalisierung.

### 2.7 Browser-Storage

Autoritative Serverdaten besitzen teilweise browserlokale Pending-Drafts. Andere Einträge sind
noch die einzige Quelle für UI-Präferenzen.

| Scope | Keys |
| --- | --- |
| Workspace | `remote-workplace.workspace.v2`, Legacy `remote-workplace.workspace.v1`, zwei `benjamin-dev-workbench.*`-Migrationskeys |
| Navigation | `remote-workplace.sidebar.v1`, `remote-workplace.sidebar-preferences.v1` Persist v2 |
| Dashboard | `remote-workplace.dashboard-preferences.v1` |
| Orbit | `workbench.orbit.pending-draft.v1`, `workbench-orbit-palette-queue`, `workbench-orbit-open-intents`, `workbench:orbit-touch-hint:v1`, `remote-workplace.node-colors.v1` |
| Terminal | `remote-workplace.terminals.v1`, `workbench.terminals.pending.v1` |
| Files/Skills | `workbench.file-manager.pending.v1`, `remote-workplace.files.tree-width.v1`, `remote-workplace.skills.tree-width.v1` |
| Preview | `remote-workplace.preview-hub.v1`, `workbench:preview-slot:<panelId>`, `workbench:preview-target:<panelId>`, `workbench:preview-group-snapshot:<groupId>` |
| Browser | `workbench:browser-target:<instanceId>`, `workbench:browser-slot:<instanceId>`, `workbench-browser-session:<instanceId>` |
| Usage/News | `remote-workplace.usage-preferences.v1`, `workbench.news.chatModel` |

Pending-Drafts, kurzfristige Slots und Pop-up-Snapshots dürfen lokal bleiben. Navigation,
Dashboard, Extension UI Preferences und andere geräteübergreifende User-Personalisierung werden
serverseitig importiert. Alte Keys bleiben während Dual Read als unangetasteter Fallback erhalten.

## 3. Backend-Inventar

### 3.1 Serverinitialisierung

`apps/server/src/app.ts` führt derzeit in dieser Reihenfolge aus:

1. Fastify, Settings, Identity Options, CSP-Framequellen und zentrale Verzeichnisse vorbereiten.
2. Config-Repositories für Projekte, Dienste und Commands laden.
3. Datenbanken und Repositories für Usage, Projektaktivität, Projektregistry, Previews,
   Browser, Files, Skills, Notifications, Audit, Orbit, Galerien und News erstellen.
4. Feature-Services und Synchronisierer für Usage, Accounts, Projects, lokale Ports, Hermes,
   Notifications, Preview Devserver und News konstruieren.
5. Compression, Helmet/CSP, Rate Limit, WebSocket und Multipart registrieren.
6. Error Mapping, no-store, Request IDs, Metrics, Audit, Identity und Mutation-Origin Hooks setzen.
7. General API, Preview, News, Hermes und Notification Routes registrieren.
8. Terminal/tmux und Chromium Manager konstruieren, danach deren Routes registrieren.
9. Hintergrunddienste und zwölf Preview Listener starten.
10. Einen vollständigen `onClose`-Cleanup aller Dienste, Manager und Datenbanken registrieren.
11. code-server-, T3- und Hermes-Proxies registrieren.
12. Frontend, DevTools Assets und SPA-Fallback ausliefern.

Der Extension Manager wird später zwischen Kernel-Serviceaufbau und Featureaktivierung
eingeführt. Security Hooks, Recovery Routes und Runtime Broker müssen vorher verfügbar sein.

### 3.2 HTTP API

Es existieren 167 direkt registrierte Fastify-Endpunkte. Alle folgenden Modulrouten erhalten
den Prefix `/api/v1`.

#### Core und allgemeine Feature API

```text
GET    /health
GET    /health/readiness
GET    /system/operational-metrics
GET    /system/dashboard-config
POST   /system/restart
GET    /system/restart/status
GET    /system/t3-channel
POST   /system/t3-channel
GET    /system/usage-monitoring
PUT    /system/usage-monitoring
GET    /server/summary
GET    /server/metrics
GET    /services
GET    /local-ports

GET    /filesystem/tree
GET    /filesystem/state
PUT    /filesystem/state
GET    /filesystem/file
GET    /filesystem/media
GET    /filesystem/download
POST   /filesystem/upload
POST   /filesystem/rename
POST   /filesystem/move
POST   /filesystem/delete
POST   /filesystem/mkdir
GET    /filesystem/search

GET    /skills/status
GET    /skills/tree
GET    /skills/file
PUT    /skills/file
POST   /skills
POST   /skills/rename
DELETE /skills/:name
POST   /skills/git

GET    /projects
POST   /projects/register
GET    /projects/:projectId
POST   /projects/:projectId/activity
POST   /projects/:projectId/files

GET    /orbit
PUT    /orbit
GET    /orbit/assets
POST   /orbit/assets
GET    /orbit/assets/folders
POST   /orbit/assets/folders
PATCH  /orbit/assets/folders/:folderId
DELETE /orbit/assets/folders/:folderId
GET    /orbit/assets/:assetId
PATCH  /orbit/assets/:assetId
DELETE /orbit/assets/:assetId

GET    /files
POST   /files
GET    /files/folders
POST   /files/folders
PATCH  /files/folders/:folderId
DELETE /files/folders/:folderId
GET    /files/:fileId
PATCH  /files/:fileId
DELETE /files/:fileId

GET    /commands
GET    /usage
GET    /usage/timeline
GET    /usage/dashboard
GET    /usage/sync/status
POST   /usage/sync
GET    /accounts
POST   /accounts
GET    /accounts/discover
PATCH  /accounts/:accountId
DELETE /accounts/:accountId
POST   /accounts/:accountId/activate
POST   /accounts/login-session
GET    /proxy/*
```

#### Preview API

```text
GET    /previews/slots
PUT    /previews/slots
POST   /previews/slots/reclaim
POST   /previews/slots/:slotId/reset
POST   /previews/slots/:slotId/reset/verify
POST   /previews/sessions
DELETE /previews/sessions/:sessionId
PUT    /previews/sessions/:sessionId/lease
DELETE /previews/sessions/by-key/:sessionKey
GET    /previews/dependencies
PUT    /previews/dependencies
GET    /previews/device-preference
PUT    /previews/device-preference
GET    /previews/hub-preference
PUT    /previews/hub-preference
GET    /previews/service-candidates
POST   /previews/service-candidates/scan
GET    /previews/service-graphs/:projectId/:primaryServiceId
PUT    /previews/service-graphs/:projectId/:primaryServiceId
GET    /previews/storage/:storageProfileId
PUT    /previews/storage/:storageProfileId
DELETE /previews/storage/:storageProfileId
POST   /previews/storage/:storageProfileId/snapshots
POST   /previews/storage/:storageProfileId/restore
GET    /previews/diagnostics
POST   /previews/diagnostics/batches
POST   /previews/diagnostics/capture-session
DELETE /previews/diagnostics/capture-session/:id
GET    /previews/diagnostics/log-tail
GET    /previews/doctor/status
GET    /previews/doctor/logs
POST   /previews/doctor/probe
POST   /previews/repair
GET    /previews/repair/:jobId
GET    /previews/dev-servers
GET    /previews/dev-servers/:projectId
GET    /previews/dev-servers/:projectId/profile
GET    /previews/dev-servers/:projectId/logs
POST   /previews/dev-servers/:projectId/start
POST   /previews/dev-servers/:projectId/launch
POST   /previews/dev-servers/:projectId/stop
POST   /previews/dev-servers/:projectId/restart
PUT    /previews/dev-servers/:projectId/main-port
```

#### Tech TLDRs API

```text
GET    /news
GET    /news/:id
PATCH  /news/:id/read
PUT    /news/:id/collections
GET    /news/image/:id
POST   /news/chat
POST   /news/sync
GET    /news/collections
POST   /news/collections
DELETE /news/collections/:id
```

#### Hermes API

```text
GET    /hermes/status
GET    /hermes/sessions
GET    /hermes/sessions/:id
GET    /hermes/sessions/:id/messages
DELETE /hermes/sessions/:id
GET    /hermes/tasks
POST   /hermes/tasks/:id/cancel
GET    /hermes/cron
GET    /hermes/results
GET    /hermes/models
POST   /hermes/models/select
POST   /hermes/services/action
GET    /hermes/update/status
POST   /hermes/update/check
POST   /hermes/update/run
GET    /hermes/diagnostics
POST   /hermes/diagnostics/run
GET    /hermes/chat
```

#### Notifications API

```text
GET    /notifications
DELETE /notifications
GET    /notifications/settings
PUT    /notifications/settings
PATCH  /notifications/:id
DELETE /notifications/:id
GET    /notifications/:id/report
POST   /notifications/report
POST   /notifications/read-all
POST   /notifications/mark-all-read
PUT    /notifications/presence
POST   /notifications/push-subscription
DELETE /notifications/push-subscription
POST   /notifications/push-test
GET    /notifications/ws
```

#### Terminal und Browser API

```text
GET    /terminal
GET    /terminal/sessions
DELETE /terminal/sessions/:sessionId
POST   /terminal/sessions/:sessionId/restart
GET    /terminal/workspace
PUT    /terminal/workspace
GET    /browser
GET    /browser/devtools/:sessionId
```

### 3.3 WebSockets und Proxies

| Surface | Pfad/Listener | Kernel-Ziel |
| --- | --- | --- |
| Terminal | `/api/v1/terminal` | PTY/tmux Broker |
| Chromium | `/api/v1/browser` | Browser Runtime Broker |
| Chromium DevTools | `/api/v1/browser/devtools/:sessionId` | kontrollierter CDP-Proxy |
| Hermes ACP | `/api/v1/hermes/chat` | Hermes Adapter |
| Notifications | `/api/v1/notifications/ws` | Realtime Notification Infrastructure |
| T3 Code | `/ws` sowie HTTP unter `/t3` und Assetpfaden | T3 Runtime Proxy |
| code-server | `/editor/*` HTTP und WS | Editor Runtime Proxy |
| Hermes SPA | konfigurierter `/hermes/*` HTTP und WS | Hermes Runtime Proxy mit Token- und Origin-Schutz |
| Preview Gateway | zwölf getrennte Loopback-Listener am Root | Preview Runtime mit HTTP/WS Routing |

Die Proxies sind sicherheits- und laufzeitspezifisch. Sie werden nicht durch beliebige Extension
Routes ersetzt. Extensions greifen über typisierte Broker und namespaced RPC darauf zu.

### 3.4 Hintergrunddienste und Timer

Beim normalen Serverstart laufen:

| Dienst | Rhythmus/Ereignis | Ziel |
| --- | --- | --- |
| Usage Analytics | `USAGE_SNAPSHOT_INTERVAL_MS` | Limits und Kosten importieren |
| Usage Timeline | interner Cache-/Synczyklus | Account-Timeline aktualisieren |
| News Service | `NEWS_SYNC_INTERVAL_MS`, Initiallauf nach 1 s | Feeds und AI-Aufbereitung |
| Hermes Result Sync | `hermes.resultPollSeconds` | Ergebnisse und Notifications |
| T3 Status Sync | `notifications.pollSeconds` | T3-Abschlüsse und Rückfragen |
| Terminal Status Sync | `notifications.pollSeconds` | lange Prozesse und Agentenstatus |
| Agent Session Sync | `notifications.pollSeconds` | Codex/OpenCode/T3 Sessions |
| Preview Slot Listener | Serverstart | zwölf Gateway Listener |
| Preview Devserver Watchdog | interner Watchdog-Intervall | user-owned Projektlaufzeiten beobachten |
| Preview Logrotation | stündlich plus Initiallauf | Diagnose-Retention |
| Chromium Idle Cleanup | alle 60 s, sobald Manager aktiv | inaktive Browserprozesse schließen |

Timeouts existieren zusätzlich für HTTP, Proxies, Chromium/CDP, Hermes ACP, News Fetch,
Vector Search, PTY Shutdown und WebSocket Send Queues. Extern laufen Hermes Update Timer täglich
und ein Retry Timer alle 30 Minuten. Extension Jobs werden später zentral im Scheduler
registriert und automatisch disposed; user-owned Watchdogs und Runtime-Supervisor bleiben Core.

## 4. Daten und Persistenz

### 4.1 SQLite-Tabellen

Die Module öffnen überwiegend dieselbe externe Workbench-Datenbank über getrennte Connections.
Aktuelle Tabellen nach Domäne:

| Domäne | Tabellen |
| --- | --- |
| Usage/Accounts | `schema_migrations`, `accounts`, `active_accounts`, `account_activation_journal`, `usage_snapshots`, `daily_usage`, `model_usage`, `project_usage`, `reset_credits` |
| Browser | `browser_instances` |
| Files | `file_manager_state` |
| News | `schema_migrations`, `news_sources`, `news_items`, `news_read_state`, `news_collections`, `news_collection_items`, `news_embeddings`, `news_fts`, `news_meta` |
| Notifications | `notifications`, `push_subscriptions` |
| Observability | `operational_audit` |
| Orbit | `schema_migrations`, `orbit_documents`, `orbit_document_revisions`, `orbit_conflict_backups`, `orbit_backup_outbox`, `orbit_maintenance_state` |
| Orbit Assets | `orbit_assets`, `orbit_assets_folders`, `orbit_assets_reservations` |
| File Gallery | `file_gallery_files`, `file_gallery_files_folders`, `file_gallery_files_reservations` |
| Projects | `project_activity`, `orbit_project_registry` |
| Previews | `preview_schema_migrations`, `schema_migrations`, `preview_slots`, `preview_project_port_rules`, `preview_sessions`, `preview_session_bindings`, `preview_runtime_sessions`, `preview_slot_affinities`, `preview_device_preferences`, `preview_service_candidates`, `preview_service_graphs`, `preview_local_storage_settings`, `preview_local_storage_snapshots`, `preview_repair_audit`, `preview_routing_revision`, `preview_dev_server_preferences`, `preview_hub_preferences` |
| Terminal | `terminal_schema_migrations`, `terminal_sessions`, `terminal_workspaces` |

Kernel Registry-Metadaten dürfen in der Workbench-DB bleiben. Tech TLDRs und spätere optionale
Extension-Fachdaten werden in eigene Extension-SQLite-Dateien migriert. Orbit, Projekte,
Runtime-Registries, Notification-Grundlage und Audit bleiben Kernel-Substrat.

### 4.2 Config Keys

Kanonische committed Vorlage ist `config/workbench.example.json`. Top-Level und bekannte Pfade:

```text
branding.appName
branding.shortName

system.user
system.homeDirectory

tailscale.hostname
tailscale.ip
tailscale.httpsPort
tailscale.allowedUsers

paths.projectsRoot
paths.orbitProjectBrowserRoot
paths.terminalAllowedRoots
paths.terminalDefaultCwd
paths.dataDir
paths.databasePath
paths.browserProfilesRoot
paths.orbitBackupDir
paths.orbitAssetDir
paths.fileGalleryDir
paths.workbenchProfilesRoot
paths.codexSharedHome
paths.claudeSharedHome
paths.opencodeSharedHome

cli.tmux
cli.codex
cli.opencode
cli.claude
cli.chromium
cli.codexbar

codexbar.configPath
codexbar.oauthProfileHomes

previews.slotPorts
previews.publicPorts
previews.allowedProjectPorts
previews.gatewayV2Enabled
previews.bridgeEnabled
previews.diagnosticsEnabled
previews.storageSyncMode
previews.slotResetEnabled
previews.maxInjectableHtmlBytes
previews.diagnosticRetentionDays
previews.diagnosticMaxEventBytes
previews.diagnosticMaxBatchBytes
previews.diagnosticMaxDailyBytes
previews.diagnosticMaxTotalBytes
previews.localStorageMaxBytes
previews.localStorageMaxKeys
previews.npmExecutable
previews.devServerLogBytes
previews.devServerStartTimeoutMs

t3.channel
t3.npmPackage
t3.cliPath
t3.host
t3.port
t3.serviceUnit
t3.legacyLauncher
t3.installTimeoutSeconds
t3.stopTimeoutSeconds
t3.portTimeoutSeconds
t3.healthTimeoutSeconds

hermes.enabled
hermes.host
hermes.port
hermes.proxyPrefix
hermes.cliPath
hermes.homeDirectory
hermes.checkoutDirectory
hermes.pythonPath
hermes.dashboardServiceUnit
hermes.gatewayServiceUnit
hermes.updateServiceUnit
hermes.updateTime
hermes.updateTimezone
hermes.requestTimeoutSeconds
hermes.startTimeoutSeconds
hermes.acpMaxSessions
hermes.acpIdleTimeoutSeconds
hermes.statusPollSeconds
hermes.taskPollSeconds
hermes.resultPollSeconds

dashboard.refresh.healthMilliseconds
dashboard.refresh.summaryMilliseconds
dashboard.refresh.metricsMilliseconds
dashboard.refresh.servicesMilliseconds
dashboard.refresh.localPortsMilliseconds
dashboard.refresh.terminalSessionsMilliseconds
dashboard.refresh.usageMilliseconds
dashboard.refresh.newsMilliseconds
dashboard.refresh.operationalMetricsMilliseconds
dashboard.sections.quickActions
dashboard.sections.server
dashboard.sections.metrics
dashboard.sections.services
dashboard.sections.runtime
dashboard.sections.diagnostics
dashboard.sections.usage
dashboard.sections.news
dashboard.sections.commands

usage.monitoring.codex
usage.monitoring.opencode
usage.monitoring.claude

notifications.pollSeconds
notifications.pruneAfterHours
notifications.pushSubject
notifications.t3CompletionMinimumSeconds
notifications.t3MiniTaskSeconds
notifications.terminalMinimumSeconds
notifications.agentMinimumSeconds
notifications.hermesCompletionMinimumSeconds
notifications.preferences.toastsEnabled
notifications.preferences.pushEnabled
notifications.preferences.sources.<hermes|t3|opencode|codex|claude|terminal|workbench|update>.<toast|push>
```

Extension-Plattformwerte kommen später in denselben zentralen Config-Baum oder in serverseitige
Extension Settings. Keine neue parallele globale Config-Datei wird ohne generischen Bedarf
eingeführt.

### 4.3 Env Vars

Die committed `.env.example` definiert aktuell:

```text
HOST PORT APP_VERSION LOG_LEVEL CONFIG_DIR WEB_DIST_DIR
API_RATE_LIMIT_MAX REQUEST_TIMEOUT_MS WEBSOCKET_MAX_PAYLOAD_BYTES
COMPRESSION_THRESHOLD_BYTES BROTLI_QUALITY
METRICS_CACHE_MS SUMMARY_CACHE_MS SERVICE_CACHE_MS AUDIT_VERIFY_CACHE_MS
LOCAL_PORT_CACHE_MS LOCAL_PORT_PROBE_TIMEOUT_MS
PROJECT_DISCOVERY_ENABLED PROJECT_LIST_CACHE_MS
PROJECT_ACTIVITY_CACHE_MS PROJECT_ACTIVITY_MAX_DEPTH PROJECT_ACTIVITY_MAX_FILES
PROJECT_ACTIVITY_CONCURRENCY
ORBIT_SYNC_INTERVAL_MS ORBIT_DOCUMENT_MAX_BYTES ORBIT_BACKUP_DIR ORBIT_ASSET_MAX_FILE_BYTES
ORBIT_ASSET_MAX_TOTAL_BYTES ORBIT_RECENT_PROJECT_LIMIT ORBIT_PROJECT_BROWSER_PAGE_SIZE
ORBIT_DESTRUCTIVE_DROP_PERCENT ORBIT_REVISION_RETENTION_COUNT ORBIT_CONFLICT_RETENTION_COUNT
FILE_GALLERY_MAX_FILE_BYTES FILE_GALLERY_MAX_TOTAL_BYTES
TERMINAL_SUPERVISOR TERMINAL_MAX_SESSIONS CODEX_MAX_SESSIONS OPENCODE_MAX_SESSIONS
CLAUDE_MAX_SESSIONS TERMINAL_ALLOWED_USERS
BROWSER_MAX_SESSIONS BROWSER_STARTUP_TIMEOUT_MS BROWSER_IDLE_TIMEOUT_MS
BROWSER_CAPTURE_MAX_WIDTH BROWSER_CAPTURE_MAX_HEIGHT BROWSER_CAPTURE_MAX_SCALE
BROWSER_CAPTURE_JPEG_QUALITY BROWSER_CAPTURE_EVERY_NTH_FRAME BROWSER_ALLOW_NO_SANDBOX
CODEXBAR_BASE_URL CODEXBAR_CACHE_MS CODEXBAR_TIMEOUT_MS
CODEX_OAUTH_PRIMARY_FALLBACK CODEX_OAUTH_TIMEOUT_MS
USAGE_SNAPSHOT_INTERVAL_MS
PROXY_TIMEOUT_MS PROXY_MAX_HTML_BYTES
PREVIEW_DEV_SERVER_LOG_BYTES PREVIEW_DEV_SERVER_START_TIMEOUT_MS
T3_CLI_PATH T3_NPM_PACKAGE T3_HOST T3_PORT T3_SERVICE_UNIT
HERMES_ENABLED HERMES_HOST HERMES_PORT HERMES_PROXY_PREFIX HERMES_CLI_PATH HERMES_HOME
HERMES_DASHBOARD_UNIT HERMES_GATEWAY_UNIT HERMES_UPDATE_UNIT
MISTRAL_API_KEY MISTRAL_API_BASE_URL MISTRAL_MODEL_INGEST MISTRAL_MODEL_CHAT
MISTRAL_MODEL_EMBED MISTRAL_TIMEOUT_MS NEWS_SYNC_INTERVAL_MS NEWS_FETCH_TIMEOUT_MS
NEWS_MAX_ITEMS_PER_SOURCE NEWS_AI_CONCURRENCY
WORKBENCH_DEV_BACKEND_URL
```

Weitere Pfad-Defaults werden aus `workbench.local.json` in `settings.ts` übernommen. Secrets
bleiben in `.env` oder später im Secrets Broker. Extension Manifeste dürfen keine Secrets
enthalten.

## 5. Prozesse, Dienste und Runtimes

| Runtime/Dienst | Aktuelle Grenze | Plattformziel |
| --- | --- | --- |
| `workbench.service` | Fastify + statisches Web auf Loopback 3010 | Kernel Host |
| `t3-code.service` | eigener T3-Prozess auf Loopback 3773 | Core Runtime, Built-in UI Extension |
| `code-server.service` | eigener Editorprozess auf Loopback 8080 | Core Runtime, Built-in UI Extension |
| `codexbar.service` | lokaler Usage-Adapter auf 18181 | Broker/Adapter, Usage Extension UI |
| `hermes-dashboard.service` | offizielle SPA als eigener Prozess | Core Runtime, Hermes Extension UI |
| `hermes-gateway.service` | bestehender externer User-Dienst | nicht ersetzen |
| Hermes Update Service/Timer | eigener Updatepfad mit Retry | Core Service Control Capability |
| Terminal PTY/tmux | stabile runtimeId, usergebundene Sessions | Core Terminal Runtime |
| Preview Devserver/tmux | user-owned Projektprozesse und Slot-Leases | Core Preview Runtime |
| Chromium/CDP | serverseitige Profile und Stream | Core Browser Runtime |

## 6. Skills und Agenteninfrastruktur

- `AGENTS.md` ist die zentrale Projektregel, `CLAUDE.md` verweist darauf.
- Der vorhandene Skill Editor liest einen konfigurierten globalen Harness-Ordner, validiert
  Frontmatter, speichert per Autosave und propagiert Symlinks an andere Harnesses.
- Im Repository liegt derzeit `.opencode/skills/t3-code-update/SKILL.md` als projektnaher Skill.
- `.commandcode/taste/taste.md` enthält ein weiteres Tool-Profil.
- Der Editor besitzt API-Endpunkte für Status, Tree, Lesen, Schreiben, Erstellen, Umbenennen,
  Löschen und Git-Workflow.
- Extension Skills werden über diese Infrastruktur mit Provenance und separater Aktivierung
  integriert. Es entsteht kein zweites unabhängiges Skill-System.

## 7. Notifications

Der Vertrag enthält geschlossene Quellen:

```text
hermes, t3, opencode, codex, claude, terminal, workbench, update
```

Icons sind noch enger geschlossen:

```text
t3, hermes, opencode, codex, claude, terminal, workbench
```

Notification Kind bleibt bereits ein freier namespaced-fähiger String. Daten liegen zentral in
SQLite, Live-Zustellung läuft per WebSocket und Push-Abos sind identitätsgebunden. Die Migration
erweitert Source und Icon auf stabile `sourceId`-/Extension-Referenzen, ohne alte Einträge
unlesbar zu machen.

## 8. Globales CSS und Designabhängigkeiten

`apps/web/src/index.css` umfasst 5.819 Zeilen und 508.350 Bytes. Der `@theme`-Block ist die
einzige allgemeine Quelle für Palette, Surface Rollen, Typografie, Spacing, Radien, Motion,
Focus, Icons und Syntaxfarben. Danach folgen globale Featureblöcke unter anderem für:

```text
Hermes Shell, Tech TLDRs, Orbit, Mobile Navigation, Galerie, Projektbrowser,
Dateimanager, Quick Look, Preview Hub, Preview-Fenster, Preview-Kontextinsel,
Usage
```

Die Extension-Migration darf diese Datei nicht gleichzeitig neu schreiben. Reihenfolge:
semantische Tokens, bestehende Primitives konsolidieren, `@workbench/extension-ui` extrahieren,
danach Styles featureweise scopen.

## 9. Performance Baseline

Messung auf demselben Host mit Produktionsbuild und isoliertem Testserver auf Port 43100. Der
Server nutzte eine temporäre Config, Datenbank und Datenverzeichnisse. Kein Nutzer-Preview,
Preview-Slot oder produktiver Dienst wurde verändert. Browsermessungen erfolgten mit dem
Playwright MCP bei 1280 x 720.

| Kennzahl | Baseline | Methode |
| --- | ---: | --- |
| Voller `pnpm build` | 28,13 s | Contracts, Server, Web und Kompression |
| Vite Buildanteil | 0,954 s | 533 transformierte Module |
| Server Boot bis Health | 1.061 ms | isolierter Prozessstart bis erster HTTP 200 |
| Main JS | 477,33 kB raw, 143,90 kB gzip | aktueller `index` Chunk |
| Initial Module Preload | 125,51 kB raw, 34,07 kB gzip | React Router/Runtime Chunk |
| Global CSS | 496,78 kB raw, 100,61 kB gzip | aktueller `index` CSS Chunk |
| Initialer Browsertransfer | 448.907 Bytes, 50 Ressourcen | Navigation Performance API |
| DOM Content Loaded | 221 ms | Navigation Timing |
| Load Event | 226 ms | Navigation Timing |
| First Contentful Paint | 472 ms | Paint Timing |
| Sidebar Render | spätestens 472 ms | Sidebar in erstem Snapshot sichtbar, FCP als obere Grenze |
| Kalter Settings-Wechsel | 373 ms | Klick bis Heading plus zwei Animation Frames |
| Kalter Orbit Load | 416 ms | Klick bis `.orbit-page` plus zwei Frames |
| Orbit API innerhalb des Loads | 15,6 ms | Resource Timing |
| Bereits gemountete Rückroute | 61 ms | Persistent Route bis sichtbares Dashboard |
| Browser JS Heap | 14,93 MB used | `performance.memory` nach initialem Dashboard |
| Server RSS | 288,24 MB | Operational Metrics nach kontrollierten Requests |
| Server Heap | 74,24 MB used | Operational Metrics |
| Health API p95 | 1,746 ms | 100 serielle Loopback Requests |
| Projects API p95 | 1,379 ms | 100 serielle authentifizierte Loopback Requests |

Der Dist-Ordner ist wegen `emptyOutDir: false` kumulativ 428 MB groß. Das ist nicht die initiale
Payload, aber für Extension-Asset-Retention und spätere Cache-Bereinigung relevant.

## 10. Migrationsfolgerungen

1. Phase 1 trennt neue Extension Contracts in ein eigenes Package, statt `contracts/index.ts`
   weiter zu vergrößern. Core-Verträge importieren daraus nur stabile öffentliche Typen.
2. Phase 2 führt zuerst reine Registries und Legacy Built-in Contributions ein. Die UI bleibt
   dabei visuell und funktional gleich.
3. Phase 3 ersetzt die vier parallelen Routendarstellungen gemeinsam: `App.tsx`, Loader,
   Navigation und Mobile Path Map. Persistenz- und Stale-Chunk-Tests sind Exit Gates.
4. Orbit folgt erst danach, weil Schema V8, Revisionen, Backups und Renderer mehr Datenrisiko
   als die Navigation besitzen.
5. Der Server Extension Manager wird vor Capability Brokern eingeführt, aktiviert zunächst aber
   nur deklarative/Legacy Contributions.
6. Tech TLDRs bleibt der Canary. News API, News SQLite und Scheduler wechseln erst, wenn Storage,
   Network, Settings, Jobs und RPC als generische Capabilities verifiziert sind.
7. Preview, Terminal, T3, code-server, Chromium und Hermes werden zuletzt auf der UI-Seite
   migriert. Ihre Runtime- und Proxy-Grenzen bleiben Kernel.
