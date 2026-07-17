# Changelog

Alle Änderungen werden in fünf kurzen Stichpunkten pro Kategorie dokumentiert.

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
- Der Produktionsbuild bleibt dem Benutzer bbecker zugeordnet

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

- Installierbare Online-Only-PWA für die Dev Workbench ergänzt
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
