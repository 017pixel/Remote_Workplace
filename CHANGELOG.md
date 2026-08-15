# Changelog

Alle Änderungen werden in fünf kurzen Stichpunkten pro Kategorie dokumentiert.

## [Unreleased]

### Extension-Plattform

- Langfristiges Ziel für eine lokale, serverzentrierte Extension-Plattform festgehalten
- Ausgangszustand von Router, Navigation, Orbit und Serverstart dokumentiert
- Migration in 16 kleine, überprüfbare Phasen gegliedert
- Kompatibilitätsregeln für bestehende Daten, Bookmarks und laufende Sitzungen festgelegt
- Zeitabhängige Usage-Testfixture für dauerhaft reproduzierbare Testläufe stabilisiert

### Extension-Plattform-Inventar

- Alle sichtbaren Routen, Navigationen und persistenten Flächen als Migrationsbasis erfasst
- Orbit-, Dashboard-, Settings- und Browserzustände mit ihren Kompatibilitätsgrenzen dokumentiert
- Server-APIs, WebSockets, Proxies, Hintergrunddienste und Datenbanken vollständig inventarisiert
- Sichere Ausgangswerte für Startzeit, Routenwechsel, Speicherbedarf und API-Latenz gemessen
- Migrationsreihenfolge anhand realer Kopplungen und bestehender Runtime-Grenzen priorisiert

### Extension-Plattform-Entscheidungen

- Kernel und sichtbare Extension-Flächen mit klaren Verantwortungen voneinander abgegrenzt
- Serverseitige Autorität für Installation, Berechtigungen und synchronisierte Präferenzen festgelegt
- Lokalen First-Party-Catalog ohne Remote-Registry als einzigen V1-Catalog beschlossen
- Einheitlichen atomaren Installations-, Update-, Rollback- und Deinstallationspfad definiert
- Manifest-, Extension-API- und Workbench-Version als getrennte Verträge festgelegt

### Extension-Contracts

- Eigenes Package für stabile öffentliche Extension-Verträge eingeführt
- Extension- und Contribution-IDs als kleingeschriebene Namespaces validiert
- Manifest V1 und Extension API 1 als unabhängige Versionskonstanten bereitgestellt
- Workbench- und API-Kompatibilität mit kanonischen Semantic Versions und Ranges geprüft
- Build, Typecheck und Tests um das neue Contract-Package erweitert

### Extension-Manifest

- Striktes Grundformat für lokale Extension-Pakete eingeführt
- Kompatibilität mit Workbench und Extension API verbindlich prüfbar gemacht
- Vertrauensstufen für System-, Built-in-, Catalog-, Developer- und Webview-Extensions festgelegt
- Lokale Entrypoints, Icons, README und Changelog gegen unsichere Pfade abgesichert
- Versioniertes JSON Schema für Editoren und künftige Extension-Werkzeuge bereitgestellt

### Extension-Berechtigungen

- 23 stabile Berechtigungen für Projekte, Dateien, Runtimes, Agenten und Systemzugriffe definiert
- Projekt-, Netzwerk-, Prozess-, Secret- und Service-Zugriffe gezielt einschränkbar gemacht
- Globale und eingeschränkte Rechte als verständlich prüfbare Anfragen getrennt
- Risikostufen zentral durch Remote Workplace statt durch Extensions festgelegt
- Doppelte, unbekannte und nicht passende Berechtigungsanfragen werden sicher abgewiesen

### Extension-Aktivierung

- Start, Projekt, Git-Repository und Agent als feste Aktivierungsereignisse definiert
- Commands, Routen, Orbit-Elemente, Events und geplante Jobs als verzögerte Trigger unterstützt
- Referenzen auf eigene Beiträge konsequent an den Extension-Namespace gebunden
- Doppelte, unbekannte und überlange Aktivierungsereignisse werden sicher abgewiesen
- Aktivierungsverträge im versionierten JSON Schema für Werkzeuge verfügbar gemacht

### Extension-Abhängigkeiten

- Pflicht- und optionale Extension-Abhängigkeiten mit stabilen IDs und Semantic-Version-Ranges definiert
- Konflikte mit optionaler Versionsspanne als eindeutige, strikt validierte Einträge ergänzt
- Selbstabhängigkeiten, Selbstkonflikte und widersprüchliche Beziehungen werden sicher abgewiesen
- Abhängigkeits- und Konfliktlisten auf nachvollziehbare Höchstgrößen begrenzt
- Dependency-Verträge im versionierten JSON Schema für Manager, CLI und Werkzeuge bereitgestellt

### Extension-Lifecycle

- 17 eindeutige Zustände für Installation, Aktivierung, Updates und Recovery definiert
- Erlaubte Zustandswechsel zentral und strikt prüfbar gemacht
- Install-, Permission-, Enable-, Disable-, Update- und Uninstall-Pfade abgesichert
- Crash, Quarantäne, Inkompatibilität und fehlgeschlagene Migrationen klar getrennt
- Laufende Operationen für spätere Restart-Recovery und atomare Fortsetzung gekennzeichnet

### Extension-Commands

- Commands als erste ausführbare Contribution Surface im Manifest geöffnet
- Stabile Command IDs mit Titel, Beschreibung und Kategorie definiert
- Fremde Namespaces, doppelte IDs und handlerlose Deklarationen werden abgewiesen
- Command-Aktivierung an ein tatsächlich deklariertes Ziel gebunden
- Command-Verträge im versionierten JSON Schema für künftige Registries bereitgestellt

### Extension-Routen

- Pages und Routes als getrennte, stabil referenzierbare Contributions definiert
- Lokale Pfade und Bookmarks mit sicheren Alias-Regeln abgesichert
- Shell, Persistenz, Prefetch und Projektkontext als einheitliche Metadaten ergänzt
- Doppelte IDs, fehlende Pages und kollidierende URL-Muster werden abgewiesen
- onRoute-Aktivierung an tatsächlich deklarierte Routes gebunden

### Extension-Navigation

- Gemeinsame Navigation Contributions für Desktop und Mobile definiert
- Navigationseinträge an tatsächlich deklarierte Extension-Routen gebunden
- Stabile Gruppen, Reihenfolge und Standardsichtbarkeit als Metadaten ergänzt
- Lokale Extension-Icons und namespaced Runtime-Referenzen sicher getrennt
- Fremde Icon-, Badge- und Route-Referenzen werden abgewiesen

### Extension-Orbit

- Versionierte Orbit Contributions mit stabiler Extension-Identität definiert
- Lokale State-Schemas und bestehende Orbit-Größengrenzen verbindlich gemacht
- Renderer, Inspector, Projektkontext und Verbindungen deklarativ beschreibbar gemacht
- onOrbitNode-Aktivierung an tatsächlich deklarierte Ziele gebunden
- Fehlende Extensions behalten Node State, Revisionen und Backups unverändert

### Extension-Dashboard

- Acht generische Dashboard Contribution-Typen ohne Produktsonderfälle definiert
- Quick Actions an tatsächlich deklarierte Commands gebunden
- Provider, Icons und IDs konsequent auf den Extension-Namespace begrenzt
- Größe, Reihenfolge, Projektkontext und Standardsichtbarkeit als Host-Metadaten ergänzt
- On-Demand-, Intervall- und Realtime-Aktualisierung mit sicheren Grenzen beschrieben

### Extension-Settings

- Schema-driven Settings Sections und eigene Settings Pages als Contributions definiert
- Zehn Feldtypen mit kontrollierten Defaults, Grenzen und Auswahlwerten ergänzt
- Server-, Benutzer- und Projekt-Scope als autoritative Speichergrenzen festgelegt
- Secret-Felder ohne Manifest-Default vom normalen Settings JSON getrennt
- Namespaced Section-, Field-, Page- und Icon-Referenzen strikt validiert

### Extension-Shortcuts

- Plattformübergreifende Keyboard Shortcuts und zweistufige Chords als Contributions definiert
- Shortcut Defaults an tatsächlich deklarierte Commands und stabile IDs gebunden
- Kontrollierte Context Expressions ohne ausführbaren Manifestcode ergänzt
- Editierbare Flächen, Tastaturwiederholung und plattformspezifische Overrides sicher begrenzt
- Sichtbare Konfliktbehandlung ohne stilles Überschreiben als Registry-Vertrag festgelegt

### Extension-Kontextmenüs

- Elf stabile Host-Surfaces und namespaced Extension-Surfaces für Kontextmenüs definiert
- Menüeinträge an tatsächlich deklarierte Commands und kontrollierte Gruppen gebunden
- Deterministische Reihenfolge unabhängig von Dateisystem und Registrierungszeit festgelegt
- Sichtbarkeit über die gemeinsamen strikt typisierten Context Expressions ermöglicht
- Fremde Surfaces, Icons, Context Keys und manifestweite ID-Kollisionen werden abgewiesen

### Extension-Statusleiste

- Text, Status, Zähler, Fortschritt und Commands als kompakte Statusarten definiert
- Linke und rechte Bereiche mit deterministischer Reihenfolge und Prioritäten ergänzt
- Provider, Commands, Icons und Context Keys sicher an eigene Contributions gebunden
- Platzmangel über kontrollierte Compact-Modi ohne Verdrängung geschützter Hostzustände geregelt
- Beliebiges Markup, unkontrolliertes Polling und Statusleisten als alleiniger Fehlerkanal ausgeschlossen

### Extension-Topbar

- Routegebundene Command-Aktionen und hostgerenderte Selector Contributions definiert
- Primäre, sekundäre und reine Overflow-Platzierungen kontrolliert geöffnet
- Icon-, Label- und Compact-Darstellungen mit klaren Platzgrenzen ergänzt
- Routes, Commands, Provider, Icons und Context Keys strikt auf gültige Contributions begrenzt
- Navigation, Breadcrumbs, Recovery-Flächen und beliebige Komponenten unter Hostkontrolle belassen

### Extension-Dateien

- Viewer und Open-With-Commands als sichere File Contributions definiert
- Exakte Endungs-, Dateinamen- und MIME-Matcher ohne Pfade, Globs oder Regex eingeführt
- Detail- und Quick-Look-Viewer auf kontrollierte Text-, Media- und Binary-Kanäle begrenzt
- Viewer verbindlich an UI-Entrypoint und ausdrückliche files.read Permission gebunden
- Dateizugriff, Symlink-Schutz und Schreibaktionen vollständig beim Capability Broker belassen

### Extension-Terminal

- Terminalprofile und Sitzungsaktionen als kontrollierte Contributions definiert
- Profile an hostverwaltete Provider und eine ausdrückliche Terminal-Berechtigung gebunden
- Toolbar, Session-Menü, Session-Liste und mobile Aktionen als feste Flächen geöffnet
- Beliebige Shell-Befehle, Zugangsdaten und direkte PTY-Steuerung aus Manifesten ausgeschlossen
- Laufende Sitzungen, Reconnect, Split und Workspace-Sync vollständig im sicheren Kernel belassen

### Extension-Previews

- Lokale Preview-Ziele und Preview-Aktionen als kontrollierte Contributions definiert
- Lesen und Verwalten von Sessions an getrennte Preview-Berechtigungen gebunden
- Eingebettete, externe und serverseitige Browserdarstellung klar voneinander getrennt
- URLs, Ports, Slots, Storage-Profile und Devserver-Befehle aus Manifesten ausgeschlossen
- Laufende Previews, Devserver, Diagnose, Quarantäne und Storage-Reset im sicheren Kernel belassen

### Extension-Browser

- Hostgerenderte Browser-Tools und Command-basierte Browser-Aktionen als Contributions definiert
- Toolzugriffe auf sieben explizite Browser-Broker-Operationen begrenzt
- Browser-Tools an Entrypoint und hochprivilegierte Browser-Berechtigung gebunden
- URLs, Profile, Cookies, Header, Downloadpfade und freie CDP-Methoden aus Manifesten ausgeschlossen
- Chromium, Sessions, DevTools-Proxy, Downloads und Idle-Cleanup im sicheren Kernel belassen

### Extension-Agent-Tools

- Command- und Provider-basierte Agent Tools als schema-validierte Contributions definiert
- Lokale JSON-Schemas für Eingaben und optionale strukturierte Ergebnisse vorgeschrieben
- Toolregistrierung an Server-Entrypoint und eigene Agent-Tool-Berechtigung gebunden
- Approval Policy auf zentrale Hostentscheidung oder strengere Einzelfreigabe begrenzt
- Prompts, Grants, Shell-Text, Tokens, Session-IDs und ausführbaren Code aus Manifesten ausgeschlossen

### Extension-Agent-Skills

- Lokale SKILL.md-Pakete als versionierte Agent Skill Contributions definiert
- Kollisionsfreie Skill-Namen verbindlich an den normalisierten Extension-Namensraum gebunden
- Codex, Claude Code, OpenCode und Hermes als kontrollierte Ziel-Harnesses festgelegt
- Registrierung an eigene Berechtigung, sichtbare Provenance und getrenntes Enablement gebunden
- Schreibzugriffe auf globale Regeln, User-Skills und fremde Extension-Skills ausgeschlossen

### Extension-Hintergrunddienste

- Serverseitige Background Services als hostverwaltete Provider Contributions definiert
- Health-Prüfungen mit festen Intervall-, Timeout- und Fehlerschwellen begrenzt
- Automatische Restarts auf ein nachvollziehbares Budget mit Zeitfenster und Backoff beschränkt
- Aktivierungszustand, Fehler und Neustartzähler als serverseitig autoritative Fakten festgelegt
- Freie Prozesse, systemd-Units und das Beenden nutzereigener Runtimes aus Manifesten ausgeschlossen

### Extension-Jobs

