# Architektur

## Prozesse und Netzwerk

- T3 Code läuft unabhängig auf `127.0.0.1:3773` und bleibt über Tailscale Serve HTTPS 443 erreichbar. Für die eingebettete Ansicht stellt das Workbench-Backend zusätzlich einen gleich-originigen HTTP-/WebSocket-Proxy unter `/t3` bereit; dadurch bleibt T3 Codes eigener `frame-ancestors 'self'`-Schutz intakt.
- Workbench-Backend und gebautes Frontend laufen gemeinsam auf `127.0.0.1:3010`; Tailscale Serve veröffentlicht diesen Dienst privat auf HTTPS 8443.
- code-server bindet ausschließlich an `127.0.0.1:8080`. Fastify leitet `/editor/*` inklusive WebSocket-Upgrades dorthin weiter. Dieser datenintensive Pfad ist nicht Teil des API-Request-Limits; der WebSocket-Transport erlaubt die größeren Initialisierungsframes von VS Code.
- Lokale Development-Server binden ebenfalls nur an Loopback. Die Workbench nutzt für Vite code-servers Pfad `/editor/absproxy/<port>/`, der HTTP, Routerpfade und WebSockets vollständig weiterleitet.
- Ein kurzzeitig gecachter Port-Scanner ermittelt lokale TCP-Listener, prüft HTTP und HTTPS und stellt erreichbare Dienste als Schnellstart bereit. Prozessdetails bleiben auf Name und Port begrenzt.
- Es gibt weder Funnel noch öffentliche Router-Portweiterleitungen. Tailscale authentifiziert den Benutzer und ergänzt die Identitätsheader für das Terminal.

## Terminal

Das Terminal besteht aus xterm.js im Browser, einem versionierten JSON-WebSocket-Protokoll, einem `node-pty`-Gateway, einem tmux-Supervisor und einer SQLite-Registry für Session-Metadaten und geräteübergreifende Terminal-Layouts. `create`, `attach`, `input`, `resize`, `clear`, `restart`, `close` und `ping` sind getrennte Nachrichten. Jede UI-Instanz sendet eine stabile `runtimeId`; ein Create mit derselben Benutzer- und Runtime-ID hängt an die vorhandene tmux-Sitzung an, statt einen zweiten Prozess zu starten. Beim Erstellen wird ausschließlich der validierte Typ `shell`, `codex` oder `opencode` akzeptiert; ausführbare Dateien und Argumente stammen aus der serverseitigen Konfiguration. Browser-, Socket- und Backend-Trennungen beenden keine beaufsichtigte Session. Beim Neustart werden Registry und tmux abgeglichen, Verlauf aus dem Pane übernommen und vorhandene Einzelbenutzer-Sitzungen in der UI angeboten. Projekt-IDs werden serverseitig in freigegebene Arbeitsverzeichnisse aufgelöst. Sitzungen sind an die durch Tailscale bestätigte Identität gebunden, auf erlaubte Wurzelverzeichnisse beschränkt und pro Typ zahlenmäßig begrenzt.

## Browser und lokale Previews

Der Browser-Manager startet einen echten headless Chromium-Prozess mit einem isolierten, dauerhaften Profil und steuert ihn über das Chrome DevTools Protocol. Profilverzeichnisse werden aus Benutzeridentität und validiertem Profilnamen gehasht, mit Modus `0700` angelegt und niemals an den Client ausgeliefert. Cookies und Loginzustände überleben Leerlauf, Backend-Neustarts und Gerätewechsel; SQLite speichert zusätzlich Profilbindung und letzte URL einer stabilen Browserinstanz. Der Browser empfängt JPEG-Screencasts, Navigation sowie typisierte Maus-, Tastatur- und Resize-Ereignisse über einen eigenen WebSocket. Sitzungen gehören zur bestätigten Tailscale-Identität, WebSocket-Upgrades müssen vom Workbench-Origin stammen, und der Client erhält weder den DevTools-Port noch Zugriff auf den Chromium-Prozess.

Die Preview-Startansicht verwendet die lokale Portübersicht. Konfigurierte und lokal erkannte Previews laufen standardmäßig als stabile serverseitige Browserinstanz mit einem Projektprofil. Damit sind authentifizierte Vorschauen auf allen Geräten gleich und bleiben angemeldet. Für inkompatible Anwendungen kann in der Projektkonfiguration explizit `runtime: "iframe"` gewählt werden. Notion verwendet das feste Profil `notion-main` und die Instanz `notion-shared`, wodurch alle Notion-Knoten und Geräte denselben angemeldeten Zustand steuern.

