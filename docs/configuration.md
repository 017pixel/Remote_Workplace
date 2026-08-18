# Konfiguration

## Zentrale Personalisierung: `config/workbench.local.json`

Alle **persönlichen** Werte leben gebündelt in einer einzigen, gitignorierten Datei:
`config/workbench.local.json` (Vorlage: `config/workbench.example.json`). Sie ist die primäre
Konfigurationsquelle für alles Umgebungsspezifische:

- `branding` — Anzeigename der App (`appName`, `shortName`); fließt in Titel, Web-Manifest und Footer.
- `system` — Dienstbenutzer und Home-Verzeichnis.
- `tailscale` — Hostname, IP, HTTPS-Port und erlaubte Login-E-Mails (`allowedUsers`).
- `paths` — Projekt-Root, Orbit-Browser-Root, Terminal-Roots, Datenverzeichnis, Datenbank,
  Backups, Assets und Profile.
- `cli` — Pfade zu `codexbar`, `codex`, `opencode`, `claude`, `tmux`, `chromium`.
- `codexbar` — Pfad zur CodexBar-`config.json` und optionale OAuth-Profil-Homes.
- `dashboard` — serverseitige Sichtbarkeitsdefaults für Dashboard-Bereiche und Polling-Intervalle. Die lokale Oberfläche kann diese Bereiche zusätzlich pro Browser ausblenden.
- `notifications` — Aufbewahrung, Erkennungsschwellen sowie Toast- und Push-Regeln pro Quelle.
- `previews` — interne Loopback-Listener, zugehörige öffentliche Tailscale-HTTPS-Ports und die Feature-Flags der Preview-Laufzeit (siehe unten).
- `hermes` — Loopback-Dashboard, ACP-Chat, User-Units, Updatezeit und serverseitige Betriebsgrenzen.
- `opencodeWeb` — offizielle OpenCode-Web-UI als Loopback-Dienst hinter `/opencode`.

Der Server (`apps/server/src/config/settings.ts`) und der Vite-Build (`apps/web/vite.config.ts`)
lesen diese Datei beim Start; fehlt sie, wird auf `config/workbench.example.json` zurückgegriffen.
Die Werte aus dieser Config bilden die **Defaults**; eine gesetzte Umgebungsvariable in `.env`
überschreibt den jeweiligen Einzelwert.

## Hermes Agent

Hermes wird nicht in den Workbench-Checkout verschoben. `hermes-agent` bleibt das Git-Repository,
das `hermes update` aktualisiert; `homeDirectory` bleibt die Quelle für Sessions, Telegram, Cron,
Memory, Skills und Provider-Konfiguration. Der Workbench-Adapter speichert keine Hermes-Credentials.

```json
{
  "hermes": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 9119,
    "proxyPrefix": "/hermes",
    "updateTime": "04:15",
    "updateTimezone": "Europe/Berlin",
    "acpMaxSessions": 8,
    "acpIdleTimeoutSeconds": 3600
  }
}
```

Die Workbench öffnet Hermes ausschließlich in der offiziellen Hermes-SPA. Chat, Cron,
Einstellungen, Skills, Webhooks, Kanäle, Profile und weitere Funktionen laufen damit über
dieselbe eingebettete Oberfläche. Eine eigene Hermes-Agent-UI gibt es nicht mehr.

Die Installationsroutine erkennt CLI, Checkout, virtuelle Python-Umgebung und `HERMES_HOME` und
schreibt die erkannten Pfade atomar in die lokale Config. `host` muss Loopback sein, `port` darf
nicht mit Workbench, T3 oder Preview-Ports kollidieren. Die Verwaltung läuft über den geschützten
Pfad `/hermes`; deren sichtbarer Chat verwendet die offiziellen Hermes-WebSockets unter
`/hermes/api/pty`, `/hermes/api/ws` und `/hermes/api/events`. Die ACP-Bridge unter
`/api/v1/hermes/chat` bleibt für interne Hintergrundaufgaben verfügbar und ist kein
zweiter sichtbarer Chat.

Folgende Env-Variablen können die nicht-sensiblen Defaults überschreiben:

```dotenv
HERMES_ENABLED=true
HERMES_HOST=127.0.0.1
HERMES_PORT=9119
HERMES_CLI_PATH=/home/your-user/.local/bin/hermes
HERMES_HOME=/home/your-user/.hermes
HERMES_PROXY_PREFIX=/hermes
HERMES_DASHBOARD_UNIT=hermes-dashboard.service
HERMES_GATEWAY_UNIT=hermes-gateway.service
HERMES_UPDATE_UNIT=hermes-update.service
```