- Interval-, Cron-, One-shot- und Event-Zeitpläne als Scheduled Job Contributions definiert
- Parallelität und verpasste Läufe mit begrenzten Skip-, Queue- und Catch-up-Policies abgesichert
- Timeout, Retries, Backoff, Idempotenz und Cancellation als Host-Policies festgelegt
- Jobzustand und begrenzte Run History als serverseitig autoritative Daten eingeordnet
- Freie Cron-Daemons, unbegrenzte Queues und ungeprüfte Extension-Timer ausgeschlossen

### Extension-HTTP-RPC

- HTTP-Endpunkte strikt unter dem Extension-API-Namespace und typisierte RPC-Prozeduren definiert
- Request und Response an lokale JSON-Schemas sowie feste Größen- und Timeoutgrenzen gebunden
- Provider, IDs, Methoden und Pfadmuster auf sichere, kollisionsfreie Verträge begrenzt
- Workbench-Identität, Same-Origin, Audit und globale Rate Limits als unveränderliche Hostregeln festgelegt
- Rohe Requests, Replies, Header, Cookies, Redirects, Streams und Core-Routen ausgeschlossen

### Erstellt

- Offizielle Hermes-SPA als einzige sichtbare Hermes-Oberfläche in der Workbench
- DeepSeek V4 Flash als Standardmodell für Hermes, Mistral bleibt als Fallback
- Benachrichtigungen, wenn eine geplante Hermes-Aufgabe startet oder eine Freigabe benötigt
- Hermes-Status-, Aufgaben- und Ergebnisübersichten im Orbit
- Route-Bridge für Hermes-Deep-Links zwischen Workbench und offizieller SPA

### Verändert

- Hermes-Seite, Panels und Deep-Links verwenden ausschließlich die offizielle SPA
- Native Chat-, Aufgaben-, Verlauf- und Cron-Flächen der Workbench wurden entfernt
- Hermes-Status und Hintergrundaufgaben bleiben über die Workbench-Integration verfügbar
- Verwaltung, Chat, Cron und Einstellungen laufen über denselben Hermes-SPA-Kontext
- Alte Session- und Verwaltungslinks werden in offizielle Hermes-Routen übersetzt

### Behoben

- T3-Benachrichtigungen öffnen jetzt den richtigen Thread: Die T3-Thread-Route liegt am Root (`/$environmentId/$threadId`), nicht unter dem `/_chat`-Layout — vorher zeigte das Chat-Panel „Not Found" statt der Session aus der Benachrichtigung
- Alte T3-Tiefenlinks mit `/_chat`-Präfix werden beim Öffnen auf die Root-Thread-Route normalisiert
- Hermes-Session- und Verwaltungs-Tiefenlinks öffnen wieder zuverlässig ihr tatsächliches Ziel
- Die mobile Hermes-Navigation liegt ohne Überlagerung in der Daumenzone und hält 44-Pixel-Touchziele ein
- Sessions lassen sich im Verlauf und in der Seitenleiste über einen zugänglichen Bestätigungsdialog löschen

### Preview-System

- Mehrere persistente Projekt-Tabs lassen sich gleichzeitig öffnen, starten und verwalten
- Automatisch erkannte Dienste teilen sich die feste Portpalette konfliktfrei über alle laufenden Projekte
- Tatsächliche Portzuweisungen und das logische Hauptziel bleiben bei Backend-Neustarts erhalten
- Inaktive Tabs zeigen ihren Laufzeitstatus, während nur das aktive Projekt vollständige Logs abruft
- Desktop-Tab-Leiste, mobile Projektauswahl und Sammelaktionen verwenden dieselben laufenden Projektzustände

### Preview-System

- Frontend, Backend, API, WebSocket, Datenbank und Worker werden als gemeinsame Projektlaufzeit erkannt und beaufsichtigt
- Projektports stammen ausschließlich aus der zentralen Palette `1234, 1223, 8000, 8080, 8888, 4444, 1233, 6000, 6060, 4040`
- Laufende Dev-Server werden zuverlässig erkannt; Status und Logs aktualisieren sich live und bleiben nach Workbench-Neustarts sichtbar
- Der Preview Hub zeigt Laufzeit, Dienste, Hauptziel und direkte URL klar getrennt; der neue Tab ist die Primäraktion
- Projektprozesse starten unabhängig von Preview-Slots, überleben Workbench-Neustarts und stellen alte Slot-Origins beim Öffnen automatisch wieder her

---

## [0.43.0] - 2026-08-10

### Erstellt

- Eigenständige Terminalfenster, die ausschließlich die ausgewählte laufende Sitzung anzeigen
- Terminal-Fokusmodus ohne Workbench-Sidebar, Topbar, Statusleiste und mobile Navigation
- Atomarer Split-Befehl für eine neue unabhängige Sitzung rechts neben dem aktiven Terminal
- Explizite linke und rechte Pane-Identitäten für zuverlässige Fokus- und Tabwechsel
- Verlustfreie Migration bestehender Terminalbereiche auf das neue Split-Datenmodell

### Verändert

- Terminalfarben auf eine ruhige, matte Pastellpalette mit klar unterscheidbaren ANSI-Farben umgestellt
- Splitgrößen werden mit der zugänglichen Panel-Komponente gezogen, per Tastatur bedient und gespeichert
- Neue Split-Sitzungen starten im aktuellen Unterordner des aktiven Terminals
- Mausrad- und Touch-Scrollen reagieren zeilengenauer und halten bis zu 10.000 Verlaufszeilen
- Projektwahl und Werkzeugaktionen schließen in der Topbar bündig am rechten Rand ab

### Behoben

- Tabwechsel im Split ersetzen nur das fokussierte Pane und vertauschen die Seiten nicht mehr
- Schließen eines sichtbaren Split-Tabs klappt kontrolliert auf die verbleibende Sitzung zusammen
- Kompakte und mobile Ansichten zerstören einen vorhandenen Desktop-Split nicht mehr
- „In neuem Tab öffnen“ lädt nicht länger die gesamte Remote Workplace
- Terminal-Vollbild blendet die Workbench-Navigation aus, ohne den Browser-Vollbildmodus zu erzwingen

---

## [0.42.0] - 2026-08-06

### Verändert

- Benachrichtigungen: Push geht nur noch raus, wenn die Workbench nicht aktiv genutzt wird; fokussierte und offene Chats liefern stattdessen Toast und Inbox-Eintrag
- T3-Benachrichtigungen öffnen den passenden Thread direkt in der Workbench (SPA-Tiefenlink statt Proxy-Vollseite), auch aus Push-Meldungen und der Inbox
- T3 „Plan ist bereit" erscheint als Info statt Warnung, damit autonome Zwischenpläne weder Push noch Fehler-Optik auslösen
- Textinhalte der Benachrichtigungen nennen das Projekt (T3, Codex, OpenCode, Terminal)
- Push auf Apple-Geräten funktioniert wieder: VAPID-Subject mit gültiger Domain und APNs ohne Topic-Header
- Previews bleiben stabil: Die Session hält ihren Slot, bis du das Ziel entfernst oder echte Slot-Knappheit herrscht; Command-R und Tab-Wechsel brechen keine Preview mehr ab

### Behoben

- T3-Tiefenlinks nutzen die echte Thread-Route (`/_chat/<environmentId>/<threadId>`); ohne das Layoutsegment brach T3 mit „fetch-session-state (HTTP 500)" ab
- Ältere T3-Links ohne `_chat`-Layout (aus früheren Push- und Inbox-Einträgen) werden beim Öffnen automatisch auf die Thread-Route normalisiert
- Presence verfällt jetzt nach 90 Sekunden ohne Heartbeat; geschlossene Tabs und gekillte PWAs markieren nichts mehr dauerhaft als gelesen
- Offene Panels (z. B. T3 in der Workbench) melden ihren Chat als sichtbar; Inbox-Einträge für offene Chats unterbleiben
- „Braucht Input"-Erkennung im Terminal meldet erst nach einer Schreibpause und erkennt mehr Warte-Muster, Zwischenschritt-Fehlalarme entfallen
- Beim Push-Klick wird das zuletzt sichtbare Workbench-Fenster verwendet statt des ersten
- Abgestürzte Preview-Devserver startet die Workbench automatisch neu (mit Backoff); die Fehlerseite lädt sich danach selbst neu

---

## [0.41.0] - 2026-08-06

### Erstellt

- Einheitliche, terminalnahe Designsprache über die gesamte Workbench: große Flächen 4 px, Buttons und Kleinteile 2 px
- Alle Pillen, Zähler und Toggles eckig, Monospace für Pfade, Status und Abschnitts-Kicker
- OpenCode-Modelle und -Projekte aus der lokalen OpenCode-Datenbank in der Nutzungsanalyse
- Projektaufschlüsselung mit den meistbearbeiteten Projekten der letzten 365 Tage
- Account-Verwaltung nach Werkzeug gruppiert mit luftigeren Profilkarten

### Verändert

- Tech TLDRs, Dashboard, Inbox, Workbench und alle Werkzeuge auf die eckige Kantensprache umgestellt, Blur bleibt erhalten
- Werkzeug-Auswahl der Projektkarten als kompaktes Dropdown neben dem Öffnen-Button
- Deaktivierte Primäraktionen bleiben auf dem blauen Akzent lesbar statt grau zu verblassen
- Nutzung zeigt OpenCode-Go-Modelle mit Tokens und Kosten aus den lokalen Sessiondaten
- Gerätecode-Anmeldung und Account-Karten im Bereich Nutzung besser erkennbar

---

## [0.40.0] - 2026-08-03

### Erstellt

- Unabhängige Push-Abos für mehrere Android- und iPadOS-Geräte derselben Workbench-Identität
- Gerätebezogener Aktivieren-, Deaktivieren- und serverseitiger Testablauf in den Einstellungen
- Automatische Reparatur verlorener Servereinträge und Erneuerung nach einem VAPID-Schlüsselwechsel
- Versionierte Push-Payloads mit sicheren Deep-Links, ereignisabhängiger TTL und stabilem Tag
- Automatisierte Mehrgeräte-, Policy-, Fehler-, VAPID- und Browserclient-Tests samt realer Abnahmecheckliste

### Verändert

- Globale Server-Push-Policy und lokale Subscription des aktuellen Geräts sind klar getrennt
- Warnungen, Fehler, relevante Agentenabschlüsse, Rückfragen und Pläne folgen einer zentralen Push-Policy
- Der Push-Versand arbeitet begrenzt parallel und protokolliert permanente sowie temporäre Fehler strukturiert
- Der Service Worker fokussiert bestehende PWA-Fenster, öffnet sichere Ziele und markiert Einträge bestmöglich gelesen
- iPadOS erklärt die notwendige Home-Screen-Installation, ohne außerhalb der PWA eine Permission anzufragen

### Gelöscht

- Globales Entfernen aller Geräte durch den normalen Geräte-Schalter
- Irreführender `subscribed`-Status, der irgendein statt das aktuelle Geräte-Abo beschrieb
- Starre Fünf-Minuten-TTL für zeitweise offline befindliche Mobilgeräte
- Fest verdrahteter Inbox-Link für jede Push-Nachricht
- Stilles Verschlucken von Push-Fehlern und unkontrollierter Versand an alle Endpoints gleichzeitig

---

## [0.39.1] - 2026-08-02

### Verändert

- News-Suche verträgt Bindestriche und Sonderzeichen („Open-Source", „KI-Modell") statt mit 500 abzubrechen
- Nutzungsübersicht summiert alle Provider pro Tag: „Tokens heute" und die 30-Tage-Projektion stimmen wieder
- Inbox lädt alle Benachrichtigungen per „Weitere laden", zeigt Aktionsfehler an und blendet Gelesenes auch mobil aus
- Tech TLDRs zeigt Listen- und Synchronisierungsfehler mit „Erneut versuchen" an und aktualisiert sich selbst
- Alte Workspace-Speicher (benjamin-dev-workbench.*) werden beim Start automatisch übernommen

### Repariert

- Große HTML-Antworten von Previews und T3 werden hart begrenzt statt unbegrenzt gepuffert; Dateimanager-Uploads erreichen ihr eigenes Limit
- T3-Downgrade auf Stable warnt in der UI und sichert state.sqlite automatisch
- Beendete Terminal-Sessions räumen sich selbst auf, fehlende CLIs melden „nicht installiert", langsame Dienste melden „unbekannt"
- Panel-Limit zeigt eine klare Meldung, Sidebar räumt bei Abbruch auf und speichert die Breite zuverlässig
- Design-System: ANSI-, Icon- und Syntax-Farben in den @theme-Block, sichtbare Gradients entfernt

### Gelöscht

- Ungenutzte klassische Workbench-Ansicht und tote Routendefinitionen entfernt
- Veraltete Migrations-Artefakte aus dem Datenverzeichnis entfernt
- Toten Versions-Cache und doppelte Hermes-Speicherung entfernt

---

## [0.39.0] - 2026-08-02

### Erstellt

- Neues Werkzeug „KI-Skills": globale Agenten-Regeln und alle Skills direkt in der Workbench bearbeiten
- Skill-Baum mit Beschreibung, Verweis-Kennzeichnung und Warnung bei kaputten Verweisen
- Markdown-Editor mit Vorschau, Syntaxhervorhebung und Prüfung des Skill-Frontmatters
- Neue Skills entstehen im offiziellen Format und werden automatisch an Claude Code und Codex verteilt
- Ein Knopf committet und pusht das Skills-Repository mit automatisch gebauter Commit-Nachricht

### Verändert

- Gespeichert wird ohne Knopf: nach kurzer Tippause, beim Dateiwechsel und beim Schließen der Seite
- Der Speicherstatus ist jederzeit sichtbar, inklusive Uhrzeit der letzten Sicherung
- Parallele Änderungen von außen führen zu einer Rückfrage statt zu stillem Überschreiben
- Umbenennen zieht Ordner, alle Verweise, den Frontmatter-Namen und die README-Zeile mit
- Löschen entfernt den Skill samt Verweisen, ohne fremde Ziele anzufassen

