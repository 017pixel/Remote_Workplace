# Architektur

## Prozesse und Netzwerk

- T3 Code läuft unabhängig auf `127.0.0.1:3773` und bleibt über Tailscale Serve HTTPS 443 erreichbar. Für die eingebettete Ansicht stellt das Workbench-Backend zusätzlich einen gleich-originigen HTTP-/WebSocket-Proxy unter `/t3` bereit; dadurch bleibt T3 Codes eigener `frame-ancestors 'self'`-Schutz intakt.
- Workbench-Backend und gebautes Frontend laufen gemeinsam auf `127.0.0.1:3010`; Tailscale Serve veröffentlicht diesen Dienst privat auf HTTPS 8443.
- code-server bindet ausschließlich an `127.0.0.1:8080`. Fastify leitet `/editor/*` inklusive WebSocket-Upgrades dorthin weiter. Dieser datenintensive Pfad ist nicht Teil des API-Request-Limits; der WebSocket-Transport erlaubt die größeren Initialisierungsframes von VS Code.
- Lokale Development-Server binden ebenfalls nur an Loopback. Zwölf interne Preview-Listener auf den konfigurierten `previews.slotPorts` leiten HTTP und WebSocket am Root an zugewiesene Devserver weiter. Tailscale Serve veröffentlicht sie 1:1 auf getrennten HTTPS-Ports; Preview-Sessions reservieren Haupt- und bestätigte Projekt-Begleitdienste atomar und überbrücken deren lokale URLs.
- Ein kurzzeitig gecachter Port-Scanner ermittelt lokale TCP-Listener, prüft HTTP und HTTPS und stellt erreichbare Dienste als Schnellstart bereit. Angezeigt werden nur Projekt-Devserver: privilegierte Ports unter 1024, bekannte Systemprozesse und Listener ohne HTTP-Antwort bleiben ausgeblendet. Prozessdetails bleiben auf Name und Port begrenzt.
- Es gibt weder Funnel noch öffentliche Router-Portweiterleitungen. Tailscale authentifiziert den Benutzer und ergänzt die Identitätsheader für das Terminal.

Hermes Agent läuft als eigener User-Dienst auf Loopback. Die sichtbare Chat- und
Verwaltungsoberfläche ist ausschließlich die offizielle Hermes-SPA im Iframe. Ihr PTY-Chat und
Events Feed verwenden die offiziellen WebSocket-Endpunkte `/api/pty`, `/api/ws`, `/api/pub` und
`/api/events`. Der Dashboard-Proxy liegt ausschließlich unter `/hermes`, setzt den Upstream-
`Host` auf die Hermes-Bind-Adresse, leitet `X-Forwarded-Prefix` weiter und übersetzt den äußeren
Browser-Origin beim WebSocket-Handshake auf den Loopback-Upstream. Die Workbench prüft den
äußeren Same-Origin-Zugriff vorher. ACP-Funktionen können intern für Hintergrundaufgaben bestehen;
eine zweite sichtbare Chatfläche gibt es nicht. Das ephemere Hermes-Session-Token wird nur
serverseitig aus dem Dashboard-HTML gelesen und nie an den Browser oder in Logs weitergereicht.
Telegram, Cron und Web schreiben weiterhin in denselben Hermes-Sessionbestand.

Das Iframe wird genau einmal montiert; Seitenwechsel laufen über eine Routen-Brücke, die der
Proxy vor `</head>` injiziert und die in beide Richtungen spricht. `route.changed` meldet den
offiziellen Hermes-Pfad an die Workbench, `route.navigate` nimmt Deep-Links aus der Workbench
entgegen. Die Brücke prüft Origin und Pfadform. Fällt sie aus, lädt der iframe den offiziellen
Pfad direkt neu.

**Markenzeichen.** Die Workbench verwendet das offizielle Hermes-Agent-Icon (MIT © 2025 Nous
Research) aus `apps/desktop/assets/icon.png` des Hermes-Checkouts. `scripts/build-hermes-icon.mjs`
leitet daraus `apps/web/public/icons/hermes-agent.png` ab; `HermesIcon` bettet es ein, damit alle
Aufrufstellen es wie jedes andere Werkzeugicon verwenden können.

**Theme.** `deploy/hermes/dashboard-themes/remote-workplace.yaml` wird nach
`$HERMES_HOME/dashboard-themes/` installiert und überlebt damit jedes `hermes update`. Es bleibt
absichtlich nah am Hermes-Original und ändert nur den Akzent. Eine Falle steckt in der Benennung
der Palette (`hermes_cli/web_server.py`, `web/src/themes/context.tsx`): `midground` ist nicht die
mittlere Fläche, sondern die **helle Schrift- und Linienfarbe**, aus der das Nous-Design-System
fast alles ableitet; `foreground` ist eine Overlay-Ebene, die in jedem Hermes-Preset auf
`#ffffff` mit `alpha: 0` steht. Ein dunkler `midground` macht die komplette Oberfläche
unlesbar — schwarze Schrift auf schwarzem Grund.