`HERMES_HOME` enthält die sensible Hermes-Konfiguration und bleibt außerhalb des Repositories.
Die Dienste werden immer als User-Units mit `systemctl --user` gesteuert. `sudo`, Root-Helper und
eine systemweite Unit gehören nicht zum Hermes-Integrationspfad.

## OpenCode Web

Die offizielle OpenCode-Web-UI läuft als eigene User-Unit `opencode-web.service` auf Loopback und
wird ausschließlich über `/opencode` in die Workbench eingebettet. Die CLI und die Web-UI verwenden
dasselbe OpenCode-Home; Sessions, Verlauf und der aktive Account bleiben dadurch kompatibel.

```json
{
  "opencodeWeb": {
    "host": "127.0.0.1",
    "port": 3774,
    "cliPath": "/home/your-user/.npm-global/bin/opencode",
    "serviceUnit": "opencode-web.service",
    "stopTimeoutSeconds": 20,
    "portTimeoutSeconds": 30,
    "healthTimeoutSeconds": 60
  }
}
```

`host` muss Loopback sein. Der Dienst hat bewusst kein eigenes Passwort, weil er nicht direkt
veröffentlicht wird; der Workbench-Proxy prüft die erlaubte Tailscale-Identität. Bei einem Backend-
Neustart stellt `scripts/sync-opencode-web.sh` die Unit sicher, beendet veraltete Prozesse und
wartet auf den HTTP-Healthcheck. Die Unit wird mit `scripts/install-opencode-web-unit.sh` installiert.
Nach Änderungen an Port oder Binary ist ein Backend-Neustart erforderlich.

## Inbox und Benachrichtigungen

Die Inbox liest T3 Code defensiv aus dessen eigener SQLite-Projektion und ergänzt die Ergebnisse
um Hermes- sowie Terminal-/CLI-Ereignisse. `notifications.pollSeconds` steuert das serverseitige
Intervall. Die Mindestlaufzeiten liegen zentral in `terminalMinimumSeconds`,
`agentMinimumSeconds`, `t3CompletionMinimumSeconds`, `t3MiniTaskSeconds` und
`hermesCompletionMinimumSeconds`. Aktive ungelesene Einträge bleiben erhalten; erledigte,
verworfene und normale gelesene Einträge werden nach `pruneAfterHours` entfernt.

Unter `notifications.preferences` lassen sich Toasts und Web-Push global sowie pro Quelle
schalten. `pushEnabled` ist ausschließlich der globale Server-Master-Schalter. Ob das gerade
verwendete Gerät abonniert ist, entscheidet dessen lokale Push-Subscription und nicht dieser
Konfigurationswert. Geräte werden in den Einstellungen unabhängig aktiviert, getestet und
deaktiviert; das Entfernen eines Endpoints verändert keine anderen Geräte.

Hermes meldet neben dem Ergebnis (`hermes.result`) auch den kompletten Task-Lebenszyklus:
`hermes.started` beim Start einer geplanten Cron-Aufgabe, `hermes.approval`, sobald eine
Freigabe benötigt wird (bei hohem Risiko als Fehlerstufe), sowie `hermes.update` für
Update-Läufe. Freigaben landen zusätzlich als Push mit langer Laufzeit (24 Stunden), Start- und
Ergebnis-Meldungen mit einer Stunde.

## Hermes-Modell

Das Standardmodell liegt in der Hermes-eigenen Konfiguration (`~/.hermes/config.yaml`), nicht in
der Workbench. Die Workbench liest es nur an und zeigt es in der Kopfzeile an. Der Wechsel auf
einen OpenAI-kompatiblen Provider (etwa DeepSeek V4 Flash über den OpenCode-Go-Key) erfolgt dort
als benannter Provider:

```yaml
model:
  default: deepseek-v4-flash
  provider: custom:opencode.go.ai
fallback_providers:
  - custom:api.mistral.ai
custom_providers:
  - name: Opencode.go.ai
    base_url: https://opencode.ai/zen/go/v1
    api_key: <OpenCode-Go-Key>
    model: deepseek-v4-flash
```

API-Schlüssel bleiben ausschließlich in `HERMES_HOME`; die Workbench speichert keine
Hermes-Credentials und schreibt sie weder in Logs noch in Browserzustand.

Web-Push benötigt den privaten HTTPS-Origin und einen aktiven Service Worker unter
`/workbench/`. Die Berechtigung wird ausschließlich nach einem Klick auf „Auf diesem Gerät
aktivieren“ angefragt. Android unterstützt denselben Standard sowohl im geeigneten Browser als
auch in der installierten PWA. Auf iPadOS funktioniert Web-Push nur, wenn die PWA vorher über
„Teilen → Zum Home-Bildschirm“ installiert und anschließend vom Home-Bildschirm gestartet wurde.