---

## [0.38.0] - 2026-08-02

### Erstellt

- Eigene Inbox-Seite mit drei Quellbereichen und chronologischem mobilen Stream
- Sofortige Zustellung neuer Einträge über eine Live-Verbindung mit Polling-Fallback
- System-Benachrichtigungen per Web-Push für wichtige Rückfragen, Pläne und Fehler
- Fehlerberichte mit kopierbarem Reparaturauftrag und Übergabe an T3 Code
- Benachrichtigungen für T3 Code, Hermes, Codex, OpenCode, Claude Code und lange Terminal-Prozesse

### Verändert

- Die Glocke öffnet jetzt die vollständige Inbox und zeigt den echten offenen Ungelesen-Zähler
- Toasts sind kleiner, dezenter, auf drei Einträge begrenzt und per Wischgeste schließbar
- Gelesen-, Erledigt- und Gelöscht-Zustände folgen nun dem tatsächlichen Status der zugehörigen Aufgabe
- Benachrichtigungsschwellen und Zustellwege lassen sich zentral und pro Quelle konfigurieren
- Terminal- und Agentenhinweise öffnen direkt die zugehörige Sitzung oder den konkreten T3-Thread

### Gelöscht

- Das kleine Benachrichtigungs-Popover in der Kopfzeile wurde entfernt
- Kurze Hermes-Antworten ohne Werkzeugnutzung erzeugen keine Einträge mehr
- Unveränderte Hermes-Updates melden keinen falschen Versionssprung mehr
- Erledigte Einträge bleiben nicht mehr als sichtbarer Verlauf in der Inbox stehen
- Das separate Bestätigen von Fehlern wurde durch Lesen, Fehlerbericht und Löschen ersetzt

---

## [Unveröffentlicht]

### Erstellt

- Preview Hub als zentrale Projektsteuerung mit neustartfestem Dev-Server, Status, Logs, Hauptport und Tailscale-URL
- Eigenständige Xcode-artige Geräteansicht für externe Preview-Fenster mit Ausrichtungswechsel
- Persistenter Öffnungsmodus für ein eigenes Browserfenster oder einen neuen Tab
- Kontextuelle Workbench-Aktionsinsel mit zur Panelanzahl passenden Preview-Rastern
- Verträge, Datenbanktabellen und Tests für Prozesssteuerung, Ports, Logs und Hub-Einstellungen
- Hermes-Flächenleiste: Chat, Sessions, System, Cron, Auswertung, Logs, Modelle direkt sichtbar, der Rest unter „Mehr"
- Dauerhafte Hermes-Statusanzeige im Kopf mit Chat-, Dashboard-, Gateway-, Modell- und Versionszustand
- Routen-Brücke vom Workbench-Iframe in die Hermes-SPA: Seitenwechsel in Millisekunden statt komplettem Neuaufbau
- Native Hermes-Agent-Oberfläche mit ACP-Streaming, Sessionliste, Toolkarten, Freigaben und Stopptaste
- Eingebettete offizielle Hermes-Verwaltung unter dem geschützten `/hermes`-Präfix mit Forwarded-Host und Theme
- Hermes-Status-, Aufgaben-, Cron- und Ergebnisflächen im Orbit sowie ein wiederverwendbarer Hermes-Werkzeugknoten
- Persistente Benachrichtigungszentrale mit Toasts, Ungelesen-Zähler und bestätigbaren Fehlern
- User-Units, täglicher Europe/Berlin-Update-Timer, Retry-Lauf, Backup- und Diagnosepfad für Hermes
- Dateimanager „Finder" als eigene Seite und Workbench-Werkzeug: Drei-Pane-Ansicht mit Verzeichnisbaum, Liste/Raster und Vorschau-Panel
- Quick Look per Leertaste: Live-Vorschau für Code (Syntax-Highlighting), Bilder, Video, Audio, PDF, HTML-Render und Markdown, auf Mobil als Bottom Sheet
- Serverseitig synchronisierter Dateimanager-Zustand: aktueller Pfad, Verlauf und Favoriten gelten auf allen Geräten
- Dateiaktionen im Server-Dateisystem: Umbenennen, Verschieben, Löschen, Ordner anlegen, Upload per Auswahl oder Drag & Drop, Download
- Integrationen: Ordner in Terminal oder Editor öffnen, als Projekt registrieren, in den Orbit einbetten
- Neues Dashboard als Betriebszentrale mit Gesamtaussage im Kopf statt reiner Kachelsammlung
- Kennzahlenleiste mit CPU, Arbeitsspeicher, Datenträger, Event-Loop, Anfragen und Fehlerquote samt Verlauf
- Eigener Bereich „Workbench-Diagnose" mit Bereitschaftsprüfungen, Betriebshinweisen, Audit, Orbit und Preview-Slots
- Bento-Raster aus unterschiedlich breiten Kacheln, das sich beim Aufklappen animiert neu ordnet
- Vorladen von Bündel und Startdaten häufig genutzter Ansichten beim Antippen und im Leerlauf

### Verändert

- README zeigt Hermes Agent mit frischen Screenshots von Chat und Systemansicht und nennt Hermes in Funktionen und Danksagungen
- Hermes trägt jetzt das offizielle Markenzeichen von Nous Research statt einer Nachzeichnung — in Sidebar, Mobilnavigation, Werkzeugleiste, Orbit-Palette und Kopfzeile
- Der Hermes-Bereich übernimmt die Farbwelt der offiziellen Oberfläche (Teal, Creme) und setzt Remote Workplace nur als Grünakzent
- Die offizielle Hermes-Oberfläche steht in der Flächenleiste statt hinter dem Drei-Punkte-Menü; das Menü führt nur noch Aktionen
- Das Verwaltungs-Iframe wird einmal montiert und danach nur ein- und ausgeblendet, statt bei jedem Flächenwechsel neu zu laden
- Hermes-Sessions bleiben mit Telegram und Cron im gemeinsamen `~/.hermes/state.db` statt in einer zweiten Workbench-Datenbank
- Die Freigabelogik verwendet `ask`, entfernt pauschale gefährliche Dauerfreigaben und bindet Antworten an die Session
- Workbench-Konfiguration, Contracts und Orbit-Dokumente bleiben additiv rückwärtskompatibel bis Version 8
- Dashboard- und Update-Aktionen laufen ausschließlich über validierte User-Units und atomare Zustandsdateien
- Status- und Modelladapter berücksichtigen die reale Hermes-API inklusive `state: connected` und String-Modellkatalogen
- Galerie (Mediengalerie und Dateigalerie) ist als eigenes Feature aufgelöst; Upload und Download laufen über den Dateimanager
- Navigation und Orbit-Palette führen „Dateien" statt „Galerie"; bestehende Galerie-Knoten im Orbit bleiben erhalten
- Schnellaktionen stehen als ruhige Leiste am Seitenende statt als Blickfang oben
- Serverdiagnose zeigt Verlauf, Hostfakten und alle Laufwerke in einem Panel statt in aufklappbaren Details
- Alle Abstände kommen aus einem einzigen Seitenraster; Panels bringen keine eigenen Ränder mehr mit
- Diagramme skalieren mit dem Spitzenwert, statt bei niedriger Last als flache Linie am Rand zu liegen
- Der Zeitraumwechsel in der Nutzung behält die alte Auswertung, statt die Seite zu leeren

### Repariert

- Sicherheitsupdates für `undici`, `fast-uri` und `brace-expansion` schließen die aktuellen High-Severity-Befunde
- Hermes-Dashboard-Theme war unlesbar: `palette.midground` ist bei Hermes die helle Schriftfarbe, stand aber auf `#111111` — schwarze Schrift auf schwarzem Grund
- Die Sessionliste verdeckte auf dem Smartphone Kopfzeile und Flächenleiste; sie ist jetzt ein Drawer im Chatbereich und startet eingeklappt
- Textvorschau lehnt UTF-8-Dateien nicht mehr ab, wenn die Kürzungsgrenze ein Zeichen zerschneidet
- Klicks in der Sidebar gehen nicht mehr verloren, wenn sie vor dem Laden des Orbit ausgelöst werden (Warteschlange statt verlorenem Event)
- Isolierter E2E-Server erbt keine produktiven Pfade mehr aus der .env und überschreibt keine echten Orbit-Backups
- E2E-Tests laufen wieder gegen den isolierten Server: Routen nach dem /workbench-Umbau, Identität für API-Aufrufe, Orbit-Schema-Version
- Endlose Render-Schleife im Verlaufsspeicher des Dashboards behoben
- Pseudo-Dateisysteme unter einem Gigabyte verfälschen die Datenträgeranzeige nicht mehr
- Bereitschaftsprüfung meldet bei Antwort 503 jetzt „eingeschränkt" statt dauerhaft „Prüfung läuft"
- Links zu Nutzung und News laden die Anwendung nicht mehr komplett neu
- Kurven verzerren beim Strecken nicht mehr und behalten ihre Strichstärke

## [0.36.0] - 2026-07-29

### Erstellt

- Atomare Routing-Revisionen und Slot-Affinität je Storage-Profil samt fail-closed Quarantäne nach nicht verifizierbarem Reset
- Benutzergebundene Preview-API mit Tailscale-Identität, Ownership, Same-Origin-Pflicht und Loopback-Capability für den Doctor
- Externe Bridge unter `/__workbench/preview-bridge.v1.js` mit parse5-Injektion, Diagnoseprotokoll und Navigationsepochen
- Best-Effort-Diagnose mit gekennzeichneter Quelle, Redaction, Drop-Zählern und redigierten JSONL-Logs für sieben Tage
- Opt-in-Snapshots des localStorage mit AES-256-GCM, Revisionskonflikten und höchstens drei historischen Ständen

### Verändert

- Canvas, Sidebar, Vollbildroute und Browser-Panel verwenden dieselbe `LocalPreviewRuntime`
- Gateway v2 passt nur die Embedding-Regel an, statt CSP und `X-Frame-Options` pauschal zu entfernen
- Serverseitige Gerätepräferenz mit Slot-Override; Orbit-Dokumente wandern auf Version 7
- Erkannte Projekt-Dienste sind Vorschläge mit Kapazitätsvorschau und werden erst nach Bestätigung verbunden
- Externe Adressen bieten „Im Browser öffnen" oder Server-Chromium, statt den lokalen Gateway zu benutzen

### Repariert

- Geräterahmen skalieren auf ganze Gerätepixel und zeigen keine weißen Haarlinien mehr
- Geteilte Slots verlangen einen identischen Binding-Fingerprint und haben keinen mehrdeutigen Sessionkontext mehr
- Link-, Location- und Set-Cookie-Header werden korrekt behandelt statt als eine URL interpretiert
- Zu große, nicht UTF-8-kodierte oder streamende HTML-Antworten bleiben unverändert nutzbar
- Diagnose-Batches haben ein eigenes benutzerbezogenes Limit statt des globalen IP-Budgets

## [0.35.0] - 2026-07-28

### Erstellt

- Projektweite Preview-Sessions verbinden Frontend, Backend und weitere bestätigte Dienste über getrennte Tailscale-HTTPS-Ports
- Dauerhafte Freigabe neu erkannter Begleitdienste direkt in der Preview
- Laufzeit-Bridge für Fetch, XHR, EventSource, WebSocket und Beacon bei lokalen Port-Zielen
- Prozess- und Projektzuordnung in der Erkennung laufender lokaler Ports
- Zwölf statt sechs gleichzeitig nutzbare, isolierte Preview-Slots

### Verändert

- Vollbild bleibt im bestehenden Orbit und erhält die bereits laufende Direkt- oder Server-Preview
- Ein externes Fenster ist eine eigene Menüaktion und übernimmt den aktuellen, noch nicht gespeicherten Orbit-Zustand
- Preview-Slots werden atomar reserviert, zeitlich geleast und erst nach der letzten Session freigegeben
- HTTP-, HTTPS- und WebSocket-Proxys übernehmen Anwendungsheader und entfernen einbettungsfeindliche Antwortheader
- Preview-Ports und Tailscale-Zuordnungen werden vollständig aus der zentralen Workbench-Konfiguration erzeugt

### Repariert

- Frontends können Backends auf anderen lokalen Ports ohne Mixed-Content- oder Netzwerkfehler erreichen
- Server-Chromium wechselt beim Vollbild nicht mehr ungewollt auf eine lokale iframe-Preview
- Alte Einzel-Slot-Aufräumvorgänge trennen keine aktiven oder geteilten Preview-Sessions mehr
- Abgelaufene Sessions geben nur tatsächlich unbenutzte Slots frei
- Doppelte Fastify-HEAD-Routen und komprimierte HTML-Antworten verhindern keine Bridge-Injektion mehr

## [0.34.0] - 2026-07-28

### Erstellt

- Schnellwechsel des serverweit aktiven Accounts mit einem Klick — für Codex, Claude Code und OpenCode
- Aktiv-Kennzeichnung, E-Mail-Adresse und Tarif auf jeder Accountkarte
- Verbleibende Limits aus CodexBar direkt bei jedem Account statt nur in der Übersicht
- `scripts/ki-account.sh` zum Anzeigen und Umschalten der aktiven Accounts auf der Kommandozeile
- Selbstheilung: ersetzt ein CLI die Anmeldeverknüpfung, wandern die neueren Zugangsdaten zurück in ihren Speicher

### Verändert

- Accounts eines Werkzeugs teilen sich Projekte, Sessions und Konfiguration; getauscht wird nur die Anmeldung
- Ein Accountwechsel braucht weder Abmeldung noch neue Geräteanmeldung
- Der Knopf für die CodexBar-Überwachung heißt jetzt „Überwachen“ und nicht mehr „Aktivieren“
- Accounts, die noch auf das gemeinsame Home zeigen, bekommen beim Aktivieren einen eigenen Anmeldespeicher
- Der serverweit aktive Account lässt sich nicht versehentlich entfernen

