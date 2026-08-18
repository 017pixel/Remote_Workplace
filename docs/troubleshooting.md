# Troubleshooting

## Web-Push kommt nicht an

- Die Workbench muss über ihren privaten HTTPS-Origin geöffnet sein. `http://` auf einer
  Tailscale-IP ist kein sicherer Kontext und unterstützt Push sowie Service Worker nicht zuverlässig.
- Auf iPadOS die Seite in Safari über „Teilen → Zum Home-Bildschirm“ installieren und danach nur
  über das neue Home-Screen-Symbol öffnen. In einem normalen Safari-Tab fordert die Workbench
  absichtlich keine Berechtigung an.
- Der Status „Nicht aktiviert“ bedeutet, dass dieses Gerät noch keine lokale Subscription besitzt.
  In den Einstellungen „Auf diesem Gerät aktivieren“ wählen. Die Permission wird nie beim Laden
  der App angefragt.
- Bei „Blockiert“ die Benachrichtigungsberechtigung in den Browser- oder Systemeinstellungen
  freigeben. JavaScript darf eine verweigerte Permission nicht selbst zurücksetzen.
- „Lokal aktiv, Server-Synchronisierung fehlgeschlagen“ bedeutet, dass das Browser-Abo besteht,
  sein idempotenter Server-Upsert aber fehlgeschlagen ist. Netzwerk und Workbench-Identität prüfen
  und die Benachrichtigungseinstellungen erneut öffnen oder „Erneut aktivieren“ wählen.
- Der Knopf „Testbenachrichtigung an dieses Gerät senden“ prüft die vollständige Serverkette,
  verschmutzt die Inbox aber nicht. Er ist nur bei einem lokal und serverseitig synchronisierten
  Endpoint aktiv und auf fünf Versuche pro Minute begrenzt.
- HTTP 404 und 410 des Browser-Push-Dienstes entfernen einen abgelaufenen Endpoint automatisch.
  Das betreffende Gerät muss danach erneut aktiviert werden. HTTP 401 oder 403 weist auf VAPID-
  oder Provider-Konfiguration hin; HTTP 429 und 5xx bleiben als temporäre Zustellfehler erhalten.
- Nach Verlust oder bewusstem Wechsel von `<paths.dataDir>/notifications/vapid.json` erneuert die
  PWA bestehende Subscriptions mit dem neuen öffentlichen Schlüssel. Die Datei möglichst aus der
  Sicherung wiederherstellen, wenn laufende Geräte-Abos unverändert bleiben sollen.
- Nach einem PWA-Update die App vollständig schließen und erneut öffnen. `sw.js` bleibt
  revalidierbar, übernimmt Clients nach der Aktivierung und entfernt alte Shell-Caches.
- Für Apple Push müssen DNS und ausgehendes HTTPS zu `*.push.apple.com` erlaubt sein. Ein schneller
  Servercheck ist `curl -I --max-time 10 https://web.push.apple.com`; eine HTTP-Fehlermeldung ist
  dabei in Ordnung, ein DNS- oder Verbindungsfehler nicht.

Die aktuelle Gerätezahl in den Einstellungen gilt für die aktive Workbench-Identität. Die Inbox
selbst ist global, deshalb wird ein wichtiges neues Ereignis an jedes registrierte Gerät aller
erlaubten Identitäten geschickt. Das Deaktivieren eines Geräts löscht nur dessen Endpoint.

## Orbit-Daten und Sicherungen

Der produktive Datenbestand liegt unter `/home/your-user/.local/share/remote-workplace/workbench.sqlite` und damit außerhalb des Repositorys. Builds, Quellcodewechsel und Deployments dürfen diese Datei nicht ersetzen. Jede bestätigte Orbit-Revision wird zusätzlich unter `/home/your-user/.local/share/remote-workplace/orbit-backups/` abgelegt; `current.json` enthält die letzte Revision mit SHA-256-Prüfsumme, die nummerierten Dateien bleiben unverändert erhalten.

Wenn die SQLite-Datei fehlt, stellt der Server beim nächsten Start automatisch `current.json` wieder her. Eine beschädigte Sicherung führt absichtlich zu einem Startfehler statt zu einer leeren Arbeitsfläche. Vor manuellen Eingriffen immer den Workbench-Dienst anhalten und sowohl die Datenbank als auch den vollständigen Backup-Ordner kopieren. Bei einer manuellen Reparatur konservierte Rohdaten sollten getrennt unter `/home/your-user/.local/share/remote-workplace/emergency-backups/` abgelegt werden.