Das VAPID-Schlüsselpaar wird beim ersten Start mit Dateirechten `0600` unter
`<paths.dataDir>/notifications/vapid.json` erzeugt und bei jedem weiteren Start wiederverwendet.
Diese Datei gehört zusammen mit der externen Workbench-SQLite-Datenbank in die Datensicherung.
Wird sie ersetzt, erkennt der Browser den Schlüsselwechsel und erneuert ein bereits erlaubtes
Abo. Der private Schlüssel bleibt ausschließlich im Fastify-Server; das Frontend erhält nur den
öffentlichen VAPID-Schlüssel.

Push-Abos liegen selbst gehostet in der externen Workbench-SQLite-Datenbank. Es gibt keinen
externen Backend- oder Push-Datenbankdienst. Die standardisierte Push API nutzt dennoch den vom
Browser vorgegebenen Zustelldienst. Deshalb muss der Server ausgehende HTTPS-Verbindungen zu den
Subscription-Endpoints erlauben. Für Apple-Geräte darf insbesondere `*.push.apple.com` nicht
durch DNS-, Proxy- oder Firewallregeln blockiert sein.

## Umgebungsvariablen (`.env`)

Die `.env` (Vorlage `.env.example`) enthält nur **Secrets und neutrale Runtime-Knöpfe**: Host, Port,
Config-Verzeichnis, Web-Build-Verzeichnis, Log-Level sowie Cache-/Timeout-Werte. Der Mistral-Schlüssel für Tech TLDRs ist das einzige zusätzliche Secret und bleibt ausschließlich in der ignorierten `.env`. Persönliche Pfade und Identität gehören **nicht** in die `.env`, sondern nach `config/workbench.local.json`.

Der Request-Limiter schützt ausschließlich `/api/**`. Editor, Vite-Module und deren WebSockets laufen unter `/editor/**` und sind bewusst ausgenommen, weil schon ein normaler Modulgraph mehr als 180 Requests erzeugen kann. code-server darf WebSocket-Frames bis 16 MiB übertragen; das Terminal validiert seine Eingaben unabhängig davon weiterhin auf höchstens 64 KiB.

Der Produktionsserver überträgt geeignete Antworten ab 1 KiB per Brotli oder Gzip und cached Vite-Dateien unter `/assets/` ein Jahr lang als `immutable`, weil ihre Dateinamen einen Inhalts-Hash tragen. `index.html` und `sw.js` werden dagegen bei jeder Nutzung revalidiert. Diese Optimierungen greifen nach dem Produktionsbuild und einem Neustart des Workbench-Dienstes.

```dotenv
COMPRESSION_THRESHOLD_BYTES=1024
BROTLI_QUALITY=4
```

Qualitätsstufe 4 hält Buildzeit und Dateigröße in einem guten Verhältnis. Der Produktionsbuild erzeugt `.br`- und `.gz`-Varianten vorab; dynamische API-Antworten verwenden dieselben Werte, falls sie groß genug sind.

## Dashboard

Der Abschnitt `dashboard` in `config/workbench.local.json` steuert, welche Bereiche der Server an die Oberfläche freigibt und wie oft die Live-Daten abgefragt werden. Die Schlüssel unter `sections` sind `quickActions`, `server`, `metrics`, `services`, `runtime`, `diagnostics`, `usage`, `news` und `commands`. Die Intervalle unter `refresh` werden in Millisekunden angegeben und serverseitig begrenzt.

Die Schalter unter Einstellungen → Dashboard gelten nur für den aktuellen Browser und werden in `localStorage` gespeichert. Ein Bereich, der in `dashboard.sections` auf `false` steht, bleibt auch dort gesperrt. Nach Änderungen an der zentralen Config ist ein Backend-Neustart erforderlich.

```dotenv
API_RATE_LIMIT_MAX=180
WEBSOCKET_MAX_PAYLOAD_BYTES=16777216
```

## Projekte

Alle direkten Unterordner aus `paths.projectsRoot` in `config/workbench.local.json` werden automatisch als Projekte erkannt. Die Projekte-Seite fragt diese Liste live über die API ab und benötigt keine hardcodierten Projektnamen. `config/projects.local.json` wird von Git ignoriert und kann für ausgewählte Projekte ergänzend feste IDs, Anzeigenamen, Beschreibungen, Reihenfolge und Previews liefern. Jede explizite Projekt-ID muss lowercase kebab-case und eindeutig sein; Pfade müssen absolut sein. Mit `PROJECT_DISCOVERY_ENABLED=false` kann die automatische Erkennung abgeschaltet werden.