## Terminal

Das Terminal besteht aus xterm.js im Browser, einem versionierten JSON-WebSocket-Protokoll, einem `node-pty`-Gateway, einem tmux-Supervisor und einer SQLite-Registry für Session-Metadaten und geräteübergreifende Terminal-Layouts. `create`, `attach`, `input`, `resize`, `clear`, `restart`, `close` und `ping` sind getrennte Nachrichten. Jede UI-Instanz sendet eine stabile `runtimeId`; ein Create mit derselben Benutzer- und Runtime-ID hängt an die vorhandene tmux-Sitzung an, statt einen zweiten Prozess zu starten. Beim Erstellen wird ausschließlich der validierte Typ `shell`, `codex` oder `opencode` akzeptiert; ausführbare Dateien und Argumente stammen aus der serverseitigen Konfiguration. Browser-, Socket- und Backend-Trennungen beenden keine beaufsichtigte Session. Beim Neustart werden Registry und tmux abgeglichen, Verlauf aus dem Pane übernommen und vorhandene Einzelbenutzer-Sitzungen in der UI angeboten. Projekt-IDs werden serverseitig in freigegebene Arbeitsverzeichnisse aufgelöst. Sitzungen sind an die durch Tailscale bestätigte Identität gebunden, auf erlaubte Wurzelverzeichnisse beschränkt und pro Typ zahlenmäßig begrenzt.

## Browser und lokale Previews

Der Browser-Manager startet einen echten headless Chromium-Prozess mit einem isolierten, dauerhaften Profil und steuert ihn über das Chrome DevTools Protocol. Profilverzeichnisse werden aus Benutzeridentität und validiertem Profilnamen gehasht, mit Modus `0700` angelegt und niemals an den Client ausgeliefert. Cookies und Loginzustände überleben Leerlauf, Backend-Neustarts und Gerätewechsel; SQLite speichert zusätzlich Profilbindung und letzte URL einer stabilen Browserinstanz. Der Browser empfängt JPEG-Screencasts, Navigation sowie typisierte Maus-, Tastatur- und Resize-Ereignisse über einen eigenen WebSocket. Sitzungen gehören zur bestätigten Tailscale-Identität, WebSocket-Upgrades müssen vom Workbench-Origin stammen, und der Client erhält weder den DevTools-Port noch Zugriff auf den Chromium-Prozess.

Das Browser-Werkzeug übernimmt die schnelle Preview-Logik für lokale Ziele: Löst sich die eingegebene oder aus der Portübersicht gewählte Adresse auf einen lokalen Port auf, übernimmt `BrowserPanel` (`apps/web/src/components/browser/BrowserPanel.tsx`) die Anzeige über denselben Slot-Proxy-Mechanismus wie Previews (`isolate: false`, geteilter Slot pro Zielport) statt über den Chromium-Stream. Ein Umschalter erlaubt weiterhin den expliziten Wechsel auf den Server-Chromium für dasselbe lokale Ziel, etwa für geräteübergreifend geteilte Sessions. Der Chromium-Prozess startet erst bei echter externer Navigation oder explizitem Umschalten – der bloße Blank-Zustand mit der Portübersicht verbraucht keine der begrenzten Browser-Sessions. Dieselbe Komponente läuft unverändert als eigenständige Route und als Orbit-Werkzeugknoten im Infinite Canvas; Entfernen des Knotens gibt einen gehaltenen Preview-Slot beim Unmount frei.

Die Preview-Startansicht verwendet die lokale Portübersicht. Konfigurierte und lokal erkannte Previews laufen immer direkt im Client-iframe über einen der getrennten HTTPS-Slot-Origins. Root-Proxying erhält absolute Assets, Client-Router und Vite-HMR ohne `base`-Anpassung. Verschiedene Ports trennen localStorage und IndexedDB; Cookies sind hostweit und deshalb nicht port-isoliert. Der Server-Chromium bleibt ausschließlich dem Browser-Werkzeug vorbehalten.