Ein `ORBIT_REVISION_CONFLICT` oder `ORBIT_DESTRUCTIVE_SAVE_BLOCKED` überschreibt den aktiven Serverstand nicht. Der abweichende Browserentwurf liegt in `orbit_conflict_backups`; die aktuelle Arbeitsfläche bleibt in `orbit_documents` und `orbit_document_revisions` erhalten.

## Terminal verbindet nicht

- `journalctl -u remote-workplace.service -n 100 --no-pager` auf WebSocket- oder PTY-Fehler prüfen.
- Sicherstellen, dass `TERMINAL_ALLOWED_USERS` den Tailscale-Login in Kleinschreibung enthält.
- Der Server muss mit `@fastify/websocket` v11 den Socket direkt verwenden; `connection.socket` ist die alte API und führt zu Code 1006.
- Nach einem Produktionsbuild den Workbench-Dienst neu starten, damit `dist/` nicht hinter dem Source-Code zurückbleibt.
- Für schreibende Befehle darf die Workbench-Unit nicht `ProtectHome=read-only` verwenden.

## Codex oder OpenCode startet nicht

- `CODEX_CLI_PATH` beziehungsweise `OPENCODE_CLI_PATH` mit `test -x <pfad>` prüfen.
- Die CLI unter demselben Benutzer wie den Workbench-Dienst einmal direkt im Terminal starten und Anmeldung sowie Konfiguration prüfen.
- Bei `TOO_MANY_SESSIONS` nicht mehr benötigte Instanzen schließen; standardmäßig sind jeweils vier Codex- und OpenCode-Prozesse erlaubt.
- Die Workbench setzt keine Auto-Approve- oder Sandbox-Bypass-Flags. Rückfragen der CLI sind daher erwartetes Verhalten.

### OpenCode Web

- `XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user status opencode-web.service` und
  `journalctl --user -u opencode-web.service -n 100 --no-pager` prüfen.
- `curl -f http://127.0.0.1:3774/` muss die OpenCode-Web-Seite liefern; Port und Binary stehen in
  `config/workbench.local.json` unter `opencodeWeb`.
- Wenn die Oberfläche lädt, aber keine Sessions oder Events zeigt, muss der Zugriff über
  `/opencode` erfolgen. Die Workbench-Bridge scoped absolute OpenCode-API-, Asset- und
  WebSocket-URLs; ein direktes Einbetten des Loopback-Ports umgeht diese Route.
- Nach einem Binary-, Port- oder Unit-Änderung `bash scripts/install-opencode-web-unit.sh` und
  anschließend `bash scripts/restart-backend.sh` ausführen.

## Projekt fehlt

- `PROJECT_DISCOVERY_ENABLED=true` und `PROJECTS_ROOT=/home/your-user/projects` prüfen.
- Es werden alle direkten, nicht versteckten Verzeichnisse angezeigt; Dateien und versteckte Ordner werden ausgelassen.
- Explizite Metadaten gehören in `config/projects.local.json`; Pfade müssen absolut sein.
- `missing`, `inaccessible` und `symlink` beschreiben die serverseitig geprüfte Verfügbarkeit.

## Editor lädt nicht

- `systemctl --user status code-server.service` und `curl -f http://127.0.0.1:8080/healthz` prüfen.
- Die öffentliche URL muss `https://HOST:8443/editor/` sein, nicht eine HTTP-IP und nicht ein separater, unkonfigurierter Port.
- `/editor/` braucht HTTP- und WebSocket-Weiterleitung; die Workbench übernimmt beides.
- `WS_ERR_UNSUPPORTED_MESSAGE_LENGTH` oder `Max payload size exceeded` bedeutet, dass eine alte Workbench noch das frühere 64-KiB-Transportlimit nutzt. Neu bauen und den Dienst neu starten; `WEBSOCKET_MAX_PAYLOAD_BYTES` steht standardmäßig auf 16 MiB.
- Ein Dialog `Unable to read file ... (Canceled)` ist meist die Folge dieses abgerissenen code-server-WebSockets, kein Dateirechtefehler. Nach stabiler Socket-Verbindung lässt sich dieselbe Datei ohne Reload wieder öffnen.
- Auf Mobilgeräten den Editor maximieren oder extern öffnen. Der Container entfernt Abstände und hält die Aktionsleiste unten; die interne VS-Code-Oberfläche selbst bleibt code-server-eigen.