Der Orbit-Projektbrowser kann zusätzlich alle Dateien und Ordner unter einer eigenen, read-only durchsuchten Root anzeigen. Nur echte lesbare Unterordner dürfen als Projekt registriert werden; die Root selbst, Dateien und symbolische Verweise sind ausgeschlossen. Verzeichnisantworten werden für große Ordner paginiert und liefern ausschließlich Namen sowie Metadaten, niemals Dateiinhalte.

```dotenv
PROJECT_DISCOVERY_ENABLED=true
ORBIT_PROJECT_BROWSER_ROOT=/home/your-user
ORBIT_PROJECT_BROWSER_PAGE_SIZE=300
ORBIT_RECENT_PROJECT_LIMIT=8
```

Der Projektpfad wird zentral konfiguriert:

```json
{
  "paths": {
    "projectsRoot": "/home/your-user/projects"
  }
}
```

Manuell ausgewählte Ordner werden in der lokalen `DATABASE_PATH`-SQLite-Datei gespeichert. Ihre stabilen Projekt-IDs bleiben über Browser- und Serverneustarts erhalten. Die erlaubte Browser-Root muss absolut sein; die Seitengröße liegt zwischen 1 und 500.

Projekt-Previews können entweder eine öffentliche `url` oder einen lokalen `targetPort` plus optionalen Root-Pfad enthalten. Lokale Ziele laufen immer direkt im iframe über einen freien Preview-Slot am Root. Das ältere Feld `runtime` wird aus Kompatibilitätsgründen weiterhin akzeptiert, beeinflusst die Preview-Laufzeit aber nicht mehr. Vite benötigt weder `base` noch einen gepflegten `allowedHosts`-Eintrag, weil der Proxy den Host-Header auf `127.0.0.1:PORT` umschreibt.

Der Preview Hub erkennt die Projektlaufzeit aus Paketmanager, Workspaces, `package.json`-Scripts
und bekannten Framework-Abhängigkeiten. Frontend, Backend, API, WebSocket, lokale Datenbank und
Worker können als getrennte Prozesse gemeinsam in einer benutzer- und projektgebundenen
tmux-Sitzung laufen. Diese Sitzung bleibt bei einem Backend-Neustart aktiv. Reicht die Erkennung
nicht aus, beschreibt `preview.config.json` im Projektroot die Dienste explizit; das vollständige
Format steht im Agenten-Skill `preview-config`.

Der Hub hält mehrere Projekt-Tabs gleichzeitig offen. Automatisch erkannte Browserdienste erhalten
beim Start freie Ports aus `previews.allowedProjectPorts`; die tatsächliche Zuordnung liegt an der
tmux-Sitzung und bleibt bei einem Backend-Neustart erhalten. Explizite Konfigurationen der Version 1
behalten feste Zahlenports. Version 2 erlaubt `"port": "auto"`, wenn auch ein manuell beschriebener
Dienst konfliktfrei neben anderen Projekten laufen soll. Das Schließen eines Tabs stoppt keine Laufzeit.

Das Hauptziel wird pro Benutzer gespeichert und beim Öffnen zusammen mit seinen HTTP- und
WebSocket-Abhängigkeiten über Preview-Slots veröffentlicht. „Im neuen Tab öffnen“ verwendet die
direkte Tailscale-/Slot-URL. Die Workbench-Hülle mit Gerätewerkzeugen bleibt eine erweiterte
Option. Als Dienstport ist nur ein Wert aus `previews.allowedProjectPorts` oder die Auto-Zuweisung
einer Version-2-Konfiguration zulässig.

Die Arrays `previews.slotPorts` und `previews.publicPorts` müssen gleich lang und jeweils eindeutig sein. Nach einer Änderung muss `deploy/proxy/configure-tailscale-serve.sh` einmal mit sudo ausgeführt werden. Die voreingestellten zwölf Paare sind `3901–3912` intern und `8451–8462` öffentlich. Bestätigte Begleitdienste eines Projekts erhalten eigene HTTPS-Slots; die Haupt-Preview schreibt lokale HTTP-, Fetch-, XHR-, EventSource- und WebSocket-Ziele auf diese Tailscale-Adressen um. Web Storage ist portgetrennt; Cookies kennen keine Ports und bleiben auf demselben Host geteilt.

Bei Multi-Page-Apps kann `path` direkt auf den gewünschten Einstieg zeigen, zum Beispiel
`/anmeldung/`. Der Devserver bleibt trotzdem am Root des jeweiligen Slot-Origins erreichbar.