Slot-Zuordnungen liegen in SQLite und überleben Backend-Neustarts. Die API `/api/v1/previews/slots` weist freie Slots atomar zu, kann ein Ziel bewusst teilen und gibt Slots wieder frei. Orbit-Preview-Gruppen verwenden dasselbe System für Layouts mit einem, zwei, drei oder sechs Slots. Neue Slots starten mit iPhone-13-Maßen; ein Layoutwechsel behält die Slot-Größe bei und lässt die Gruppe zur freien Seite wachsen. Ziel, Label, Gerätewahl, Isolation und Laufzeit liegen im Orbit-Dokument. Die Route `/previews/gruppe/:id` rendert dieselbe Gruppe ohne Canvas, `/previews/fenster/:id` zusätzlich ohne Workbench-Navigation für ein eigenes Browserfenster; beide folgen dem Orbit-Dokument und übernehmen Gerät, Ausrichtung und Laufzeit jedes Slots.

## Projekte und Workspace

Alle direkten, nicht versteckten Verzeichnisse unter `PROJECTS_ROOT` werden bei der Abfrage erkannt. `projects.local.json` überschreibt diese Erkennung nicht, sondern ergänzt explizite Metadaten und Preview-URLs. Eine gecachte Aktivitätsanalyse kombiniert den letzten Workbench-Zugriff, die jüngste relevante Dateiänderung und den letzten Git-Commit. Die Sidebar zeigt daraus nur die neuesten Projekte; eine Suche stellt weiterhin sämtliche verfügbaren Verzeichnisse bereit. Projektpfade werden nur serverseitig erzeugt; der Browser übermittelt Projekt-IDs.

Der Orbit-Serverbrowser ergänzt diese flache Erkennung durch einen lazy geladenen Dateibaum unter einer separaten Allowlist-Root. Die API liefert nur Metadaten direkter Kinder, paginiert große Ordner und folgt keinen symbolischen Verweisen. Ein ausgewählter Unterordner wird nach kanonischer Pfadprüfung mit einer stabilen, pfadgebundenen ID in SQLite registriert. Danach verhält er sich für Orbit, Terminal, Agenten und Code-Server wie jedes konfigurierte Projekt. Der Root-Ordner selbst bleibt ausgeschlossen.

Der aktive Workspace verwendet das validierte Orbit-Schema Version 6. Boards enthalten Knoten, Kanten, Viewport und Arbeitsgebietsgrenzen. Projekt-Hubs stellen den gemeinsamen Kontext her; Werkzeuge, Preview-Gruppen und ihre Slot-Kinder, Notizen, Snippets, Dateien, Bereiche und Nutzungsanzeigen bleiben frei beweglich und skalierbar. Preview-Slots verwenden `parentId`, folgen dadurch einer Gruppe ohne iframe-Neuladen und können aus ihr herausgelöst oder wieder angedockt werden.

Die kanonische Orbit-Datei liegt revisioniert in derselben lokalen SQLite-Datenbank wie die Nutzungsdaten. Der Browser speichert Änderungen nach kurzer Ruhezeit und fragt in einem konfigurierbaren Intervall nach neueren Revisionen. Bei einem Revisionskonflikt wird die aktuelle Serverrevision geladen und die noch nicht gespeicherte lokale Änderung erneut darauf geschrieben. Hermes-Status, Aufgaben, Cron und Ergebnisse sind additive Knotentypen; alte Dokumente der Versionen 6 und 7 bleiben lesbar, geschrieben wird Version 8. Da die Workbench für eine Person ausgelegt ist, genügt dieses deterministische Last-Edit-Verfahren ohne Mehrbenutzer-CRDT.

Ein vorhandener Workspace der Schema-Version 3 in `localStorage` wird nur dann in Orbit-Boards migriert, wenn auf dem Server noch kein Orbit-Dokument existiert. Gruppen und Tabs werden als Live-Werkzeugknoten übernommen, Projekt-Hubs und Verbindungen ergänzt. Anschließend ist SQLite die geräteübergreifende Quelle; der alte lokale Zustand bleibt als Rückfallkopie unangetastet.

Besuchte React-Routen bleiben für die Dauer der Browser-Session in einem persistenten Outlet gemountet. Orbit-Live-Knoten besitzen stabile Laufzeit-IDs, sodass xterm sich nach einem Canvas- oder Routenwechsel wieder an dieselbe PTY-Sitzung hängt. Iframes bleiben innerhalb ihres Knotens gemountet und werden bei Verschieben, Skalieren oder Maximieren nicht neu geladen.

## Tech TLDRs

Der News-Bereich verwendet ein eigenes SQLite-Modul in derselben Workbench-Datenbank. RSS-, Atom-, Hacker-News- und YouTube-Adapter normalisieren Beiträge in ein gemeinsames Schema; FTS5 indexiert Titel, TLDR und Inhalt. Ein Cursor aus Wichtigkeit und Veröffentlichungszeit ermöglicht stabiles fortlaufendes Nachladen.