## Projekte und Workspace

Alle direkten, nicht versteckten Verzeichnisse unter `PROJECTS_ROOT` werden bei der Abfrage erkannt. `projects.local.json` überschreibt diese Erkennung nicht, sondern ergänzt explizite Metadaten und Preview-URLs. Eine gecachte Aktivitätsanalyse kombiniert den letzten Workbench-Zugriff, die jüngste relevante Dateiänderung und den letzten Git-Commit. Die Sidebar zeigt daraus nur die neuesten Projekte; eine Suche stellt weiterhin sämtliche verfügbaren Verzeichnisse bereit. Projektpfade werden nur serverseitig erzeugt; der Browser übermittelt Projekt-IDs.

Der Orbit-Serverbrowser ergänzt diese flache Erkennung durch einen lazy geladenen Dateibaum unter einer separaten Allowlist-Root. Die API liefert nur Metadaten direkter Kinder, paginiert große Ordner und folgt keinen symbolischen Verweisen. Ein ausgewählter Unterordner wird nach kanonischer Pfadprüfung mit einer stabilen, pfadgebundenen ID in SQLite registriert. Danach verhält er sich für Orbit, Terminal, Agenten und Code-Server wie jedes konfigurierte Projekt. Der Root-Ordner selbst bleibt ausgeschlossen.

Der aktive Workspace verwendet das validierte Orbit-Schema Version 4. Boards enthalten Knoten, Kanten, Viewport, Arbeitsgebietsgrenzen und gespeicherte Szenen. Projekt-Hubs stellen den gemeinsamen Kontext her; Werkzeuge, Notizen, Snippets, Dateien, Bereiche und Nutzungsanzeigen bleiben frei beweglich und skalierbar. Projektkanten entstehen automatisch, manuelle Kanten können unabhängig davon beschriftet werden.

Die kanonische Orbit-Datei liegt revisioniert in derselben lokalen SQLite-Datenbank wie die Nutzungsdaten. Der Browser speichert Änderungen nach kurzer Ruhezeit und fragt in einem konfigurierbaren Intervall nach neueren Revisionen. Bei einem Revisionskonflikt wird die aktuelle Serverrevision geladen und die noch nicht gespeicherte lokale Änderung erneut darauf geschrieben. Da die Workbench für eine Person ausgelegt ist, genügt dieses deterministische Last-Edit-Verfahren ohne Mehrbenutzer-CRDT.

Ein vorhandener Workspace der Schema-Version 3 in `localStorage` wird nur dann in Orbit-Boards migriert, wenn auf dem Server noch kein Orbit-Dokument existiert. Gruppen und Tabs werden als Live-Werkzeugknoten übernommen, Projekt-Hubs und Verbindungen ergänzt. Anschließend ist SQLite die geräteübergreifende Quelle; der alte lokale Zustand bleibt als Rückfallkopie unangetastet.

Besuchte React-Routen bleiben für die Dauer der Browser-Session in einem persistenten Outlet gemountet. Orbit-Live-Knoten besitzen stabile Laufzeit-IDs, sodass xterm sich nach einem Canvas- oder Routenwechsel wieder an dieselbe PTY-Sitzung hängt. Iframes bleiben innerhalb ihres Knotens gemountet und werden bei Verschieben, Skalieren oder Maximieren nicht neu geladen.

## Tech TLDRs

Der News-Bereich verwendet ein eigenes SQLite-Modul in derselben Workbench-Datenbank. RSS-, Atom-, Hacker-News- und YouTube-Adapter normalisieren Beiträge in ein gemeinsames Schema; FTS5 indexiert Titel, TLDR und Inhalt. Ein Cursor aus Wichtigkeit und Veröffentlichungszeit ermöglicht stabiles fortlaufendes Nachladen.

Mistral Small verarbeitet Übersetzung, Kategorie, TLDR und Wichtigkeit; Mistral Embed erzeugt Suchvektoren, während Mistral Medium nur für komplexe Mehrquellenfragen vorgesehen ist. Der Feed funktioniert bei Rate Limits weiter mit regelbasierten Kategorien und Originalteasern. API-Schlüssel verlassen den Server nie.