## Dienste

`config/services.local.json` enthält Name, Modus, optionale öffentliche Browser-URL und einen festen Check:

- `systemd`: führt ausschließlich `systemctl is-active <validierte-unit.service>` aus.
- `http`: fester serverseitiger GET-Healthcheck.
- `tailscale`: führt ausschließlich `tailscale status --json` aus.
- `self`: Backendprozess gilt nach erfolgreichem Request als aktiv.
- `none`: klarer inaktiver Zustand mit Begründung.

Interne Healthcheck-URLs werden nie an den Browser gesendet. Öffentliche URLs dürfen nicht localhost sein.

## Commands

`config/commands.example.json` ist eine reine Kopierreferenz. Das Backend liefert Text aus, führt ihn aber niemals aus. Es existiert absichtlich kein POST-Endpunkt und kein allgemeiner Command-Runner.

## Priorität

Für jeden Bereich wird zuerst `*.local.json` gelesen. Fehlt die lokale Datei, dient `*.example.json` als struktureller Fallback. Ungültige JSON- oder Zod-Daten verhindern den Serverstart, statt mit unsicheren Annahmen fortzufahren.

## CodexBar

Die Limitanzeige verwendet ausschließlich den lokalen CodexBar-Dienst. Die folgenden optionalen Backend-Variablen bleiben auf Loopback beschränkt:

```dotenv
CODEXBAR_BASE_URL=http://127.0.0.1:18181
CODEXBAR_CACHE_MS=60000
CODEXBAR_TIMEOUT_MS=35000
```

Wenn CodexBar das 5-Stunden-Fenster trotz vorhandener OAuth-Antwort nicht liefert, kann der explizite Fallback aktiviert werden. Er liest ausschließlich die in `CODEX_OAUTH_PROFILE_HOMES` genannten lokalen Codex-Profile im Speicher und fragt nur die Nutzungsgrenzen ab. Ein Fenster wird nur ergänzt, wenn OpenAI tatsächlich ein 300-Minuten-Limit liefert; Wochenlimits werden nie dupliziert. Der Fallback schreibt, protokolliert oder übermittelt keine Zugangstoken an den Browser.

```dotenv
CODEX_OAUTH_PRIMARY_FALLBACK=true
CODEX_OAUTH_PROFILE_HOMES=/absoluter/pfad/zum/.codex,/absoluter/pfad/zum/zweiten-codex-profil
CODEX_OAUTH_TIMEOUT_MS=5000
```

Der Dienst wird über `deploy/systemd/install-codexbar.sh` als `codexbar.service` eingerichtet. Er läuft als Dienstbenutzer, bindet ausschließlich an `127.0.0.1` und ist nicht öffentlich weitergeleitet.

Die Statistikseite verwendet zusätzlich die lokale CLI für die nach Projekten gruppierte Kostenhistorie. Historie, Abfrageintervall und isolierte Accountprofile werden zentral konfiguriert:

```dotenv
CODEXBAR_CLI_PATH=/home/your-user/.local/bin/codexbar
DATABASE_PATH=/home/your-user/.local/share/remote-workplace/workbench.sqlite
USAGE_SNAPSHOT_INTERVAL_MS=300000
WORKBENCH_PROFILES_ROOT=/home/your-user/.workbench-profiles
CODEXBAR_CONFIG_PATH=/home/your-user/.config/codexbar/config.json
CODEX_SHARED_HOME=/home/your-user/.codex
CLAUDE_SHARED_HOME=/home/your-user/.claude
OPENCODE_SHARED_HOME=/home/your-user/.local/share/opencode
```

Die SQLite-Datei und angelegte Profile enthalten lokale, nicht zu veröffentlichende Laufzeitdaten. Ein Account-Entfernen verändert nur die Registry und die CodexBar-Profilzuordnung; vorhandene CLI-Credentials werden nie gelöscht.

## Browser und lokale Ports

Der integrierte Browser sucht mit `CHROMIUM_PATH=auto` zuerst in lokalen Playwright- und Puppeteer-Caches und danach nach einer systemweit installierten Chromium- oder Chrome-Binärdatei. Ein fester absoluter Pfad kann `auto` ersetzen. Sitzungszahl, Start und Leerlauf sowie Portprüfung sind zentral konfiguriert:

```dotenv
CHROMIUM_PATH=auto
BROWSER_MAX_SESSIONS=6
BROWSER_PROFILES_ROOT=/home/your-user/.local/share/remote-workplace/browser-profiles
BROWSER_STARTUP_TIMEOUT_MS=15000
BROWSER_IDLE_TIMEOUT_MS=1800000
LOCAL_PORT_CACHE_MS=5000
LOCAL_PORT_PROBE_TIMEOUT_MS=450
```