Mistral Small verarbeitet Übersetzung, Kategorie, TLDR und Wichtigkeit; Mistral Embed erzeugt Suchvektoren, während Mistral Medium nur für komplexe Mehrquellenfragen vorgesehen ist. Der Feed funktioniert bei Rate Limits weiter mit regelbasierten Kategorien und Originalteasern. API-Schlüssel verlassen den Server nie.

Desktop nutzt ein dynamisches Editorial-Bento. Mobile rendert denselben Datenbestand als vertikalen Snap-Feed; benennbare Sammlungen, Lesestatus und quellengebundene Fragen greifen über typisierte API-Routen auf SQLite zu.

T3 Code und code-server bleiben bewusst in Iframes: Sie sind eigenständige Webanwendungen mit eigenen Routern, CSP-Regeln, Cookies und WebSocket-Verbindungen. Entwicklungs-Previews sind davon getrennt und verwenden standardmäßig Slot-iframes; der Chromium-Stream ist nur noch der explizite Browser-/Kompatibilitätspfad.

Nicht besuchte Routen werden als getrennte Vite-Chunks gebaut und bei Browser-Leerlauf vorab geladen. Der Build erzeugt Brotli- und Gzip-Dateien vorab, damit die Server-CPU sie nicht bei jedem ersten Abruf neu berechnen muss. Gehashte Assets erhalten immutable Browser-Caches; HTML und Service Worker bleiben revalidierbar, damit neue Releases sofort erkannt werden.

## Dateimanager

Der Dateimanager (`apps/server/src/filesystem/fileManagerService.ts`) arbeitet direkt auf dem
Server-Dateisystem unter dem konfigurierten Projekt-Root. Jede Operation wird kanonisch gegen
diese Wurzel geprüft (`contained`); Symlinks und Pfad-Escape-Versuche werden abgewiesen. Der
drei-Pane-Zustand (aktueller Pfad, Verlauf, Favoriten) liegt revisioniert in SQLite und wird
geräteübergreifend synchronisiert. Textvorschauen sind auf eine konfigurierbare Größe begrenzt
und kennen eine MIME-Tabelle; die Suche ist auf Tiefe, Trefferzahl und Zeit begrenzt und
überspringt Knoten- und Build-Ordner. Upload und Download streamen direkt über die Festplatte,
alle Operationen (Umbenennen, Verschieben, Löschen, Ordner anlegen) laufen atomar über das
Dateisystem. Aus dem Dateimanager lassen sich Ordner im Terminal oder Editor öffnen, als
Projekt registrieren oder als Orbit-Knoten einbetten.

## Benachrichtigungen und Inbox

Das Benachrichtigungsmodul (`apps/server/src/notifications/`) sammelt Einträge aus T3 Code,
Hermes, Codex, OpenCode, Claude Code und langen Terminal-Prozessen in einer eigenen SQLite-Tabelle.
Eine Live-Verbindung liefert neue Einträge sofort aus, mit Polling-Fallback; Web-Push läuft über
VAPID-Schlüssel, die einmalig auf dem Server erzeugt und mit Modus `0600` gespeichert werden.
Quellen-Synchronisierer (`agent-session-sync`, `t3-status-sync`, `terminal-status-sync`) binden
den Gelesen-/Erledigt-Zustand an den tatsächlichen Status der zugehörigen Aufgabe. Schwellen und
Zustellwege sind pro Quelle zentral konfigurierbar; die Inbox im Browser bietet Chronologie,
Deep-Links in die Sitzung beziehungsweise den T3-Thread, Swipe-Aktionen und kopierbare
Fehlerberichte.

## KI-Skills

Das Skills-Werkzeug (`apps/server/src/skills/skillEditorService.ts`) liest die Skill-Ordner aus
dem globalen Harness-Verzeichnis und stellt sie als Baum mit Frontmatter-Prüfung bereit. Neue
Skills werden im offiziellen Format angelegt und per Symlink an weitere Harness-Ordner (Claude
Code, Codex) verteilt. Der Editor speichert autosave nach kurzer Tipppause; parallele Änderungen
von außen führen zu einer Rückfrage statt zu stillem Überschreiben. Umbenennen zieht Ordner,
Verweise, Frontmatter und README-Zeilen mit; Löschen entfernt nur den Skill samt eigener Verweise.
Der Git-Teil committet und pusht das Skills-Repository mit automatisch gebauter Commit-Nachricht.

## Beobachtbarkeit und Diagnose