## [0.33.0] - 2026-07-28

### Erstellt

- Eigene KI-Recherche-Seite in den Tech TLDRs mit Chat, Quellenspalte und Bildvorschau
- Auswahl des Mistral-Modells für Antworten, inklusive Merken der letzten Wahl
- Kopier- und Neu-erzeugen-Knopf für jede KI-Antwort
- Wisch-Pager im mobilen Feed mit Flug-Erkennung, Gummiband und kurzem Haptik-Impuls
- Mitzählende Zahlen im Fortschritt statt springender Werte

### Verändert

- Der Aktualisieren-Knopf ist nur noch ein kleines Symbol in der Kopfzeile
- Kopfbereich, Kategorieleiste und Filterknopf laufen weich aus statt an harten Kanten zu enden
- Der Bereichswechsler unten ist größer, der KI-Knopf bekommt einen eigenen, luftigen Platz
- Der Feed sortiert nach Wichtigkeit mit Altersabschlag, damit frische Meldungen vorn stehen
- Sammlungen zeigen auf beiden Ansichten Titelbilder und einen dauerhaft sichtbaren Löschknopf

### Repariert

- Weiße Schrift auf allen blauen Knöpfen — sie war zuvor unsichtbar
- Bestätigungsdialoge sitzen wieder mittig, weil sie an den Seitenkörper gehängt werden
- Der mobile Feed lädt nicht mehr den kompletten Nachrichtenbestand in den Browser
- Überschriften und Listen aus KI-Antworten werden gerendert statt als Rohtext gezeigt
- Das Filtersymbol sitzt mittig in seinem Knopf

## [0.32.0] - 2026-07-27

### Erstellt

- Schnelle iframe-Vorschau für lokale Ports direkt im Browser-Werkzeug
- Geräteansicht und Direkt/Server-Umschalter auch im Browser-Werkzeug
- Quellenanzeige im Browser-Werkzeug: iframe-Origin oder Chromium-Ziel

### Verändert

- Ein Klick auf einen lokalen Port im Browser öffnet ihn direkt im selben Fenster statt in einem neuen Preview
- Der Server-Chromium im Browser-Werkzeug startet erst bei echter externer Navigation, nicht mehr beim bloßen Öffnen
- Lokale Browser-Vorschauen teilen sich einen Preview-Slot pro Zielport

### Gelöscht

- Ungenutzten Chromium-Prozess beim Öffnen des leeren Browser-Werkzeugs

## [0.31.0] - 2026-07-27

### Erstellt

- Sechs getrennte HTTPS-Preview-Slots für schnelle lokale Entwicklungsansichten
- Benannte Preview-Gruppen mit einem, zwei, drei oder sechs parallelen Slots
- Eigenes Browserfenster mit allen Slots einer Gruppe nebeneinander im Vollbild
- Geräteansichten mit Notch, Dynamic Island, Punch-Hole und Home-Indikator
- Sichtbare Quellenanzeige je Preview: direktes iframe oder Server-Chromium

### Verändert

- Lokale Previews rendern standardmäßig direkt im iframe statt als JPEG-Browserstream
- Neue Preview-Slots starten mit iPhone-13-Maßen statt im freien Responsive-Modus
- Ein Layoutwechsel hängt Slots an, statt vorhandene Previews zusammenzuquetschen
- Preview-Leisten lassen sich auf ihrer gesamten freien Fläche verschieben
- Gerätewahl, Isolation, Laufzeit und Ausrichtung lassen sich pro Slot festlegen

### Gelöscht

- code-server-Absproxy als Standardweg für Development-Previews
- Server-Chromium als versteckter Standard für lokale Preview-Panels
- Projektabhängige Vite-Basis-Pfade für Preview-Router und HMR
- Zusätzliche Griff-Symbole in den Kopfleisten von Gruppen und Slots
- Systemdienste und Ports ohne HTTP-Antwort in der lokalen Portübersicht

## [0.30.3] - 2026-07-26

### Erstellt

- Resetzeit für jedes einzelne Limit in den Codex-, OpenCode- und Claude-Code-Blöcken des Infinite Canvas
- Sichtbare Anzahl aktuell verfügbarer Codex-Reset-Guthaben mit eindeutigem Leerzustand

### Verändert

- Anbieterstatus auf der Seite „Nutzung und Limits“ vollständig auf Deutsch
- Lange Account- und Limitnamen in Canvas-Blöcken bleiben auch bei schmalen Fenstern lesbar

### Behoben

- Verbrauchte Codex-Reset-Guthaben blieben in der Anzeige erhalten, obwohl CodexBar sie nicht mehr meldete
- Zwei vollständige Codex-Accounts wurden wegen eines zusätzlichen veralteten Anmeldeeintrags fälschlich als unvollständig markiert
- Englische Titel, Beschreibungen und Statusangaben der Codex-Reset-Guthaben in der deutschen Oberfläche

## [0.30.2] - 2026-07-25

### Behoben

- **Verbindungslinien übernahmen eine geänderte Knotenfarbe erst nach einem Neuladen.** Die Zuordnung Knoten → Kante wurde nur neu berechnet, wenn sich Position, Größe oder Projekt änderten — die Farbe stand nicht in den Abhängigkeiten. Der Knoten wechselte deshalb sofort, seine Linien erst nach F5. Gilt auch für den Weg zurück auf „Auto".

## [0.30.1] - 2026-07-25

### Behoben

- **Pinch-to-Zoom im Infinite Canvas funktionierte auf keinem Touchgerät.** Sobald der erste Finger den Schwenk startete, legte sich das Interaktions-Schild über die Fläche; der zweite Finger landete darauf statt auf dem Canvas, und die Zwei-Finger-Geste kam nie an. Auf Touch ist das Schild jetzt durchlässig — für die Maus bleibt es, damit eingebettete iframes beim Ziehen keine Ereignisse schlucken.
- Die Orbit-Insel hing auf dem iPad am Menüknopf links und lief mit ihrer Verlaufskante rechts aus dem Bild. Sie sitzt jetzt oben mittig (gemessener Mittenversatz: 0 px in Hoch- und Querformat sowie auf dem Handy).
- Der aktive Eintrag der Navigationsseite war gegenüber den übrigen eingerückt und stand schief in der Spalte. Er sitzt jetzt bündig und wird durch Rahmen plus durchgehende Linie an der linken Kante markiert — auf Handy und iPad gleich.

### Verändert

- Navigationsseite auf dem iPad: im Hochformat eine einfache Liste untereinander statt zwei Spalten, im Querformat weiterhin drei Spalten in einer Linie

## [0.30.0] - 2026-07-25

### Erstellt

- Farbwahl für Orbit-Knoten mit zwölf Pastelltönen statt acht kräftigen, dem Farbkreis des Systems für alles dazwischen und eigenen Farben, die als Vorgabe erhalten bleiben (bis zu zwölf, im Browser gespeichert)
- Eigene Farben lassen sich einzeln wieder entfernen

### Verändert

- „Auto" ersetzt das nicht zentrierte „A" im Farbmenü und sitzt jetzt mittig
- Orbit-Kontextmenü von 238 px auf 268 px verbreitert, damit sechs Farbfelder je Reihe hineinpassen

### Behoben

- Im Terminal standen zwei Meldungen mit derselben Aussage untereinander: der alte Fehlertext und darunter das Banner mit dem Neustart-Knopf. Der Fehlertext steht jetzt im Banner, es bleibt bei einer Meldung.

## [0.29.1] - 2026-07-25

### Behoben

- **Zwischengespeicherte Ansichten wurden bei jedem Seitenwechsel verworfen.** Die Fehlergrenze jeder Route trug die *laufende* Adresse als `key`; beim Navigieren wechselte er für alle geparkten Routen mit, und React baute sie komplett neu auf. T3 Code, Code-Server und Terminal luden dadurch jedes Mal neu, obwohl der Seiten-Cache sie hielt. Gemessen: Instanzen überstehen den Wechsel jetzt in allen acht geprüften Bereichen.
- Der Seiten-Cache sortierte seine Einträge nach Zugriff um; React hängte die DOM-Knoten dabei um, was `iframe`-Inhalte neu lädt. Die Renderreihenfolge liegt jetzt fest, die Verdrängung läuft über eine getrennte Liste.
- Der Neustart-Knopf im Terminal erschien nur bei sauber beendeten Sitzungen. Er kommt jetzt auch bei Sitzungsfehlern und bei dauerhaft abgerissener Verbindung (nach acht Sekunden Karenz, damit er bei kurzen Aussetzern nicht aufblitzt).
- Der Neustart greift auch ohne offene Verbindung oder Sitzung: Er verbindet neu beziehungsweise legt eine Sitzung an, statt wirkungslos zu bleiben.

### Verändert

- Aktiv- und Fokusrahmen von 2 px auf 1 px halbiert (Sidebar, Navigation, Meldungen, Fokusring)

## [0.29.0] - 2026-07-25

### Erstellt