Die Profilwurzel liegt außerhalb des Repositorys. Darunter gespeicherte Cookies, Tokens und Website-Daten sind sensible Laufzeitdaten und müssen mit denselben Rechten wie CLI-Anmeldungen geschützt und aus Quellcode-Backups ausgeschlossen werden. Der Port-Scanner liest ausschließlich lokale TCP-Listener und prüft sie gegen Loopback. Er öffnet keine externen Netzwerkziele. Die Browser- und Terminal-WebSockets benötigen eine erlaubte Tailscale-Identität und einen identischen Workbench-Origin.

## Preview-Slots, Gateway und Diagnose

Lokale Previews laufen als direkte iframes über dedizierte Slot-Origins. Alle Teilfunktionen
lassen sich einzeln aktivieren und wieder zurückrollen, ohne Daten zu verlieren:

```json
{
  "previews": {
    "allowedProjectPorts": [1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040],
    "npmExecutable": "npm",
    "devServerLogBytes": 131072,
    "devServerStartTimeoutMs": 15000,
    "slotPorts": [3901, 3902, 3903, 3904, 3905, 3906, 3907, 3908, 3909, 3910, 3911, 3912],
    "publicPorts": [8451, 8452, 8453, 8454, 8455, 8456, 8457, 8458, 8459, 8460, 8461, 8462],
    "gatewayV2Enabled": false,
    "bridgeEnabled": false,
    "diagnosticsEnabled": false,
    "storageSyncMode": "off",
    "slotResetEnabled": false,
    "maxInjectableHtmlBytes": 2097152,
    "diagnosticRetentionDays": 7,
    "diagnosticMaxEventBytes": 65536,
    "diagnosticMaxBatchBytes": 262144,
    "localStorageMaxBytes": 262144,
    "localStorageMaxKeys": 1000
  }
}
```

- `gatewayV2Enabled` — atomarer Routing-Snapshot, gezielte Embedding-Anpassung statt pauschalem
  Entfernen von CSP und `X-Frame-Options`, Header- und Redirect-Regeln. `false` verwendet den
  bisherigen Gateway.
- `bridgeEnabled` — injiziert das externe Bridge-Script `/__workbench/preview-bridge.v1.js`
  in HTML-Antworten (nur zusammen mit `gatewayV2Enabled`).
- `diagnosticsEnabled` — Client- und Gatewaydiagnose samt redigierten JSONL-Logs unter
  `<paths.dataDir>/preview-logs/` (Verzeichnis `0700`, Dateien `0600`).
- `storageSyncMode` — `off` oder `opt-in`. Nur `opt-in` erlaubt localStorage-Snapshots, und
  auch dann bleiben sie pro Preview standardmäßig aus.
- `slotResetEnabled` — erlaubt den verifizierten Storage-Reset einer Slot-Origin. Ohne
  bestandene Verifikation bleibt der Slot in Quarantäne.
- `allowedProjectPorts` — einzige Ports, die beaufsichtigte HTTP- und WebSocket-Dienste verwenden
  dürfen; die Reihenfolge bestimmt zugleich die automatische Vergabe.
- `npmExecutable` — bleibt als kompatibles Altfeld akzeptiert. Die neue Erkennung wählt npm,
  pnpm, Yarn oder Bun aus `packageManager` und Lockdatei des Projekts.
- `devServerLogBytes` — maximale Größe des pro Dienst aus dem tmux-Pane gelesenen Log-Ausschnitts.
- `devServerStartTimeoutMs` — Zeitfenster für Supervisor- und optionale Setup-Schritte.

Jeder Wert lässt sich per Umgebungsvariable überschreiben (`PREVIEW_GATEWAY_V2`,
`PREVIEW_BRIDGE`, `PREVIEW_DIAGNOSTICS`, `PREVIEW_STORAGE_SYNC_MODE`, `PREVIEW_SLOT_RESET`,
`PREVIEW_MAX_INJECTABLE_HTML_BYTES`, `PREVIEW_DIAGNOSTIC_RETENTION_DAYS`,
`PREVIEW_DIAGNOSTIC_MAX_EVENT_BYTES`, `PREVIEW_DIAGNOSTIC_MAX_BATCH_BYTES`,
`PREVIEW_LOCAL_STORAGE_MAX_BYTES`, `PREVIEW_LOCAL_STORAGE_MAX_KEYS`,
`PREVIEW_DEV_SERVER_LOG_BYTES`,
`PREVIEW_DEV_SERVER_START_TIMEOUT_MS`).