Desktop nutzt ein dynamisches Editorial-Bento. Mobile rendert denselben Datenbestand als vertikalen Snap-Feed; benennbare Sammlungen, Lesestatus und quellengebundene Fragen greifen über typisierte API-Routen auf SQLite zu.

T3 Code und code-server bleiben bewusst in Iframes: Sie sind eigenständige Webanwendungen mit eigenen Routern, CSP-Regeln, Cookies und WebSocket-Verbindungen. Entwicklungs-Previews können denselben Modus explizit nutzen, laufen für geräteübergreifende Anmeldung aber standardmäßig im serverseitigen Chromium. Eine native Einbindung würde die Isolation aufgeben und insbesondere für VS Code eine vollständige Client-Neuentwicklung verlangen. Das T3-Code-Prinzip eines außerhalb des Routers langlebigen Browser-Hosts wird stattdessen auf die Web-Workbench übertragen.

Nicht besuchte Routen werden als getrennte Vite-Chunks gebaut und bei Browser-Leerlauf vorab geladen. Der Build erzeugt Brotli- und Gzip-Dateien vorab, damit die Server-CPU sie nicht bei jedem ersten Abruf neu berechnen muss. Gehashte Assets erhalten immutable Browser-Caches; HTML und Service Worker bleiben revalidierbar, damit neue Releases sofort erkannt werden.

## Monorepo

- `packages/contracts`: gemeinsame Zod-Schemas und TypeScript-Typen.
- `apps/server`: API, PTY- und Browser-Manager, Systemmetriken, Port- und Projekterkennung, Reverse Proxy und statische Web-Auslieferung.
- `apps/web`: React-Oberfläche, Navigation, xterm.js, Browser- und Preview-Geräteansicht sowie persistenter Workspace.
- `config`: zentrale Laufzeitwerte sowie committete Beispiele und lokal ignorierte Serverkonfigurationen.
- `deploy`: System- und User-systemd-Units sowie Tailscale-Serve-Skripte.

## Nutzungsanalyse und Accounts

CodexBar bleibt die Quelle für Live-Limits und lokale Token-/Kostenstatistiken. Das Backend importiert die HTTP-Antworten regelmäßig in eine lokale SQLite-Datenbank und ergänzt die Projektgruppierung über die CodexBar-CLI. Tages-, Modell- und Projektdaten werden idempotent aktualisiert; Limitfenster werden als Messreihe gespeichert. Prognosen entstehen erst ab drei Messpunkten desselben Fensters und bleiben klar von absoluten Tokenquoten getrennt.

Die Accountregistry speichert nur Anzeigenamen, Provider und lokale Profilpfade. Credentials verbleiben in den Profilen der jeweiligen CLI. Neue Logins laufen in einem typisierten PTY-Modus, der ausschließlich `codex login` oder `opencode auth login` mit einem isolierten Profil starten kann. Entfernen deregistriert den Account in Workbench und CodexBar, löscht aber weder Profilordner noch Anmeldedaten oder historische Statistiken.

## Sicherheitsgrenzen

- Alle eigenen Dienste binden standardmäßig nur an Loopback.
- Terminalzugriff erfordert einen erlaubten Tailscale-Login und akzeptiert ausschließlich typisierte Protokollnachrichten.
- Browserzugriff erfordert dieselbe erlaubte Tailscale-Identität und einen passenden Origin; DevTools und dauerhafte Profile sind nicht direkt über das Netzwerk erreichbar.
- Projekt-CWDs müssen innerhalb der konfigurierten Wurzelverzeichnisse liegen; freie Shell-Pfade werden kanonisch geprüft.
- Editor und Previews teilen den privaten HTTPS-Origin, wodurch weder unsicheres HTTP noch fremde CORS-Freigaben nötig sind.
- CSP-Framequellen entstehen ausschließlich aus validierten Service- und Preview-Konfigurationen.
- Fehlerantworten enthalten keine Secrets, Umgebungsvariablen oder internen Stacktraces.
- Terminal- und Editorprozesse benötigen absichtlich Schreibzugriff auf `/home/your-user/projects`; Kernel- und Systempfade bleiben über systemd gehärtet.