- Beendetes Terminal zeigt „Das Terminal läuft nicht" mit Neustart-Knopf: startet dieselbe Sitzung im selben Verzeichnis und legt den zuletzt abgeschickten Befehl wieder in die Eingabe — Enter genügt
- Farbwahl für Orbit-Knoten im Kontextmenü (acht Töne plus „automatisch"); die ausgehenden Verbindungen übernehmen die Farbe
- Feld `color` am Orbit-Knoten in den Verträgen, damit die Auswahl den Neustart überlebt
- Griffe an allen acht Seiten und Ecken beim Skalieren von Orbit-Flächen, nicht mehr nur an den vier Ecken

### Verändert

- Aktive Einträge in Sidebar und Navigation tragen einen umlaufenden 2-px-Rahmen statt eines Farbstrichs an der linken Kante; dasselbe gilt für Fehler-, Warn- und Neustart-Meldungen
- Größengrenze für Orbit-Flächen von 2.400 × 1.600 px auf 20.000 px angehoben — große Bereiche ließen sich vorher nicht weit genug aufziehen
- Geparkte Routen sind auf zehn begrenzt und werden nach letztem Zugriff verdrängt (LRU); vorher wuchs der Cache unbegrenzt
- Bis zu zehn gleichzeitige Werkzeug-Laufzeiten statt acht

### Behoben

- **Verschieben in Galerie-Ordner war unmöglich:** Das Auswahlmenü klappte nach oben aus der Karte heraus und wurde vom `overflow: hidden` der Karte und vom scrollenden Gitter verschluckt — unsichtbar und nicht klickbar. Es ist jetzt ein Dialog und funktioniert in Medien- wie Dateigalerie.
- Nach drei erfolglosen automatischen Neustarts blieb im Terminal nur ein Hinweisband ohne Handlungsmöglichkeit

## [0.28.0] - 2026-07-25

### Erstellt

- Suchfeld auf der Navigationsseite: filtert die vierzehn Ziele live, mit Leerzustand bei keinem Treffer
- Weiche Verlaufskanten an allen scrollbaren Leisten (Orbit-Insel, Kategorien in Tech TLDRs, Terminal-Sondertasten) — man sieht jetzt, dass es seitlich weitergeht
- Trenner vor dem KI-Knopf der News-Insel; er ist eine eigene Aktion, kein dritter Reiter

### Verändert

- Orbit-Insel ist auf Tablets so breit wie ihr Inhalt statt wie der Bildschirm — vorher stand dort eine fast leere Leiste über die volle Breite
- Alle Inseln nutzen dieselben Glas-, Radius- und Rahmen-Tokens und denselben Aktiv-Zustand (getönte Fläche plus Akzentfarbe)
- News-Insel weicht auf kurzen Landscape-Höhen zurück und der Inhalt bekommt unten Platz — sie lag vorher auf dem Primärknopf
- Navigationsseite: lesbare statt ausgegraute Labels, aktiver Eintrag mit Akzentbalken statt umlaufendem Rahmen, keine baumelnden Trennlinien mehr am Spaltenende
- Tablet im Hochformat begrenzt die Inhaltsbreite auf 880 px; Datenzeilen rissen Label und Wert vorher über die ganze Breite auseinander
- Suchfeld in Tech TLDRs auf 560 px begrenzt statt über die volle iPad-Breite
- Terminal-Fehlerband eingerückt und gerundet statt randlos; Sondertasten mit Radius aus der Skala
- „Lesen" in Tech TLDRs ist Akzentblau statt Weiß — es war der einzige weiße Button der App
- Orbit-Kanten und Projektfarben eine Stufe dunkler (500er statt 400er), die hellen Töne wirkten auf dem Canvas neon

### Behoben

- **Browserprofile verloren Cookies und Anmeldungen beim Beenden:** Nach `Browser.close` folgte sofort ein SIGTERM, während Chromium das Profil noch schrieb. Jetzt wird bis zu drei Sekunden auf den regulären Exit gewartet, erst danach eskaliert der Abbruch. Der zugehörige Integrationstest schlug dadurch in etwa jedem dritten Lauf fehl und läuft nun stabil.
- Die Navigationssuche war im Stylesheet per `display: none` abgeschaltet, obwohl die Styles vollständig vorhanden waren

## [0.27.0] - 2026-07-25

### Erstellt

- Palette von T3 Code Nightly übernommen: neutrale Basis `#0a0a0a`, Flächen aus weißen Transparenz-Auflagen (4/6/8/12 %) statt einer Treppe opaker Grautöne
- Schriften DM Sans Variable (Text) und JetBrains Mono (Code) selbst gehostet über `@fontsource`
- Glas-Tokens (`--glass-blur`, `--glass-saturation`, `--glass-tint`) für Topbar und Statusleiste
- Kräftiges Blau `oklch(58.8% .217 264)` als Akzent- und Fokusfarbe, dazu Emerald/Amber/Red als Statusfarben
- Kategoriale Orbit-Palette aus acht klar unterscheidbaren Tönen für Projektknoten und Kanten

### Verändert

- 272 hartkodierte Farbwerte im Stylesheet auf Design-Tokens umgestellt; übrig bleiben nur die drei bewusst weißen Flächen (Geräte-Vorschau, Browser-Canvas)
- Radius-Skala rechnet wie in T3 aus `--radius: .625rem` (Karten und Buttons sind runder)
- Primäraktionen sind gefülltes Blau mit weißer Schrift statt eines getönten Rahmens
- ANSI-Palette des Terminals auf die kräftigen Tailwind-Töne umgestellt
- 22 halbtransparente Overlay-Flächen auf die dunklere Basis umgerechnet, damit sie nicht aufhellen
- `theme-color` und Manifest-Farben auf `#0a0a0a`; die PWA startet damit im neuen Dunkelton

## [0.26.0] - 2026-07-25

### Erstellt

- Einstellungen → „T3 Code Kanal": Umschalter zwischen Stable (`t3@latest`) und Nightly (`t3@nightly`) mit aktivem Kanal, Version und Erreichbarkeit
- `GET /api/v1/system/t3-channel` und `POST /api/v1/system/t3-channel` — Status lesen und Wunschkanal speichern
- `scripts/sync-t3-channel.sh` tauscht beim Neustart das npm-Paket, beendet den alten Prozess (SIGTERM, dann SIGKILL), wartet auf Port 3773 und prüft per HTTP, ob T3 wieder antwortet
- systemd-**User**-Unit `t3-code.service` (Template + Render + `scripts/install-t3-unit.sh`) mit unveränderten Argumenten `serve --host 127.0.0.1 --port 3773 <projectsRoot>`
- Abschnitt `t3` in `config/workbench.*.json` für Kanal, Paket, Pfade, Port und die Zeitlimits des Wechsels

### Verändert

- Der Kanalwechsel greift bewusst erst beim nächsten Neustart; die Card zeigt bei Abweichung „Neustart erforderlich" und springt zu den vorhandenen Neustart-Buttons
- `scripts/restart-backend.sh` und `restart-all.sh` prüfen den Kanal vor dem Dienst-Neustart — stimmt er und antwortet T3, passiert nichts
- Health-Check für T3 Code läuft über HTTP (`http://127.0.0.1:3773/`) statt über eine system-weite systemd-Unit, die es nie gab — der Dienststatus zeigt jetzt „active"
- T3-Proxy liest Host und Port aus der Config, statt sie doppelt zu hinterlegen
- T3 Code wird nicht mehr über `~/.local/bin/t3-code-service` gestartet; der Altstarter wird beim Wechsel beendet, damit Port 3773 frei wird

## [0.25.2] - 2026-07-25

### Erstellt

- Filter für harmlose Browser-Meldungen im Crash-Report, erweiterbar über eine dokumentierte Liste
- Ignorierte Meldungen erscheinen im Verlauf des Berichts, statt spurlos zu verschwinden
- Wiederholte Verlaufseinträge werden zu `(N×)` zusammengefasst
- Unit-Tests für die Absturz-Erkennung (`crashReport.test.ts`)
- E2E-Test, der prüft, dass eine ResizeObserver-Meldung kein Pop-Up öffnet

### Verändert

- `ResizeObserver loop completed with undelivered notifications` gilt nicht mehr als Absturz — die Meldung ist laut Spezifikation harmlos und trat im Orbit (`@xyflow/react`) beim Zoomen auf
- Inhaltslose Cross-Origin-Meldungen (`Script error.`) und abgebrochene Anfragen (`AbortError`) lösen kein Pop-Up mehr aus
- Der Berichtsgenerator liest `location`, `navigator` und Viewport defensiv, statt ohne DOM selbst zu scheitern

## [0.25.1] - 2026-07-25

### Erstellt

- Crash-Report als großes Pop-Up: kopierbarer Bericht inklusive Arbeitsauftrag für einen KI-Agenten
- Fehlergrenzen um App und jede Route, damit ein Absturz nicht mehr die ganze Seite weißfärbt
- `GET /api/v1/system/restart/status` mit Phase, aktuellem Schritt und ANSI-bereinigtem Build-Log
- Neustart-Fehler erscheinen in den Einstellungen samt Log-Ausschnitt und Kopier-Knopf
- Lint-Regeln `react-hooks/rules-of-hooks` und `exhaustive-deps` für `apps/web`

### Verändert

- Sidebar rief Hooks bedingt auf (`!collapsed && useSectionCollapsed(...)`) — das Aus-/Einklappen ließ die Seite abstürzen
- Eingeklappte Sidebar zeigt jetzt alle Sektionen; vorher fehlten Werkzeuge, Galerie und Blöcke komplett
- `scripts/lib-restart.sh` findet pnpm auch ohne passenden PATH (bekannte Orte, dann corepack)
- `workbench.service`: `StartLimitIntervalSec` von `[Service]` nach `[Unit]` — dort wurde es ignoriert, der Dienst gab nach 5 Fehlstarts auf
- Server protokolliert unbehandelte Ausnahmen und Promise-Fehler, statt wortlos zu enden

### Gelöscht

- Verwaiste Symlinks auf die nicht mehr existierende `benjamin-dev-workbench.service`
- Doppelter, identischer Render-Zweig in den Orbit-Palettenabschnitten der Sidebar
- Feste Versionsnummer `0.24.0` in `app.test.ts`, die bei jedem Versionssprung brach

## [0.25.0] - 2026-07-23

### Erstellt

- Echtes Bento-Raster für die Mediengalerie mit Bild-Kacheln in variabler Größe
- Overlay mit Dateiname und Aktionen erscheint erst beim Überfahren einer Kachel
- Neutraler blauer Synchronisierungshinweis für übernommene Serverstände
- Verbesserter Empty-State der Galerie mit klarem Upload-CTA und Drag-&-Drop-Hinweis
- Neun eingebundene Produkt-Screenshots in der README

### Verändert

- Dateigalerie zeigt kompakte Karten, deren Aktionsknöpfe nicht mehr zusammengequetscht werden
- Galerie-Steuerung bricht in schmalen Orbit-Knoten sauber um (Container-Queries)
- Gelöste Revisionskonflikte gelten nicht länger als Fehler und färben die Statusinsel nicht rot
- Screenshot-Abschnitt der README zeigt echte Ansichten statt Platzhalter
- Versionsstände von Root, Server und Web auf 0.25.0 angehoben

### Gelöscht

- Platzhalter-Screenshots (orbit/terminal/news/usage) aus `docs/screenshots`
- Irreführende rote Statusmeldung nach automatisch aufgelösten Konflikten
- Fixe, überlappende Aktionsleiste innerhalb der Bildkacheln

## [0.24.0] - 2026-07-22

### Erstellt

- Großer Server-Dateibaum für die freie Orbit-Projektwahl
- Direkte Navigation zu absoluten, Home- und relativen Serverpfaden
- Dauerhafte Registrierung beliebiger Unterordner als Orbit-Projekte
- Eigenständige mobile Vollbildansicht für den Projektbrowser
- Tastaturbedienung, Ladezustände und verständliche Pfadfehler

### Verändert

- Orbit-Projektliste zeigt zuletzt geöffnete Projekte sofort zuerst
- Projektwahl verwendet auf Desktop eine übersichtliche Zwei-Spalten-Ansicht
- Mobile Befehlspalette öffnet den gemeinsamen Serverprojekt-Browser
- Große Ordner werden stufenweise und paginiert geladen
- Projektwerkzeuge akzeptieren auch manuell registrierte Arbeitsordner

### Gelöscht

- Kleines Popup mit ausschließlich vorab erkannten Projekten
- Beschränkung der Orbit-Projektwahl auf direkte Projekt-Unterordner
- Vollständiges Vorabladen tiefer Server-Verzeichnisstrukturen
- Auswahl von Dateien und symbolischen Verweisen als Projekte
- Verzögerte Sortierung zuletzt verwendeter Orbit-Projekte

## [0.23.0] - 2026-07-22

### Erstellt

- Claude Code als dritter Limitanbieter über die bestehende CodexBar-Anbindung
- Automatische Erkennung des lokal angemeldeten Claude-Code-Accounts und Abos
- Verwaltbare Claude-Code-Profile mit erneuter Anmeldung im geschützten Terminal
- Historische Claude-Code-Kosten, Tokenwerte und Limitprognosen
- Claude-Code-Nutzungsknoten für den Orbit Workspace

### Verändert

- Statusleiste zeigt Codex, OpenCode und Claude Code gemeinsam an
- Nutzungsübersicht ordnet Claude-Limits dem erkannten Account zu
- Accountverwaltung bietet alle drei lokalen Coding-Anbieter in einer Auswahl
- Datensammler übernimmt Claude-Limits und lokale Kosten im bestehenden Intervall
- Claude-Abruf nutzt OAuth mit zuverlässigem lokalem CLI-Fallback auf Linux

### Gelöscht

- Beschränkung der Nutzungsanzeige auf Codex und OpenCode
- Abhängigkeit von der unter Linux hängenden Claude-Webquelle
- Manuelle Zuordnung des vorhandenen Claude-Standardprofils
- Starre Datenbankbeschränkung auf zwei Accountanbieter
- Fehlende Claude-Code-Anzeige in Statusleiste und Orbit

## Unreleased

### Erstellt

- KI-Assistent mit Verlauf: Nachfragen verstehen den bisherigen Dialog und verwandte Beiträge
- Quellen-Chips in KI-Antworten öffnen den zitierten Artikel direkt im Leser
- Vorgeschlagene Anschlussfragen nach jeder KI-Antwort
- Sammlungsübersicht auf der gespeicherten Seite mit Beitragszählern
- Fortschrittsbalken im Leser und Story-Zähler im mobilen Snap-Feed

### Verändert

- Copy und Paste verwenden in Terminal, Entwicklungswerkzeugen und Browser wieder zuverlässig den aktuell ausgewählten Inhalt
- Solide transluzente Story-Leseflächen mit geprüftem Kontrast ohne Verläufe
- Ruhigere Story-Scrims, besserer Schwung beim Scrollen und klare Story-Position
- Pop-ups und Bottom-Sheets mit gefederter Einblendung statt hartem Erscheinen
- KI-Kontext: Artikel-Chat nutzt den Beitrag plus inhaltsähnliche News als Grundlage
- Desktop-Bento mit Bild-Zoom, Gelesen-Punkt und präziserem Wichtigkeitstyp
- KI auf mobile Geräte geholt über eigene Insel-Taste und Vollbild-Blatt

### Gelöscht

- Mehrstufige Verläufe und unruhige Verschattung in der mobilen Story-Ansicht
- Versteckte KI-Eingabe auf Mobilgeräten ohne sichtbaren Zugang

### Erstellt

- Serverseitige Registry für Shell-, Codex- und OpenCode-Sessions
- Synchronisierte Terminal-Tabs und Areas für mehrere Geräte
- Session-Liste zum Öffnen, Neustarten und Beenden verwaister Sessions
- Gemeinsamer PTY-Zugriff mehrerer verbundener Geräte
- Unterbrechungsstatus nach Backend-Neustarts ohne automatische Prozesswiederherstellung

## [0.22.0] - 2026-07-18

### Erstellt

- Zentrale Responsive-Shell für Smartphone, Tablet, kurze Displays und Desktop
- Vollständige Navigationsseite mit Suche, zuletzt verwendeten Zielen und Tablet-Raster
- Fokusfalle, Scroll-Lock, Browser-Zurück, Fokus-Rückgabe und ergänzende Edge-Swipes
- Strukturierte Lade-, Fehler-, Bestätigungs- und Umbenennungsdialoge
- Geräteprojekte für Phone hoch/quer und iPad hoch/quer in Playwright

### Verändert

- Touch-Tablets verwenden Navigation und 44–48-Pixel-Ziele statt Desktop-Sidebar und Statusbar
- Workbench, Orbit, Browser, Terminal und Tech TLDRs reagieren auf Eingabemodus und Orientierung
- VisualViewport, Safe Areas und Software-Tastatur steuern die nutzbare App- und Terminalhöhe
- Projekt-, Usage-, Settings- und PWA-Oberflächen sind für schmale und mittlere Ansichten abgestuft
- Service-Worker-Updates werden sichtbar angeboten und erst nach Bestätigung aktiviert

### Gelöscht

- Bottom-Navigation als mobile Navigationsoption
- Breitenabhängiger Desktop-Mischzustand in Smartphone-Querformat und auf Touch-Tablets
- Native Browser-Prompts und -Bestätigungen für Workspace-, Account- und Workbench-Aktionen
- Redundanter Panelkopf und schwebende Panelsteuerung auf Browser- und Notion-Touch-Routen
- Gradient-Scrims in Tech TLDRs

## [0.21.0] - 2026-07-18

### Erstellt

- Dauerhafter tmux-Supervisor für Shell-, Codex- und OpenCode-Läufe
- Serverseitig persistente Chromium-Profile mit gespeichertem Login- und URL-Zustand
- Notion als angemeldetes, geräteübergreifend geteiltes Orbit- und Workbench-Werkzeug
- Vollständige, durchsuchbare Orbit-Projektwahl für alle erkannten Projektordner
- Kombinierte Projektaktivität aus Workbench-Nutzung, Dateisystem und letztem Git-Commit

### Verändert

- Terminal-Sessions überstehen Browser-, Backend- und Gerätewechsel und lassen sich erneut anbinden
- Bereits vorhandene tmux-Läufe werden bei genau einem erlaubten Benutzer sicher in die Session-Liste übernommen
- Konfigurierte und lokale Previews verwenden standardmäßig den synchronisierten Chromium-Lauf
- Die Orbit-Sidebar zeigt nur die tatsächlich neuesten Projekte und trennt eingeklappte Bereiche sichtbar
- Browser-WebSockets prüfen strikt den Workbench-Origin; der RSS-XML-Parser ist auf die vollständig gepatchte Version aktualisiert

### Gelöscht

- Temporäre Chromium-Profile, die Anmeldungen nach Leerlauf oder Neustart verloren haben
- Starre Auswahl weniger fest angezeigter Orbit-Projekte
- Veralteter Sidebar-Eintrag `neue-datei.ts`
- Automatisches Unterbrechen beaufsichtigter Terminal-Läufe beim Backend-Neustart
- iframe-Zwang für Previews mit authentifiziertem, geräteübergreifendem Zustand

## [0.20.1] - 2026-07-16

### Erstellt

- Direkt sichtbare Sammlungsleiste im gespeicherten Nachrichtenbereich
- Beitragszähler für jede benannte Sammlung
- Sichtbarer Ladezustand beim mobilen Wechsel zu gespeicherten Nachrichten
- Rücksetz-Aktion für leere gefilterte Sammlungsansichten
- Browserprüfungen für gespeicherte Beiträge auf Smartphone und Desktop

### Verändert

- Sammlungen lassen sich auf kleinen und großen Ansichten mit einem Klick wechseln
- Mobile Sammlungsziele sind mindestens 44 Pixel hoch und horizontal scrollbar
- Der Filter zeigt im gespeicherten Bereich Kategorien statt versteckter Sammlungen
- Der Speicherstatus im geöffneten Artikel aktualisiert sich unmittelbar
- Aktive Bereiche, Sammlungen und Filter sind für Hilfstechnologien klar ausgezeichnet

### Gelöscht

- Versteckte Sammlungswahl aus dem erweiterten Filtermenü
- Leere mobile Fläche während des ersten Ladevorgangs
- Veraltete Speicherbeschriftung nach Änderungen in der Vollansicht
- Missverständlicher Leerzustand bei aktiven Such- oder Filterkriterien
- Zurückgelassene temporäre Sammlungen aus früheren Browserprüfungen

## [0.20.0] - 2026-07-16

### Erstellt

- Aufrufbarer KI-Chat im Artikelreader mit eigener Schließen-Aktion
- Automatische Bildsuche auf Artikelseiten für Feeds ohne direktes Cover
- Direkter YouTube-Link als verlässliche Alternative zum eingebetteten Player
- Medienprüfungen für RSS-Bilder, YouTube-Thumbnails und erneute Synchronisierungen
- Kompakte E-Mail-Kurzformen für mehrere Accounts in der unteren Limit-Leiste

### Verändert

- RSS- und Atom-Medien werden aus verschachtelten Feedfeldern und Artikelmetadaten gelesen
- Mobile Suche, Filter und Kopfleiste gehen weich in den Nachrichteninhalt über
- Lange mobile Titel bleiben durch eine anpassbare dunkle Lesefläche klar erkennbar
- Der Artikelreader nutzt auf Smartphone und Desktop den verfügbaren Platz ruhiger aus
- Bilder, Speicheraktionen und Videoeinbettungen reagieren robuster auf kleine und große Ansichten

### Gelöscht

- Dauerhaft sichtbarer KI-Chat am unteren Rand mobiler Artikel
- Feed-Adressen, die irrtümlich als Coverbilder gespeichert wurden
- Platzhalterbilder, die die eigentliche Quellenkarte verdeckt haben
- Referrer-Sperre, die eingebettete YouTube-Videos blockiert hat
- Harte Kanten zwischen mobiler Navigation, Textfläche und Artikelbild

## [0.19.0] - 2026-07-16

### Erstellt

- Servergeeignete Codex-Anmeldung mit einmaligem Gerätecode
- Gemeinsame Verwaltung für gefundene und registrierte Accountprofile
- Sichtbarer Anmeldestatus für jedes lokale CLI-Profil
- Ausgeschriebene Entfernen-Aktion mit Bestätigung und Rückmeldung
- Regressionstest für mehrere Codex-Accounts im Canvas-Limitblock

### Verändert

- CodexBar lädt Codex-Limits vorrangig explizit für alle Accounts
- Nach einer Anmeldung werden Limit-Cache und Nutzungsdaten sofort erneuert
- Registrieren, Umbenennen, Aktivieren und Entfernen liegen in derselben Accountkarte
- Der Anmeldedialog erklärt den Remote-Ablauf ohne lokalen Browser-Rückruf
- Neue Codex-Anmeldungen verwenden eine eigene persistente Gerätecode-Terminalsitzung

### Gelöscht

- Lokaler OAuth-Rückruf als Codex-Anmeldeweg auf dem Server
- Getrennte Bereiche für lokale Profile und registrierte Accounts
- Unbeschriftete Papierkorb-Aktion in der Accountverwaltung
- Bevorzugung unvollständiger Einaccount-Daten des CodexBar-Dienstes
- Wiederverwendung älterer browserbasierter Codex-Anmeldesitzungen

## [0.18.0] - 2026-07-16

### Erstellt

- Direktes Umbenennen jeder Arbeitsfläche in der oberen Steuerleiste
- Persistenzgarantie für Fenster außerhalb des sichtbaren Canvas-Ausschnitts
- Automatische verständliche Namen für neu angelegte Arbeitsflächen
- Browserprüfung für ungespeicherte Zustände in weit entfernten Fenstern
- Rückwärtskompatible Bereinigung alter Szenendaten beim Laden

### Verändert

- Terminals, Editoren, Browser und Vorschauen bleiben außerhalb des Sichtfelds vollständig geladen
- Die Dynamic Island konzentriert sich ausschließlich auf Arbeitsflächen und Canvas-Werkzeuge
- Arbeitsflächennamen werden zusammen mit dem übrigen Orbit dauerhaft auf dem Server gespeichert
- Der Umbenennungsmodus verwendet kompakte Bedienelemente und große mobile Touch-Ziele
- Neue Arbeitsflächen heißen einheitlich Arbeitsfläche statt Orbit

### Gelöscht

- Szenen-Auswahl aus der Dynamic Island
- Schaltfläche zum Speichern einer Canvas-Ansicht als Szene
- Szenen-Aktionen aus dem Orbit-Zustand
- Szenen-Datenmodell aus dem aktiven Arbeitsflächenformat
- Sichtfeldabhängiges Entladen von Canvas-Fenstern

## [0.17.0] - 2026-07-16

### Erstellt

- Persistente To-do-Listen mit editierbaren Aufgaben und abhakbarem Fortschritt
- Direkter CodexBar-CLI-Fallback bei ausgefallenem oder festgefahrenem HTTP-Dienst
- Automatische Gebietserweiterung während eines laufenden Fenster-Dragvorgangs
- Kollisionsprüfung für Verbindungstexte entlang jeder gerouteten Linie
- Direkter Login-Dialog für bereits registrierte lokale CLI-Profile

### Verändert

- Code-Server öffnet für jeden Knoten immer den Pfad des zugeordneten Projekts
- Limitanzeigen verarbeiten alle erkannten Codex-Accounts und sämtliche OpenCode-Zeitfenster
- Nicht benötigtes Canvas-Gebiet wird nach dem Ablegen automatisch wieder kompaktiert
- Sidebar besitzt eine schmale, vollständig bedienbare Scrollleiste für lange Paletten
- Skalierungsgriffe liegen mit ihrem sichtbaren Mittelpunkt exakt auf den Fensterecken

### Gelöscht

- Übernahme des zuletzt in code-server geöffneten und möglicherweise falschen Projekts
- Harte Abhängigkeit der Limitanzeige vom instabilen CodexBar-HTTP-Listener
- Erweiterung des Infinite Canvas erst nach dem Loslassen eines Fensters
- Durchscheinende Verbindungstexte hinter überlagernden Canvas-Fenstern
- Seitlich und unterhalb der Fenster versetzte Skalierungsflächen

## [0.16.0] - 2026-07-16

### Erstellt

- Unveränderliche lokale Sicherungsdatei für jede erfolgreich gespeicherte Orbit-Revision
- Vollständige Orbit-Versionshistorie direkt in der lokalen SQLite-Datenbank
- Automatische Wiederherstellung aus der letzten geprüften Sicherung bei fehlendem Datenbankstand
- Serverseitige Wiederherstellungsentwürfe für Konflikte und blockierte Löschvorgänge
- Zusätzlicher Browser-Entwurfsschutz für Änderungen während Neuladen und Code-Updates

### Verändert

- Orbit-Laufzeitdaten liegen updatefest außerhalb des Projektverzeichnisses
- Autosave-Konflikte behalten immer den neueren Serverstand und sichern den lokalen Entwurf getrennt
- Ungewöhnlich große automatische Datenverluste werden vor dem Überschreiben blockiert
- SQLite schreibt Orbit-Daten und Revisionen mit vollständiger Dauerhaftigkeit auf den Datenträger
- Skalierungspunkte sitzen geometrisch exakt auf allen vier Fensterecken

### Gelöscht

- Einzelne überschreibbare Orbit-Zeile als einzige Sicherungsquelle
- Blindes erneutes Speichern eines veralteten Browserstands nach Revisionskonflikten
- Projektgebundener Datenbankpfad als Risiko bei Builds und Quellcode-Aktualisierungen
- Versetzte sichtbare Skalierungspunkte neben den tatsächlichen Fensterecken
- Stilles Leeren größerer Arbeitsflächen durch fehlerhafte Autosave-Zustände

## [0.15.0] - 2026-07-16

### Erstellt

- Kontextmenüs für freie Canvas-Flächen, Fenster, Bereiche, Terminals und Anwendungen
- Vollständige Chromium Developer Tools mit Konsole, Elementen, Netzwerk und Debugger
- Editierbare Verbindungstexte und speicherbare Kontrollpunkte im Abstand von etwa 100 Pixeln
- Browseraktionen für Quelltext, Bildschirmaufnahme, Navigation, Neuladen und Untersuchen
- Authentifizierter CDP-WebSocket-Proxy ohne Freigabe des lokalen Chromium-Debug-Ports

### Verändert

- Skalierungsgriffe sitzen exakt an den Ecken und greifen höchstens acht Pixel außerhalb
- Vergrößerte Drag-Pillen liegen vier Pixel über Live-Fenstern und blockieren keinen Inhalt
- Pinch-Zoom steuert auch über Werkzeugen und eingebetteten Frames ausschließlich den Canvas
- Projektkarten übernehmen dieselbe eindeutige Farbe wie ihre automatisch erzeugten Linien
- Verbindungen wählen die nähere Knotenseite und verlaufen orthogonal mit sanft gerundeten Ecken

### Gelöscht

- Großflächige Skalierungszonen innerhalb interaktiver Fensterinhalte
- Horizontale Eigenschaftenkarte als eingeklappter Desktop-Trigger
- Browser-Zoom der gesamten Workbench bei Trackpad-Gesten über Werkzeugen
- Dauerhafte Browser-Screencasts für nicht mehr verbundene Arbeitsflächen
- Einheitlich blaue Projektkarten trotz unterschiedlich gefärbter Projektverbindungen

## [0.14.0] - 2026-07-16

### Erstellt

- Neuer Workspace-Bereich Tech TLDRs mit laufendem, kategorisiertem Nachrichtenfeed
- Deutsche KI-Kurzfassungen, Langfassungen und automatische Wichtigkeitsbewertungen
- Quellengebundene Fragen zu einzelnen Meldungen und zum gesamten Nachrichtenbestand
- Benennbare Sammlungen zum dauerhaften Speichern interessanter Beiträge
- Mobile Social-Feed-Ansicht und großzügiges Editorial-Bento für Desktop

### Verändert

- Workspace-Navigation enthält Tech TLDRs auf Desktop und Smartphone
- Nachrichten werden beim Scrollen automatisch und ohne Seitenwechsel nachgeladen
- Externe Coverbilder werden sicher über den Server geladen und zuverlässig ersetzt
- Such-, Filter- und Medienansichten teilen denselben synchronisierten Datenbestand
- Workbench-Version und Einstellungsanzeige wurden auf Version 0.14.0 erhöht

### Gelöscht

- Begrenzung des Newsbereichs auf eine feste erste Ergebnisseite
- Doppelte Kopfleiste in der mobilen und Desktop-Nachrichtenansicht
- Sichtbare defekte Bilder bei blockierten externen Coverquellen
- Abhängigkeit von englischen Teasern für bereits verarbeitete Meldungen
- Unbelegte freie KI-Antworten ohne Bezug zum vorhandenen Nachrichtenbestand

## [0.13.0] - 2026-07-16

### Erstellt

- Eingeklappter Eigenschaften-Trigger am rechten Rand für ausgewählte Knoten
- Vier unsichtbare Eckzonen zum intuitiven Skalieren ausgewählter Fenster
- Zentrierte Radar-Minimap mit Zieh-, Zoom- und Tastaturnavigation
- Adaptive hochauflösende Browserübertragung mit scharfer Textdarstellung
- Neue Desktop- und Mobile-Prüfungen für alle überarbeiteten Canvas-Bedienelemente

### Verändert

- Zoomsteuerung endet jetzt direkt hinter dem Vollbildschalter ohne leere Fläche
- Skalierungspunkte erscheinen nur noch am aktuell ausgewählten Knoten
- Browser-Inhalte lassen sich bedienen, ohne den Eigenschaftenbereich sofort zu öffnen
- Minimap hält den aktuellen Arbeitsbereich dauerhaft in ihrer Mitte
- Browseraufnahmen passen Qualität und Auflösung automatisch an die Fenstergröße an

### Gelöscht

- Dauerhaft sichtbare blaue Skalierungspunkte an allen Canvas-Fenstern
- Sofortiges Aufklappen des Eigenschaftenbereichs bei jeder Knotenauswahl
- Unzentrierter Sichtbereich in der bisherigen Übersichts-Minimap
- Unnötiger Leerraum rechts neben den Canvas-Zoomschaltern
- Unscharfe niedrig aufgelöste Browserbilder beim Vergrößern von Fenstern

## [0.12.0] - 2026-07-16

### Erstellt

- Mobiler Canvas-Modus zum zuverlässigen Bewegen und Zoomen über allen Knoten
- Inhaltsmodus für die direkte Bedienung von Terminal, Editor, Browser und Notizen
- Horizontale Touch-Steuerleiste mit sichtbaren Schaltern für weitere Befehle
- Daumenfreundliches Fünfer-Dock für Befehle, Moduswechsel und Zoom
- Mobile Regressionstests für Zwei-Finger-Gesten, kleine Smartphones und Tablets

### Verändert

- Zwei-Finger-Gesten verschieben und skalieren den Orbit auch über Knotenflächen
- Orbit nutzt auf Smartphones und Tablets sichere Abstände für Aussparungen und Home-Leiste
- Interaktive Griffe, Modusschalter und Canvas-Aktionen besitzen größere Touch-Ziele
- Eigenschaften öffnen auf Mobile nur außerhalb direkt bedienbarer Knoten-Inhalte
- Die mobile Navigation ersetzt die Desktop-Sidebar nun auch im Tablet-Hochformat

### Gelöscht

- Touch-Konflikte zwischen eingebetteten Werkzeugen und der Canvas-Navigation
- Abgeschnittene Befehle in der oberen Orbit-Steuerung auf schmalen Displays
- Dauerhaft offene Synchronisierungsdetails durch Touch-Hover-Zustände
- Zu kleine mobile Zoom-, Verbindungs- und Skalierungsziele
- Abhängigkeit von einer Maus für das zuverlässige Navigieren großer Arbeitsflächen

## [0.11.0] - 2026-07-15

### Erstellt

- Echter Chromium-Browser mit Adresssuche, Navigation und persistenten Sitzungen
- Automatische Übersicht erreichbarer lokaler HTTP-Ports in Preview und Browser
- Getrennte Werkzeugansichten für Previews und den freien Browser
- Projektbezogene Farben für deutlich unterscheidbare Orbit-Verbindungen
- Regressionstests für freies Skalieren, Bereichsverbindungen und Browser-Sitzungen

### Verändert

- Alle Orbit-Knoten lassen sich ohne vorherige Auswahl an Rändern und Ecken skalieren
- Verschieben speichert erst am Gestenende und öffnet keinen Eigenschaftenbereich mehr
- Synchronisierungsinsel, Zoomsteuerung und Minimap-Anordnung sind kompakter und klarer
- Projektaktionen öffnen T3 Code, Editor und Preview direkt in der passenden Werkzeugansicht
- Limitprognosen zeigen nur die aktuelle Reset-Serie mit verständlichen Konten- und Fensternamen

### Gelöscht

- Auswahlzwang vor dem Skalieren von Fenstern und Bereichen
- Unbeabsichtigtes Öffnen des Eigenschaftenbereichs beim Verschieben
- Doppelte und veraltete Karten in den Limitprognosen
- Einheitlich blaue Verbindungslinien für unterschiedliche Projekte
- Tote Preview-Ansicht ohne hilfreichen Einstieg in lokale Dienste

## [0.10.1] - 2026-07-15

### Erstellt

- Mehrstufiger Cache-Schutz samt Sicherung veralteter Orbit-Entwürfe
- Begrenzte Wartezeit mit Streuung bei wiederholten Synchronisationskonflikten
- Serverseitige Kennzeichnung dynamischer Daten als nicht cachebar
- Neue Service-Worker-Version für die sofortige Cache-Bereinigung
- Regressionstest für nicht gespeicherte API-Antworten

### Verändert

- Orbit lädt Revisionen nach Konflikten direkt; alte Tabs übernehmen sicher den Serverstand
- Wiederholte Speicherversuche verlangsamen sich kontrolliert statt den Server zu überlasten
- Der Service Worker unterscheidet Root-API und Workbench-Dateien korrekt
- Browseranfragen umgehen HTTP- und PWA-Caches für dynamische Daten
- Die Workbench meldet Version 0.10.1

### Gelöscht

- Endlosschleife aus Konfliktantworten neuer und bereits geöffneter alter Tabs
- Veraltete Orbit-Revisionen aus dem PWA-Cache
- Starres Wiederholungsintervall bei anhaltenden Serverkonflikten
- Zwischenspeicherung dynamischer API-Lesezugriffe
- Service-Worker-Cache der vorherigen Workbench-Version

## [0.10.0] - 2026-07-15

### Erstellt

- Einblendbare Löschzone am unteren Rand für gezogene Knoten
- Direktes Löschmenü beim Anklicken einer Verbindung
- Gemeinsame obere Steuerinsel für Arbeitsflächen, Szenen und Synchronisierung
- Sichtbare Rand- und Eckgriffe zum freien Vergrößern aller Knoten
- Barrierefreier Verbindungsstatus für minimal dargestellte Terminals

### Verändert

- Terminal, Codex, OpenCode, T3 Code, Editor und Preview zeigen nur noch ihre eigentlichen Inhalte
- Projekt-Hubs erscheinen als ruhige rechteckige Karten ohne kreisförmigen Leuchteffekt
- Arbeitsflächen werden über eine kompakte Auswahl gewechselt und erst bei Aktivierung geladen
- Touchpad-Gesten verschieben den Canvas ohne blauen Auswahlrahmen
- Minimap, mobile Steuerung und gleichzeitige Werkzeugkapazität wurden verbessert

### Gelöscht

- Doppelte Werkzeugtitel und verschachtelte Navigationsleisten in Canvas-Fenstern
- Schließen-, Neuladen-, Zurücksetzen- und Vollbildknöpfe an einzelnen Werkzeugknoten
- Zahlenfelder für Position und Größe im Eigenschaftenbereich
- Separate untere Steuerinsel und freischwebende Synchronisierungspille
- Breadcrumb-Navigationsleiste oberhalb des Orbit Workspace

## [0.9.1] - 2026-07-15

### Erstellt

- Mobile Orbit-Palette als gut erreichbares Bottom Sheet ergänzt
- Sichtbare Ablageanzeige für Drag-and-drop auf dem Canvas ergänzt
- Intelligente freie Platzierung für neue Knoten ergänzt
- Automatischer Fokusbereich für neu geöffnete Werkzeuge ergänzt
- Reduzierte Bewegung für entsprechende Geräteeinstellungen ergänzt

### Verändert

- Neue Werkzeuge verteilen sich räumlich passend um ihren Projekt-Hub
- Mobile Canvas-Gesten priorisieren Verschieben und Zwei-Finger-Zoom
- Eingaben aktualisieren nur noch den betroffenen Orbit-Knoten
- Größenänderungen werden erst nach Abschluss der Geste gespeichert
- Geöffnete Projekt-Hubs setzen zuverlässig den aktiven Projektkontext

### Gelöscht

- Übereinanderliegende Standardpositionen neu erstellter Knoten
- Versteckter mobiler Einstieg zum Hinzufügen von Knoten
- Unnötige Neudarstellung aller Knoten bei jeder Texteingabe
- Dauernde Speicheraktualisierungen während einer Größenänderung
- Fremde Canvas-Kennzeichnung in der produktiven Arbeitsfläche

## [0.9.0] - 2026-07-15

### Erstellt

- Freier Orbit-Canvas mit Zoom, Verschieben, Mehrfachauswahl und adaptiv wachsendem Arbeitsgebiet
- Projekt-Hubs, Notizen, Code-Snippets, Dateien, Bereiche und Live-Nutzungsanzeigen als frei platzierbare Knoten
- Visuelle Projekt-, manuelle und Laufzeitverbindungen zwischen zusammengehörigen Werkzeugen
- Servergespeicherte SQLite-Arbeitsflächen mit Revisionen, Autosave und geräteübergreifender Synchronisierung
- Slash-Menü, Drag-and-drop-Palette, Szenen, mehrere Canvas-Tabs sowie Rückgängig- und Wiederholen-Verlauf

### Verändert

- Die bisherige Bento-Workbench wurde durch den vollständig räumlichen Orbit Workspace ersetzt
- T3 Code, Code-Server, Preview, Terminal, Codex und OpenCode laufen jetzt als skalierbare Canvas-Knoten
- Sidebar, Statusleiste und Inspector zeigen projektübergreifenden Orbit-Kontext und Synchronisierungsstatus
- Codex- und OpenCode-Limits lassen sich im Canvas platzieren und aktualisieren sich automatisch
- Bestehende lokale Arbeitsflächen werden beim ersten Start verlustfrei in Orbit-Boards migriert

### Gelöscht

- Starre Bindung der Workbench an maximal vier sichtbare Bento-Gruppen
- Gerätegebundene Speicherung des aktiven Workspace ausschließlich im Browser
- Erzwungene lineare Trennung zwischen Projektwahl und Werkzeugansichten
- Notwendigkeit, Verbindungen zwischen Projektkontexten nur gedanklich nachzuvollziehen
- Begrenzung kreativer Arbeitsbereiche auf vorgegebene Panel-Raster

## [0.8.0] - 2026-07-15

### Erstellt

- Dauerhafte lokale Historie für Tokens, Kosten, Limits und Reset-Guthaben
- Diagramme für Tagesverlauf sowie Auswertungen nach Projekt und Modell
- Verbrauchsprognosen für aktive Limitfenster und kommende 30 Tage
- Verwaltung vorhandener Codex- und OpenCode-Profile im Frontend
- Geführte Neuanmeldung in isolierten, sicheren CLI-Terminals

### Verändert

- Nutzung und Limits besitzt jetzt vier übersichtliche Analysebereiche
- CodexBar liefert zusätzlich Kosten-, Modell- und Projektstatistiken
- Doppelt erkannte Codex-Accounts werden anhand ihrer Identität zusammengeführt
- Globale Datenbank-, Collector- und Profilpfade werden zentral konfiguriert
- Service Worker verwendet unter dem Workbench-Pfad eine eindeutige Browser-Scope

### Gelöscht

- Beschränkung der Nutzungsseite auf aktuelle Prozentwerte
- Verlust historischer Messwerte nach einem Serverneustart
- Notwendigkeit, lokale Accounts ausschließlich in Konfigurationsdateien zu verwalten
- Ungekennzeichnete Vermischung exakter und abgeleiteter Projektwerte
- Löschen lokaler Profildaten beim Entfernen eines Workbench-Accounts

## [0.7.0] - 2026-07-15

### Erstellt

- Eigenständige Werkzeugseiten für Codex und OpenCode
- Bis zu vier dauerhaft geladene Instanzen je Agent-Werkzeug
- Automatische Bento-Anordnung für ein bis vier Desktop-Instanzen
- Mobile Einzelansicht mit schnellem Wechsel zwischen laufenden Instanzen
- Codex- und OpenCode-Werkzeugtypen für die bestehende Workbench

### Verändert

- Neue Agent-Sitzungen starten im aktuell ausgewählten Projekt
- Terminalverbindungen unterscheiden Shell, Codex und OpenCode eindeutig
- Gespeicherte Arbeitsflächen werden verlustfrei auf Version 3 migriert
- CLI-Pfade und getrennte Instanzlimits werden zentral konfiguriert
- Workbench, Weboberfläche und Server melden Version 0.7.0

### Gelöscht

- Notwendigkeit, Codex oder OpenCode zuerst manuell im Terminal zu starten
- Freie Befehlsauswahl für Agent-Prozesse aus dem Browser
- Gleichzeitige Mehrfachdarstellung von Agent-Instanzen auf Smartphones
- Gemeinsames Prozesslimit für Shell-, Codex- und OpenCode-Sitzungen
- Automatische Sicherheits- oder Freigabe-Bypässe beim CLI-Start

## [0.6.0] - 2026-07-15

### Erstellt

- Nummerierte Tabs für bis zu fünf unabhängige Terminalsitzungen
- Teilbare Desktop-Terminals mit Ziehen, langem Drücken und Größenanpassung
- Gestaltete Projektwahl mit Suche und Verfügbarkeitsanzeige
- Kompakte Werkzeug-Insel für die mobile Workbench
- Projektgebundene Terminals direkt im gewählten Arbeitsordner

### Verändert

- Projektwahl sitzt kontextabhängig in der oberen Navigationsleiste
- Mobile Workbench zeigt immer genau ein Werkzeug im Fokus
- Terminalaktionen erscheinen auf Mobilgeräten platzsparend als Icons
- Arbeitsflächen, Gruppen und seltene Aktionen verwenden kompakte Menüs
- Workbench, Weboberfläche und Server melden Version 0.6.0

### Gelöscht

- Doppelte Projektleiste oberhalb von Editor und Entwicklungswerkzeugen
- Irrelevanter Hinweis zu aktiven Sitzungen im Hintergrund
- Sichtbare Projektwahl innerhalb der eigenständigen T3-Code-Ansicht
- Platzraubende Terminalstatus- und Pfadzeile auf Mobilgeräten
- Gleichzeitige Mehrfachansicht von Werkzeugen auf kleinen Bildschirmen

## [0.5.1] - 2026-07-14

### Erstellt

- Verlässliche Rücktaste für Eingaben im integrierten Terminal
- Unterstützung der Entfernen-Taste an der aktuellen Cursorposition
- Automatische Fokusübergabe an den eingebetteten Code-Editor
- Browserprüfung für schreibbare Editor-Sitzungen
- Regressionstest für vollständig ausgeblendete Hintergrundansichten

### Verändert

- Inaktive Routen werden vollständig unsichtbar geparkt
- Verdeckte Arbeitsflächen nehmen nicht länger am Seitenaufbau teil
- Inaktive Werkzeug-Tabs bleiben erhalten, ohne Inhalte zu überlagern
- Editor-Klicks aktivieren zuverlässig die eingebettete Schreibfläche
- Workbench, Weboberfläche und Server melden Version 0.5.1

### Gelöscht

- Durchscheinende Workbench-Inhalte auf Dashboard und Projektseiten
- Tastaturverlust bei Rücktaste und Entfernen im Terminal
- Unsichere Sichtbarkeit hardwarebeschleunigter Hintergrund-Iframes
- Unsichtbare Eingabeflächen über der jeweils aktiven Ansicht
- Abhängigkeit von browserabhängigem Fokusverhalten eingebetteter Editoren

## [0.5.0] - 2026-07-14

### Erstellt

- Persistenter Routen-Host für besuchte Ansichten und laufende Werkzeuge
- Benannte Arbeitsflächen mit bis zu vier flexiblen Bento-Gruppen
- Persistente Tabs für bis zu acht Iframe- oder Terminal-Instanzen
- Eigenständiger Code-Server-Eintrag im Werkzeugbereich der Sidebar
- Browsernachweis für zustandserhaltende Tab-, Fullscreen- und Routenwechsel

### Verändert

- Workbench-Zustand wird automatisch von Schema-Version 1 auf 2 migriert
- Routen werden aufgeteilt und während Browser-Leerlauf vorab geladen
- Browserdateien erhalten Brotli/Gzip und langfristige immutable Cache-Header
- Fullscreen und mobile Gruppen nutzen den gesamten verfügbaren Viewport
- Abhängigkeiten wurden kompatibel aktualisiert und Version 0.5.0 gesetzt

### Gelöscht

- Starre Beschränkung auf zwei gleichzeitig verwaltete Panels
- Unmount und Reload von Werkzeugen bei Sidebar-Navigation
- Reload von Iframes beim Wechsel zwischen Workbench-Tabs
- Neuaufbau eingebetteter Werkzeuge bei Fullscreen-Wechseln
- Gemeinsame Terminal-Sitzungskennung für mehrere Terminal-Instanzen

## [0.4.0] - 2026-07-13

### Erstellt

- Wiederverbindbares natives PTY-Terminal nach dem T3-Code-Lifecycle
- Automatische Erkennung aller lokalen Projektordner
- HTTPS- und WebSocket-Proxy für Editor und Entwicklungs-Previews
- Geräteauswahl für iPhone- und Galaxy-Ansichten mit Rotation
- Dauerhafte systemd-Benutzerdienste für code-server und Vite

### Verändert

- Vorschau, Vollbild und externe Ansicht teilen einen stabilen Origin
- Editor und Preview nutzen auf Mobilgeräten deutlich mehr Bildschirmfläche
- Breadcrumbs, Sidebar-Gruppen und Statuszeile wurden neu strukturiert
- Terminal-Sitzungen bleiben bei kurzzeitigen Verbindungsabbrüchen erhalten
- Server und Benutzeroberfläche melden die Version 0.4.0

### Gelöscht

- Statisches Projekt-Dropdown aus der oberen Navigationsleiste
- Fehleranfälliger HTML-Fetch-Proxy für eingebettete Previews
- Unsichere HTTP-Editor-URL und Mixed-Content-Abhängigkeit
- Warnende iframe-Sandbox-Kombination aus Scripts und Same-Origin
- Schreibschutz, der Terminalbefehle an Projektdateien verhindert hat

## [0.3.3] - 2026-07-13

### Erstellt

- CSP-kompatible Zod-Konfiguration im Browser
- Validierung ohne dynamische JavaScript-Ausführung
- Stille Prüfung der Datenformate unter strengen Sicherheitsregeln
- Version 0.3.3 der Workbench
- Klarere Trennung zwischen T3-Code- und Workbench-Meldungen

### Verändert

- Zod verzichtet auf seine optionale JIT-Optimierung
- Die strenge Skript-Sicherheitsrichtlinie bleibt unverändert
- API-Antworten werden weiterhin vollständig geprüft
- Die Workbench vermeidet die irreführende CSP-Konsoleintragung
- Server meldet die Versionsnummer 0.3.3

### Gelöscht

- Probeaufruf über dynamisches JavaScript in der Workbench
- CSP-Warnung durch die optionale Zod-Optimierung
- Bedarf an der unsicheren Richtlinie `unsafe-eval`
- Unnötige Browser-Konsoleinträge bei der Datenschema-Prüfung
- Missverständnis, dass T3 Code die eval-Anfrage auslöst

## [0.3.2] - 2026-07-13

### Erstellt

- Bereitschaftsprüfung für den CodexBar-Dienst
- Bis zu zwanzig Sekunden Startzeit für die lokale Schnittstelle
- Klare Meldung bei einem tatsächlich fehlgeschlagenen Dienststart
- Verlässliche Installation von CodexBar als Systemdienst
- Version 0.3.2 der Workbench

### Verändert

- CodexBar wird erst nach erfolgreicher Gesundheitsprüfung bestätigt
- Die Installation wartet auf die lokale Schnittstelle
- Kurzzeitige Startverzögerungen lösen keinen Rollback mehr aus
- Die Workbench kann CodexBar nach dem Start zuverlässig erreichen
- Server meldet die Versionsnummer 0.3.2

### Gelöscht

- Zu frühe Sofortprüfung nach dem Start von CodexBar
- Falscher Rollback bei einem korrekt startenden Dienst
- Nicht vorhandene CodexBar-Schnittstelle nach der Installation
- Unnötige erneute manuelle Dienstinstallation
- Race Condition zwischen Dienststart und Gesundheitsprüfung

## [0.3.1] - 2026-07-13

### Erstellt

- Vollbildfreigabe für eingebettete Werkzeuge
- Erlaubnis für die Vollbild-Anfrage von T3 Code
- Passende Sandbox-Freigabe für Präsentationsansichten
- Verbesserte Nutzung von T3 Code innerhalb der Workbench
- Version 0.3.1 der Workbench

### Verändert

- T3 Code kann sein eigenes Vollbild direkt im iframe anfordern
- Die Workbench delegiert ausschließlich die nötige Browser-Berechtigung
- Die Einbettung bleibt weiterhin auf ihre bisherigen Sicherheitsgrenzen beschränkt
- Der Vollbildmodus funktioniert ohne externen Tab
- Server meldet die Versionsnummer 0.3.1

### Gelöscht

- Blockade der Vollbild-Anfrage im T3-Code-iframe
- Notwendigkeit, für Vollbild in einen externen Tab zu wechseln
- Fehlende Delegierung der Browser-Vollbildberechtigung
- Unvollständige Sandbox-Regel für Präsentationsansichten
- Unterschiedliches Vollbildverhalten zwischen eingebetteter und externer Ansicht

## [0.3.0] - 2026-07-13

### Erstellt

- Eindeutige Hauptaktion „T3 öffnen“ für jedes Projekt
- Klar benannte Verfügbarkeitsanzeigen für T3 und Editor
- Einheitlicher Einstieg auf Karte und Projektseite
- Übersichtlichere Werkzeugauswahl pro Projekt
- Version 0.3.0 der Workbench

### Verändert

- Die Hauptaktion öffnet T3 direkt im Arbeitsbereich
- Editor und Vorschauen bleiben als getrennte Aktionen erkennbar
- Projektkarten enthalten keine doppelte T3-Bedienung mehr
- Die Projektseite folgt derselben Öffnungslogik
- Bezeichnungen sind auf mobilen Geräten schneller erfassbar

### Gelöscht

- Zweiter T3-Button neben der Hauptaktion
- Externer T3-Link in den Projektkarten
- Uneinheitliche T3-Bezeichnungen in der Projektübersicht
- Mehrdeutige Hauptaktion „Öffnen“ für T3-Projekte
- Redundante Wahlwege zum selben T3-Arbeitsbereich

## [0.2.3] - 2026-07-13

### Erstellt

- Verlässlicher pnpm-Pfad für alle Build-Schritte
- Freigabe für den benötigten Build-Helfer esbuild
- Einheitliche Build-Umgebung für die Dienstinstallation
- Bessere Wiederholbarkeit nach einer frischen Installation
- Aktualisierte Installationsversion 0.2.3

### Verändert

- Build-Skripte finden pnpm auch nach einem sudo-Aufruf
- Installation vererbt die benötigte Werkzeugumgebung an den Dienstbenutzer
- Abhängigkeiten dürfen den erforderlichen esbuild-Schritt ausführen
- Server meldet die Versionsnummer 0.2.3
- Der Produktionsbuild bleibt dem Dienstbenutzer zugeordnet

### Gelöscht

- Fehlermeldung über ein nicht gefundenes pnpm beim Produktionsbuild
- Abhängigkeit vom zufälligen Root-PATH während der Installation
- Warnung über den blockierten benötigten esbuild-Build-Schritt
- Unterschiedliche Werkzeugumgebungen für Installation und Build
- Nicht funktionierende Wiederholungen der Dienstinstallation

## [0.2.2] - 2026-07-13

### Erstellt

- Zuverlässige Nutzung von pnpm bei der Systeminstallation
- Schutz vor Build-Dateien mit falschem Besitzer
- Statussicherung der vorhandenen Tailscale-Routen
- Zielgerichteter Rückbau nur des neuen Workbench-Endpunkts
- Verständliche Fehlermeldung bei fehlendem pnpm

### Verändert

- Installation baut die Anwendung als Dienstbenutzer
- Tailscale-Route wird mit der aktuellen Befehlszeile eingerichtet
- Fehlerbehandlung der Tailscale-Route schützt T3 Code auf Port 443
- Versionsnummer auf 0.2.2 angehoben
- Vorbereitete Installation funktioniert ohne Root-PATH für pnpm

### Gelöscht

- Abhängigkeit von einem im Root-PATH verfügbaren pnpm
- Fehlerhaftes Wiederherstellen über Service-Konfigurationsdateien
- Unklare Tailscale-Meldung beim fehlgeschlagenen Rollback
- Risiko einer Änderung an bestehenden Tailscale-Endpunkten beim Rollback
- Nicht reproduzierbare Installation über unterschiedliche Shell-Pfade

## [0.2.1] - 2026-07-13

### Erstellt

- Verlässliche Auslieferung aller App-Dateien unter der Workbench-Adresse
- Eindeutiger Installationsbereich für die Android-App
- Aktualisierte Installationsprüfung für Android-Browser
- Neue Cache-Version für die aktualisierte App-Hülle
- Dokumentierte Erklärung zur HTTPS-Port-Kompatibilität

### Verändert

- Manifest startet die App jetzt im vollständigen Workbench-Pfad
- Service Worker kontrolliert den vollständigen Workbench-Bereich
- App lädt Serverdaten über den stabilen lokalen API-Pfad
- Produktionsserver stellt Dateien passend zum App-Pfad bereit
- Versionsnummer auf 0.2.1 angehoben

### Gelöscht

- Unvollständiger Installationsbereich ohne abschließenden Pfadtrenner
- Veraltete App-Hülle im bisherigen Service-Worker-Cache
- Produktionspfade, die statische App-Dateien nicht erreichten
- Abhängigkeit der Datenabfragen vom Frontend-Unterpfad
- Unklare Annahme, dass ein HTTPS-Port ungleich 443 PWAs verhindert

## [0.2.0] - 2026-07-12

### Erstellt

- Installierbare Online-Only-PWA für Remote Workplace ergänzt
- Eigenes Workbench-Favicon als SVG und PNG in mehreren Größen erstellt
- Einklappbare Desktop-Sidebar mit gespeicherter Layout-Präferenz ergänzt
- Anpassbare Sidebar-Breite für größere Monitore und konzentriertes Arbeiten ergänzt
- Schnellzugriffe für Workbench und Projekte im App-Menü ergänzt

### Verändert

- Mobile Startansicht für die Nutzung als installierte App vorbereitet
- Browser- und iOS-Metadaten für Standalone-Darstellung ergänzt
- Arbeitsbereich bleibt ohne Internetverbindung bewusst nicht nutzbar
- Sidebar-Navigation auf kompakte Icon-Ansicht bei eingeklapptem Zustand angepasst
- Versionsanzeige der Workbench auf 0.2.0 angehoben

### Gelöscht

- Keine lokalen Daten oder Projektinhalte für den Offline-Betrieb vorgehalten
- Keine API-Antworten im Service Worker zwischengespeichert
- Keine freie, persistente Offline-Kopie der Workbench erzeugt
- Keine zusätzlichen Anmelde- oder Berechtigungsdaten für die PWA gespeichert
- Keine bestehende Desktop- oder Mobile-Navigation entfernt

## [0.1.0] - 2026-07-12

### Erstellt

- Read-only Serverdashboard-Daten und Dienststatus bereitgestellt
- Sichere Projektliste mit echten Serverpfaden eingerichtet
- Persistente Workspace-Logik für bis zu zwei Panels erstellt
- Mobile Einzelwerkzeug-Logik und Fehlerfallbacks vorbereitet
- Installations-, Audit- und Frontend-Handoff-Dokumentation ergänzt

### Verändert

- T3 Code als unabhängigen Hybrid-Dienst eingeordnet
- Aktive HTTP-Preview bis zur HTTPS-Absicherung auf extern gestellt
- Globale Serverwerte in einer zentralen Konfiguration gebündelt
- Produktionsbetrieb auf localhost und Tailscale ausgerichtet
- Sicherheitsheader, Anfragegrenzen und Rollback-Abläufe gehärtet

### Gelöscht

- Produktions-Sourcemaps aus dem Web-Build entfernt
- Ungültige gespeicherte Workspaces aus der Wiederherstellung entfernt
- Freie Browserpfade aus der Projektöffnung ausgeschlossen
- Beliebige URL-Eingaben aus dem Preview-Ablauf ausgeschlossen
- Ausführbare Serveraktionen aus dem MVP-Umfang ausgeschlossen