Zwei Werte sind ausschließlich für Entwicklung und Tests gedacht:

```dotenv
# Slot-Origins als http://127.0.0.1:<internalPort> ausgeben statt HTTPS über Tailscale
PREVIEW_PUBLIC_ORIGIN_MODE=loopback-http
# Identität ohne vorgeschalteten Tailscale-Proxy (in Produktion leer lassen)
WORKBENCH_DEV_TAILSCALE_USER=user@example.com
```

Preview-Endpunkte verlangen immer eine erlaubte Tailscale-Identität aus
`tailscale.allowedUsers`; mutierende Aufrufe zusätzlich eine gültige Same-Origin-Anfrage.
Der lokale Doctor benutzt stattdessen ein Capability-Token
(`<paths.dataDir>/preview-agent-capability`, Modus `0600`) und wird nur über Loopback
akzeptiert. Snapshots werden mit AES-256-GCM verschlüsselt; der Schlüssel liegt in
`<paths.dataDir>/preview-storage.key`, das Log-Pseudonym nutzt
`<paths.dataDir>/preview-log-hmac.key`. Beide Dateien werden nie über eine API ausgegeben.

## Orbit Workspace

Der Orbit Workspace verwendet dieselbe `DATABASE_PATH`-Datei und legt darin ein aktuelles Dokument sowie eine unveränderliche Revisionshistorie an. Die Datenbank liegt in Produktion außerhalb des Repositorys, damit Builds, Codewechsel und Deployments sie nicht berühren. Zusätzlich wird jede erfolgreiche Revision als prüfsummengesicherte JSON-Datei im lokalen Backup-Verzeichnis abgelegt. Fehlt der Datenbankstand, stellt der Server automatisch die letzte intakte Sicherung wieder her.

```dotenv
ORBIT_SYNC_INTERVAL_MS=5000
ORBIT_DOCUMENT_MAX_BYTES=4194304
ORBIT_BACKUP_DIR=/home/your-user/.local/share/remote-workplace/orbit-backups
ORBIT_ASSET_DIR=/home/your-user/.local/share/remote-workplace/orbit-assets
ORBIT_ASSET_MAX_FILE_BYTES=104857600
ORBIT_ASSET_MAX_TOTAL_BYTES=53687091200
ORBIT_DESTRUCTIVE_DROP_PERCENT=50
```

`ORBIT_SYNC_INTERVAL_MS` darf zwischen einer und 60 Sekunden liegen. `ORBIT_DESTRUCTIVE_DROP_PERCENT` blockiert große automatische Rückgänge ab mindestens drei Knoten; der abgewiesene Entwurf wird trotzdem als Wiederherstellungsstand gesichert. Revisionskonflikte überschreiben niemals den neueren Serverstand. Die Vertragsgrenzen erlauben höchstens acht Boards, 600 Knoten, 1.200 Kanten und 96 Live-Werkzeuge pro Board. Projektdateien werden nur relativ zu einer bekannten Projekt-ID erstellt; absolute Pfade, Traversal und Symlink-Ausbrüche werden serverseitig abgewiesen.

Für mehrere Codex-Accounts wird pro Account ein separates Codex-Home mit eigener Anmeldung verwendet. Die absoluten Pfade liegen ausschließlich in der privaten CodexBar-Konfiguration (`~/.config/codexbar/config.json`) im Feld `codexProfileHomePaths`; Authentifizierungsdateien und diese Konfiguration gehören nicht ins Repository.

### Aktiver Account je Werkzeug

Serverweit ist je Werkzeug genau ein Account aktiv — für Codex, Claude Code und OpenCode. Umgeschaltet wird ausschließlich die Anmeldung: Die Anmeldedatei im gemeinsamen Home ist ein Symlink in den Anmeldespeicher des aktiven Accounts und wird beim Wechsel atomar umgehängt. Konfiguration, Sessions und Verlauf bleiben gemeinsam — es gibt weiterhin nur einen Projekt- und Sessionbestand. Jeder danach gestartete Prozess des Werkzeugs verwendet den neuen Account, auch außerhalb der Workbench (SSH, tmux, Skripte). Bereits laufende Prozesse behalten ihren Account, bis sie neu gestartet werden.

| Werkzeug | Gemeinsames Home (Standard) | Anmeldedatei | Config-Feld / Env |
|---|---|---|---|
| Codex | `<homeDirectory>/.codex` | `auth.json` | `paths.codexSharedHome` / `CODEX_SHARED_HOME` |
| Claude Code | `<homeDirectory>/.claude` | `.credentials.json` | `paths.claudeSharedHome` / `CLAUDE_SHARED_HOME` |
| OpenCode | `<homeDirectory>/.local/share/opencode` | `auth.json` | `paths.opencodeSharedHome` / `OPENCODE_SHARED_HOME` |