Das Observability-Modul (`apps/server/src/observability/`) stellt zwei Bausteine bereit:
`OperationalMetrics` sammelt pro Route Zähler, Fehlerquote und Dauer-Perzentile, misst die
Event-Loop-Verzögerung über `monitorEventLoopDelay` und verwaltet einen aktiven-Request-Zähler.
`OperationalAuditDatabase` schreibt eine append-only, hashverkettete Auditspur kritischer
Workbench-Mutationen; Request-Bodies und Secrets werden nie übernommen. Das Dashboard verdichtet
diese Werte mit Hostfakten und Laufwerken in einer Kennzahlenleiste samt Verlauf
(`dashboardRuntime.ts` gruppiert lokale Ports und Terminal-Sessions pro Projekt) und führt im
Bereich „Workbench-Diagnose" Bereitschaftsprüfungen, Betriebshinweise, Audit und Preview-Slots.

## Monorepo

- `packages/contracts`: gemeinsame Zod-Schemas und TypeScript-Typen.
- `apps/server`: API, PTY-, Browser- und Hermes-Manager, Systemmetriken, Port- und Projekterkennung, Reverse Proxys und statische Web-Auslieferung.
- `apps/web`: React-Oberfläche, Navigation, xterm.js, Browser- und Preview-Geräteansicht, Hermes-Chat sowie persistenter Workspace.
- `config`: zentrale Laufzeitwerte sowie committete Beispiele und lokal ignorierte Serverkonfigurationen.
- `deploy`: System- und User-systemd-Units sowie Tailscale-Serve-Skripte.

## Nutzungsanalyse und Accounts

CodexBar bleibt die Quelle für Live-Limits und lokale Token-/Kostenstatistiken. Das Backend importiert die HTTP-Antworten regelmäßig in eine lokale SQLite-Datenbank und ergänzt die Projektgruppierung über die CodexBar-CLI. Tages-, Modell- und Projektdaten werden idempotent aktualisiert; Limitfenster werden als Messreihe gespeichert. Prognosen entstehen erst ab drei Messpunkten desselben Fensters und bleiben klar von absoluten Tokenquoten getrennt.

Die Accountregistry speichert nur Anzeigenamen, Provider und lokale Profilpfade. Credentials verbleiben in den Profilen der jeweiligen CLI. Neue Logins laufen in einem typisierten PTY-Modus, der ausschließlich `codex login` oder `opencode auth login` mit einem isolierten Profil starten kann. Entfernen deregistriert den Account in Workbench und CodexBar, löscht aber weder Profilordner noch Anmeldedaten oder historische Statistiken.

## Sicherheitsgrenzen

- Alle eigenen Dienste binden standardmäßig nur an Loopback.
- Geschützte Präfixe (`/api/`, `/editor`, `/t3`, `/hermes`, Assets) verlangen eine erlaubte Tailscale-Identität; die Zuordnung läuft zentral über `workbench-identity` (`apps/server/src/security/`), mutierende Aktionen verlangen zusätzlich Same-Origin.
- Ausgehende externe HTTP-Aufrufe durchlaufen den SSRF-Schutz (`public-http`): DNS wird aufgelöst und jede Antwortadresse gegen eine Blockliste privater, lokaler und reservierter Netze geprüft.
- Terminalzugriff erfordert einen erlaubten Tailscale-Login und akzeptiert ausschließlich typisierte Protokollnachrichten.
- Browserzugriff erfordert dieselbe erlaubte Tailscale-Identität und einen passenden Origin; DevTools und dauerhafte Profile sind nicht direkt über das Netzwerk erreichbar.
- Projekt-CWDs müssen innerhalb der konfigurierten Wurzelverzeichnisse liegen; freie Shell-Pfade werden kanonisch geprüft.
- Editor und Workbench teilen ihren privaten HTTPS-Origin; Preview-Slots erhalten bewusst eigene private HTTPS-Origins für getrennte Web-Storage-Sitzungen.
- CSP-Framequellen entstehen ausschließlich aus validierten Service- und Preview-Konfigurationen.
- Der Hermes-Dashboard-Port bleibt Loopback-only; `/hermes` ist identitätsgeschützt, mutierende Aktionen verlangen zusätzlich Same-Origin.
- Hermes-Freigaben stehen auf `ask`; die native UI bietet keine dauerhafte globale Freigabe für destruktive Befehle.
- Fehlerantworten enthalten keine Secrets, Umgebungsvariablen oder internen Stacktraces.
- Terminal- und Editorprozesse benötigen absichtlich Schreibzugriff auf `/home/your-user/projects`; Kernel- und Systempfade bleiben über systemd gehärtet.