## Preview meldet `PROXY_ERROR`

- Den Vite-Dienst lokal mit `curl -f http://127.0.0.1:1234/` prüfen.
- Die Preview-URL muss mit Slash enden: `https://HOST:8443/editor/absproxy/1234/`.
- Der alte Workbench-Fetch-Proxy kann relative Assets, Cookies und HMR nicht vollständig abbilden und wird für Panels nicht mehr benutzt.
- Nach externem Öffnen bleibt das eingebettete Iframe gemountet. Bei einer alten Version Hard-Reload ausführen und danach den neuen Build deployen.
- Meldet Firefox für `.ts`, `.tsx` oder Vite-Abhängigkeiten den MIME-Typ `application/json`, den Response-Status und Body prüfen. Eine JSON-Antwort mit `RATE_LIMITED` stammt von einer alten globalen Limitierung; `/editor/**` darf keine `x-ratelimit-*`-Header mehr tragen.
- Wenn der primäre HMR-Socket unter `wss://HOST:8443/editor/absproxy/...` scheitert und Vite anschließend localhost versucht, zuerst Workbench-Logs auf 429- oder WebSocket-Payload-Fehler prüfen. Der localhost-Versuch ist nur Vites Fallback.

## Dev-Server im Preview Hub startet nicht

- Der Hub erkennt Frontend, API und lokale Datenbank anhand der Projektdateien und Skripte. Die erkannte Laufzeit steht vor dem Start unter **Projektlaufzeit**; Abweichungen gehören in `preview.config.json`.
- `tmux has-session -t <Sitzungsname>` und der Log-Bereich im Preview Hub zeigen, ob die Sitzung noch läuft oder der Prozess beendet wurde.
- **Alles starten** startet die erkannten Prozesse auch dann, wenn noch kein veröffentlichbarer Preview-Slot frei ist. Erst **Im neuen Tab öffnen** benötigt einen Slot.
- Automatisch erkannte Dienste erhalten projektübergreifend freie Ports aus der konfigurierten Preview-Port-Palette. Feste Zahlenports in `preview.config.json` bleiben reserviert; bei parallelen Projekten kann Version 2 stattdessen `"port": "auto"` verwenden.
- `PREVIEW_RUNTIME_PORT_CAPACITY` bedeutet, dass die geöffneten Laufzeiten gemeinsam mehr Browserports benötigen als die Palette noch hergibt. Ein Projekt-Tab kann geschlossen bleiben, seine Laufzeit muss zum Freigeben aber ausdrücklich gestoppt werden.
- Nach einem Backend-Neustart darf der Prozess nicht neu gestartet werden: Der Hub verbindet sich wieder mit der vorhandenen tmux-Sitzung.
- Preview-Prozesse laufen dafür auf dem eigenen tmux-Socket `remote-workplace-previews` in einer separaten systemd-Scope. Sie gehören nicht zur Cgroup des Workbench-Dienstes.
- Lässt der Browser kein Popup zu, wird einmalig auf einen neuen Tab zurückgefallen; alternativ den Öffnungsmodus dauerhaft auf „Neuer Tab“ stellen.

## Preview-Slot steht in Quarantäne

- Ein Slot wird `quarantined`, wenn ein Storage-Reset nicht nachweislich alles geleert hat.
  Das ist fail-closed gewollt: Ein fremdes Projekt darf keinen alten Service Worker erben.
- Zustand prüfen: `bash scripts/preview-doctor.sh --status`.
- Beim direkten Öffnen versucht der Preview Hub automatisch, einen ungebundenen alten oder
  quarantänisierten Slot im aktuellen Browser zu leeren und verifiziert wieder freizugeben.
  Der laufende Schritt wird oberhalb der Öffnen-Aktion angezeigt.
- In der Preview-Diagnose unter **Preview-Info → Slot-Speicher zurücksetzen** einen neuen,
  verifizierten Reset auslösen, falls die automatische Wiederherstellung scheitert. Erst ein
  sauberer Bericht erhöht die `slotGeneration` und gibt den Slot frei.
- Meldet der Browser keine `indexedDB.databases()`, bleibt der Reset unverifizierbar. Dann
  hilft nur ein Browser, der die Inventur unterstützt, oder ein anderer Slot.

## Cookies verhalten sich zwischen Slots gleich

- Cookies gelten hostweit; Ports isolieren sie nicht. Das ist keine Fehlfunktion, sondern
  die Cookie-Spezifikation.
