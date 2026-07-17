# Konfiguration

## Zentrale Umgebungsvariablen

Alle globalen Laufzeitwerte liegen in `.env`; die Vorlage ist `.env.example`. Wichtig sind Host, Port, Config-Verzeichnis, Web-Build-Verzeichnis, Log-Level und Cache-/Timeout-Werte. Der Mistral-Schlüssel für Tech TLDRs ist das einzige zusätzliche Secret und bleibt ausschließlich in der ignorierten `.env`.

Der Request-Limiter schützt ausschließlich `/api/**`. Editor, Vite-Module und deren WebSockets laufen unter `/editor/**` und sind bewusst ausgenommen, weil schon ein normaler Modulgraph mehr als 180 Requests erzeugen kann. code-server darf WebSocket-Frames bis 16 MiB übertragen; das Terminal validiert seine Eingaben unabhängig davon weiterhin auf höchstens 64 KiB.

Der Produktionsserver überträgt geeignete Antworten ab 1 KiB per Brotli oder Gzip und cached Vite-Dateien unter `/assets/` ein Jahr lang als `immutable`, weil ihre Dateinamen einen Inhalts-Hash tragen. `index.html` und `sw.js` werden dagegen bei jeder Nutzung revalidiert. Diese Optimierungen greifen nach dem Produktionsbuild und einem Neustart des Workbench-Dienstes.

```dotenv
COMPRESSION_THRESHOLD_BYTES=1024
BROTLI_QUALITY=4
```

Qualitätsstufe 4 hält Buildzeit und Dateigröße in einem guten Verhältnis. Der Produktionsbuild erzeugt `.br`- und `.gz`-Varianten vorab; dynamische API-Antworten verwenden dieselben Werte, falls sie groß genug sind.

```dotenv
API_RATE_LIMIT_MAX=180
WEBSOCKET_MAX_PAYLOAD_BYTES=16777216
```

## Projekte

Alle direkten Unterordner aus `PROJECTS_ROOT` werden automatisch als Projekte erkannt. `config/projects.local.json` wird von Git ignoriert und ergänzt für ausgewählte Projekte feste IDs, Anzeigenamen, Beschreibungen, Reihenfolge und Previews. Jede explizite Projekt-ID muss lowercase kebab-case und eindeutig sein; Pfade müssen absolut sein. Mit `PROJECT_DISCOVERY_ENABLED=false` kann die automatische Erkennung abgeschaltet werden.

Preview-URLs müssen vom Benutzergerät per HTTPS erreichbar sein und dürfen nicht auf localhost zeigen. Für Vite-Projekte mit absoluten Pfaden wird der WebSocket-fähige code-server-Pfad `https://HOST:8443/editor/absproxy/PORT/` verwendet. Der Modus ist `embedded`, `external` oder `hybrid`.

Vite muss mit derselben Basis gestartet werden, zum Beispiel `vite --base /editor/absproxy/1234/`. code-server erhält dazu `abs-proxy-base-path: /editor`. Dadurch landen Assets, Routerpfade und HMR-WebSockets auch hinter beiden Reverse-Proxies am richtigen Ziel. Die Iframes delegieren nur Browser-Vollbild; Firefox-spezifisch unbekannte `clipboard-read`-/`clipboard-write`-Feature-Policy-Tokens werden nicht gesetzt.

Wenn die Root-HTML nur über einen absoluten Meta-Refresh weiterleitet, wird direkt die eigentliche Seite konfiguriert, zum Beispiel `/editor/absproxy/1234/anmeldung/`. So bleibt auch die erste Navigation innerhalb des Proxy-Pfads.

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

Der Dienst wird über `deploy/systemd/install-codexbar.sh` als `codexbar.service` eingerichtet. Er läuft als Benutzer `bbecker`, bindet ausschließlich an `127.0.0.1` und ist nicht öffentlich weitergeleitet.

Die Statistikseite verwendet zusätzlich die lokale CLI für die nach Projekten gruppierte Kostenhistorie. Historie, Abfrageintervall und isolierte Accountprofile werden zentral konfiguriert:

```dotenv
CODEXBAR_CLI_PATH=/home/bbecker/.local/bin/codexbar
DATABASE_PATH=/home/bbecker/.local/share/remote-workplace/workbench.sqlite
USAGE_SNAPSHOT_INTERVAL_MS=300000
WORKBENCH_PROFILES_ROOT=/home/bbecker/.workbench-profiles
CODEXBAR_CONFIG_PATH=/home/bbecker/.config/codexbar/config.json
```

Die SQLite-Datei und angelegte Profile enthalten lokale, nicht zu veröffentlichende Laufzeitdaten. Ein Account-Entfernen verändert nur die Registry und die CodexBar-Profilzuordnung; vorhandene CLI-Credentials werden nie gelöscht.

## Browser und lokale Ports

Der integrierte Browser sucht mit `CHROMIUM_PATH=auto` zuerst in lokalen Playwright- und Puppeteer-Caches und danach nach einer systemweit installierten Chromium- oder Chrome-Binärdatei. Ein fester absoluter Pfad kann `auto` ersetzen. Sitzungszahl, Start und Leerlauf sowie Portprüfung sind zentral konfiguriert:

```dotenv
CHROMIUM_PATH=auto
BROWSER_MAX_SESSIONS=4
BROWSER_STARTUP_TIMEOUT_MS=15000
BROWSER_IDLE_TIMEOUT_MS=1800000
LOCAL_PORT_CACHE_MS=5000
LOCAL_PORT_PROBE_TIMEOUT_MS=450
```

Der Port-Scanner liest ausschließlich lokale TCP-Listener und prüft sie gegen Loopback. Er öffnet keine externen Netzwerkziele. Die Browser- und Terminal-WebSockets benötigen eine erlaubte Tailscale-Identität.

## Orbit Workspace

Der Orbit Workspace verwendet dieselbe `DATABASE_PATH`-Datei und legt darin ein aktuelles Dokument sowie eine unveränderliche Revisionshistorie an. Die Datenbank liegt in Produktion außerhalb des Repositorys, damit Builds, Codewechsel und Deployments sie nicht berühren. Zusätzlich wird jede erfolgreiche Revision als prüfsummengesicherte JSON-Datei im lokalen Backup-Verzeichnis abgelegt. Fehlt der Datenbankstand, stellt der Server automatisch die letzte intakte Sicherung wieder her.

```dotenv
ORBIT_SYNC_INTERVAL_MS=5000
ORBIT_DOCUMENT_MAX_BYTES=4194304
ORBIT_BACKUP_DIR=/home/bbecker/.local/share/remote-workplace/orbit-backups
ORBIT_DESTRUCTIVE_DROP_PERCENT=50
```

`ORBIT_SYNC_INTERVAL_MS` darf zwischen einer und 60 Sekunden liegen. `ORBIT_DESTRUCTIVE_DROP_PERCENT` blockiert große automatische Rückgänge ab mindestens drei Knoten; der abgewiesene Entwurf wird trotzdem als Wiederherstellungsstand gesichert. Revisionskonflikte überschreiben niemals den neueren Serverstand. Die Vertragsgrenzen erlauben höchstens acht Boards, 600 Knoten, 1.200 Kanten und 96 Live-Werkzeuge pro Board. Projektdateien werden nur relativ zu einer bekannten Projekt-ID erstellt; absolute Pfade, Traversal und Symlink-Ausbrüche werden serverseitig abgewiesen.

Für mehrere Codex-Accounts wird pro Account ein separates Codex-Home mit eigener Anmeldung verwendet. Die absoluten Pfade liegen ausschließlich in der privaten CodexBar-Konfiguration (`~/.config/codexbar/config.json`) im Feld `codexProfileHomePaths`; Authentifizierungsdateien und diese Konfiguration gehören nicht ins Repository.

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
CODEX_CLI_PATH=/home/bbecker/.local/bin/codex
OPENCODE_CLI_PATH=/home/bbecker/.npm-global/bin/opencode
CODEX_MAX_SESSIONS=4
OPENCODE_MAX_SESSIONS=4
```

Beide Programme starten ohne automatische Bypass- oder Auto-Approve-Optionen. Projektpfade werden wie beim normalen Terminal ausschließlich aus einer validierten Projekt-ID ermittelt.