Codex und OpenCode lesen und schreiben ihre Anmeldedatei durch den Symlink hindurch, ohne ihn zu ersetzen; aufgefrischte Token landen damit im Anmeldespeicher des Accounts, dem sie gehören. Claude Code entfernt den Symlink beim Abmelden. Damit in keinem Fall Zugangsdaten verloren gehen, verlässt sich die Workbench nicht auf dieses Verhalten: Findet sie an der Stelle des Symlinks wieder eine reguläre Datei, übernimmt sie deren — neuere — Inhalte in den Anmeldespeicher des zuletzt aktivierten Accounts und hängt den Symlink neu ein. Die vorherige Fassung bleibt als `*.ersetzt-<Zeitstempel>` daneben liegen.

Ein gemeinsames Home ist selbst kein Account. Solange dort noch eine eigenständige Anmeldung liegt, wird sie zum Registrieren angeboten; beim ersten Aktivieren bekommt sie automatisch einen eigenen Anmeldespeicher unter `paths.workbenchProfilesRoot`. Danach taucht das gemeinsame Home nicht mehr in der Accountliste auf.

Umschalten geht über **Nutzung → Accounts → Aktivieren** oder über die Kommandozeile:

```bash
scripts/ki-account.sh                    # alle Accounts, der aktive ist je Werkzeug mit * markiert
scripts/ki-account.sh list claude        # nur ein Werkzeug anzeigen
scripts/ki-account.sh use arbeit         # per Name, E-Mail oder Profilpfad aktivieren
scripts/ki-account.sh use claude privat  # bei mehrdeutigen Namen das Werkzeug voranstellen
```

Lokale automatisierte Browsertests können den ansonsten von Tailscale Serve gesetzten Identitätsheader über den Vite-Proxy ergänzen. `WORKBENCH_DEV_TAILSCALE_USER` ist ausschließlich zusammen mit einem isolierten Test-Backend und einer separaten Datenbank zu verwenden. Der Produktionsserver wertet diese Variable nicht aus und akzeptiert weiterhin nur den tatsächlich am Request vorhandenen Tailscale-Header.

## Tech TLDRs

Die News-Pipeline verwendet dieselbe SQLite-Datei und wird zentral über `.env` konfiguriert. Der API-Key darf nie in Frontendvariablen, Logs oder Konfigurationsdateien des Browsers übernommen werden.

```dotenv
MISTRAL_API_KEY=
MISTRAL_API_BASE_URL=https://api.mistral.ai/v1
MISTRAL_MODEL_INGEST=mistral-small-2603
MISTRAL_MODEL_CHAT=mistral-medium-3-5
MISTRAL_MODEL_EMBED=mistral-embed-2312
NEWS_SYNC_INTERVAL_MS=1800000
NEWS_FETCH_TIMEOUT_MS=12000
NEWS_MAX_ITEMS_PER_SOURCE=16
NEWS_AI_CONCURRENCY=1
```

Free-Mode-Limits sind organisations- und modellabhängig. Die Workbench speichert keine festen Mistral-Limits, sondern verarbeitet Beiträge seriell, respektiert Rate-Limit-Antworten und lässt unverarbeitete Meldungen mit regelbasiertem TLDR sichtbar. Nach einer Änderung der Modell-IDs ist ein Neustart des Backends erforderlich.

## Codex- und OpenCode-Terminals

Die Agent-Terminals verwenden feste serverseitige CLI-Pfade und getrennte Prozesslimits. Diese Werte gehören in `.env`; der Browser kann sie weder lesen noch überschreiben.

```dotenv
CODEX_CLI_PATH=/home/your-user/.local/bin/codex
OPENCODE_CLI_PATH=/home/your-user/.npm-global/bin/opencode
CLAUDE_CLI_PATH=/home/your-user/.local/bin/claude
CODEX_MAX_SESSIONS=12
OPENCODE_MAX_SESSIONS=12
CLAUDE_MAX_SESSIONS=4
TERMINAL_SUPERVISOR=tmux
TMUX_PATH=/usr/bin/tmux
```

Alle drei Programme starten ohne automatische Bypass- oder Auto-Approve-Optionen. Projektpfade werden wie beim normalen Terminal ausschließlich aus einer validierten Projekt-ID ermittelt. Claude Code nutzt für das Standardkonto die vorhandene Anmeldung unter `~/.claude`; isolierte Zusatzprofile werden über `CLAUDE_CONFIG_DIR` getrennt.