- Für echte Cookie-Isolation das Browser-Werkzeug mit einem eigenen Server-Chromium-Profil verwenden.

## Bridge meldet „nicht verfügbar"

- Die Bridge wird nur in `text/html`-Antworten mit UTF-8 unterhalb von
  `previews.maxInjectableHtmlBytes` injiziert. Größere, streamende oder nicht parsebare
  Antworten laufen unverändert weiter — nur ohne Client-Diagnose.
- Blockiert ein strenger CSP das externe Script, ergänzt der Gateway für bestätigte lokale
  Dienste `script-src 'self'` und protokolliert die Änderung in der Diagnose.
- Ist `previews.bridgeEnabled` oder `previews.gatewayV2Enabled` aus, gibt es bewusst keine Bridge.

## Vollbild oder Geräteansicht funktioniert nicht

- Vollbild wird vom Panel selbst gesteuert und mit Escape beendet; Browser-Vollbildrechte sind am Iframe freigegeben.
- Die Geräteauswahl erscheint nur bei Preview-Panels. `Responsive` füllt den Raum, feste Geräte verwenden exakte CSS-Viewports und lassen sich drehen.
- Auf Mobilgeräten ist die Panel-Aktionsleiste dauerhaft unten sichtbar und berücksichtigt die Safe Area.

## User-Dienste starten zu früh

- `systemctl restart code-server.service` ausführen.
- Logs mit `journalctl -u code-server.service -n 100 --no-pager` prüfen.
- `deploy/systemd/install.sh` wartet nach dem Start auf den Health-Endpunkt; ein einmaliger unmittelbarer Curl direkt nach `systemctl start` kann zu früh sein.

## Hermes Agent

### Dashboard nicht erreichbar

- `XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user status hermes-dashboard.service` prüfen.
- Der direkte Healthcheck braucht den DNS-Rebinding-Schutz: `curl -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/api/status`.
- Der Proxy setzt bewusst `Host: 127.0.0.1:9119`. Ein durchgereichter Tailscale-Host führt bei Hermes zu HTTP 400.
- `bash scripts/install-hermes.sh` baut fehlende `hermes_cli/web_dist/index.html` neu und installiert die User-Unit erneut.

### Offizieller Hermes-Chat getrennt oder Events Feed nicht verbunden

Die sichtbare Hermes-Oberfläche verwendet die offiziellen PTY- und Events-WebSockets über den
Workbench-Pfad `/hermes`. Der direkte Hermes-Port bleibt absichtlich nur auf Loopback erreichbar.
Der Proxy setzt für den Upstream `Host: 127.0.0.1:9119` und übersetzt beim WebSocket-Handshake den
äußeren Browser-Origin auf den Loopback-Origin. Die Workbench prüft den ursprünglichen Origin vor
der Weiterleitung.

Wenn Hermes trotzdem `Chat disconnected` oder `events feed disconnected` anzeigt, zuerst
`/api/v1/hermes/diagnostics` und die User-Unit `hermes-dashboard.service` prüfen. Danach die
Workbench-Seite neu laden. Ein Reload löscht keine Session, die offizielle Hermes-Chatroute kann
eine bestehende Session über `?resume=<id>` wieder aufnehmen.

Die ACP-Bridge und die Fehlercodes `ACP_CRASHED`, `ACP_UNAVAILABLE` und `SESSION_NOT_FOUND`
betreffen nur interne Workbench-Hintergrundfunktionen, nicht die sichtbare Hermes-Weboberfläche.

### Update fehlgeschlagen

Update-Zustand und redigierte letzte Schritte stehen in der Hermes-Diagnose und bleiben als Fehler-
Benachrichtigung sichtbar. Vor dem Update wird ein Hermes-Backup erzwungen; zusätzlich entsteht
höchstens einmal pro Woche ein vollständiges Backup. Rollback:

```bash
git -C <hermes-checkout> reset --hard <vorheriger-commit>
<hermes-checkout>/venv/bin/pip install -e <hermes-checkout>
cd <hermes-checkout>/web && npm ci && npm run build
XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart hermes-dashboard.service hermes-gateway.service
```

Hat der Hermes-Checkout kein `package-lock.json`, verwendet der Workbench-Updatepfad bewusst
`npm install --no-audit --no-fund` statt `npm ci`.

Alternativ das offizielle Backup mit `hermes import <backup>.zip` zurückspielen. Der Checkout,
`HERMES_HOME`, Gateway und Telegram werden von der Workbench nicht verschoben oder gelöscht.
