# Browser-Terminal

Das Terminal verwendet eine echte `node-pty`-Sitzung mit `/bin/bash --login`; es ist kein Command-Runner. Es ist nur über den privaten Tailscale-HTTPS-Endpunkt der Wrapt erreichbar und akzeptiert WebSockets ausschließlich, wenn Tailscale eine Benutzeridentität übermittelt und diese explizit erlaubt ist.

Codex und Claude Code verwenden denselben abgesicherten PTY-Transport. Der Browser übermittelt dabei nur den typisierten Werkzeugnamen. Das Backend ordnet diese Auswahl festen ausführbaren Dateien zu und akzeptiert weder freie Befehle noch Argumente. Die CLIs starten normal im gewählten Projektordner und behalten ihre eigenen Freigabe- und Sicherheitsdialoge. OpenCode wird in der Wrapt als offizielle Web-UI unter `/opencode` betrieben; vorhandene OpenCode-PTY-Sessions bleiben für Kompatibilität im Backend erhalten.

Jeder Terminal-Bereich verwaltet bis zu fünf nummerierte Tabs. Jeder Tab besitzt eine stabile `runtimeId`, eine eigene beaufsichtigte tmux-Sitzung und bleibt beim Wechsel zu anderen Werkzeugen aktiv. `node-pty` dient als Ein-/Ausgabe-Gateway zum Supervisor; der eigentliche Shell-, Codex- oder OpenCode-Prozess hängt nicht an der Lebenszeit des Backendprozesses. Auch der WebSocket bleibt im Hintergrund offen: Geparkte Tabs puffern ihre Ausgabe statt neu zu verbinden, sodass der Inhalt beim Zurückwechseln sofort da ist und die Statuskugel grün bleibt. Die Tab- und Area-Struktur wird serverseitig pro Tailscale-Benutzer synchronisiert. **Split** erzeugt auf Desktop eine neue unabhängige Sitzung rechts neben dem aktiven Terminal und übernimmt dessen aktuelles Arbeitsverzeichnis. Die beiden Pane-Positionen bleiben stabil; ein Tabwechsel ersetzt nur das gerade fokussierte Pane. Mobile zeigt bewusst nur ein Pane, bewahrt den Split aber für die Rückkehr zur breiten Ansicht. Das Schließen eines Browserfensters oder ein Backend-Neustart trennt nur das Gateway: Die Session läuft weiter und kann auf einem anderen Gerät wieder geöffnet werden. Erst ein explizit geschlossener Tab beendet die tmux-Sitzung und entfernt die Registry-Zeile.

Die Werkzeugaktion **In neuem Tab öffnen** verbindet ausschließlich die aktive laufende Sitzung in einer reduzierten Terminalseite ohne Wrapt-Navigation. Mehrere Browser-Tabs dürfen dieselbe Sitzung gleichzeitig bedienen. **Vollbild** ist ein interner Fokusmodus: Sidebar, Topbar, Statusleiste und mobile Navigation verschwinden, während der Browser selbst im normalen Fenstermodus bleibt. `Escape` oder die Schaltfläche oben rechts beendet den Fokusmodus.

Die Wrapt führt eine laufende Session-Liste. Dort können Sessions auf einem anderen Gerät geöffnet, beendet oder bewusst neu gestartet werden. Mehrere Geräte dürfen dieselbe Session gleichzeitig verbinden; Output wird an alle Geräte verteilt und Eingaben werden gemeinsam an tmux weitergeleitet. Beim Backendstart gleicht die Registry ihre Einträge mit den real laufenden tmux-Sitzungen ab. Bei exakt einem erlaubten Tailscale-Benutzer werden auch bereits vorhandene tmux-Sitzungen erkannt und als Shell oder Codex angeboten; ältere OpenCode-PTY-Sessions bleiben serverseitig erhalten. Unbeaufsichtigte Rohprozesse ohne PTY-Supervisor können technisch nicht nachträglich an ein neues interaktives Terminal gebunden werden; neue Wrapt-Läufe sind deshalb standardmäßig immer beaufsichtigt.

Eine PTY besitzt immer genau eine gemeinsame Spalten-/Zeilen-Geometrie. Das zuerst
verbundene Gerät ist deshalb der Primary für Größenänderungen. Weitere Geräte sehen und
bedienen dieselbe Ausgabe, ihre lokalen Größen werden nur vorgemerkt. Erst wenn der Primary
trennt, übernimmt ein verbleibendes Gerät seine zuletzt gemeldete Größe. So bleibt eine
TUI-Sitzung bei paralleler Nutzung stabil, statt bei jedem Resize zwischen zwei Viewports
umzubrechen.

`terminal.resize` meldet ausschließlich den lokalen Wunsch-Viewport und übernimmt den
Primary-Status nicht: Ein ResizeObserver allein ist keine Benutzeraktivität. Der Primary
wechselt nur über echte Eingabe (`terminal.input`) oder beim Trennen. Beim Verbinden trägt
`terminal.attach` die gemessene Wunschgröße mit, damit der Server die PTY **vor** dem
Snapshot auf dieses Raster setzt. Der Snapshot liefert die gemeinsame Geometrie
(`cols`/`rows`) und `ownsGeometry` zurück; der Client spielt ihn exakt in dieses Raster ein,
statt ihn in ein anders großes xterm umbrechen zu lassen. Fullscreen-TUIs werden im
Alternate Screen erfasst (ohne `-J`, das umgebrochene Pane-Zeilen zusammenfügen würde) und
beim Wiedergeben wieder in den Alternate Screen geschaltet. Secondaries rendern im
gemeinsamen Raster und merken ihre Wunschgröße nur vor; sie passen ihr xterm-Grid nicht an
das eigene Fenster an.

Die Projektwahl sendet ausschließlich eine Projekt-ID. Der Server löst daraus den konfigurierten, verfügbaren Projektpfad auf und prüft ihn zusätzlich gegen `TERMINAL_ALLOWED_ROOTS`, bevor die neue Shell direkt im Projektordner startet. Laufende Sitzungen wechseln ihr Arbeitsverzeichnis nie ungefragt.

Der Projekt-Picker im Terminal zeigt immer das Projekt des aktiven Terminal-Tabs. Beim
Wechsel wird ein vorhandener Tab dieses Projekts wieder aktiviert; nur bei einem bislang
nicht geöffneten Projekt entsteht ein neuer Tab. Dadurch können mehrere Projektordner
parallel laufen, ohne dass eine bestehende Session stillschweigend ihr Arbeitsverzeichnis
ändert.Der Terminalverlauf hält bis zu 10.000 Zeilen. Mausrad und Trackpad verwenden das native xterm-Scrolling mit einer linearen Empfindlichkeit; Touch-Gesten werden anhand der echten Zeilenhöhe in ganze Terminalzeilen umgesetzt. Programme im Alternate Screen erhalten ihre eigenen Mausereignisse weiterhin unverändert. Auf Touch-Shells (Mobile und iPad) rendert das Terminal mit 8-Pixel-Schrift, damit Fullscreen-TUIs im schmalen Viewport vollständig sichtbar bleiben.

## Aktivierung

In der privaten `.env` müssen die Tailscale-Loginnamen berechtigt werden, etwa:

```dotenv
TERMINAL_ALLOWED_USERS=benjamin@example.com
TERMINAL_ALLOWED_ROOTS=/home/your-user,/home/your-user/projects
TERMINAL_DEFAULT_CWD=/home/your-user
TERMINAL_MAX_SESSIONS=5
TERMINAL_SUPERVISOR=tmux
TMUX_PATH=/usr/bin/tmux
CODEX_CLI_PATH=/home/your-user/.local/bin/codex
OPENCODE_CLI_PATH=/home/your-user/.npm-global/bin/opencode
CODEX_MAX_SESSIONS=4
OPENCODE_MAX_SESSIONS=4
```

Danach Backend neu starten. Ohne `TERMINAL_ALLOWED_USERS` bleibt der Endpunkt absichtlich gesperrt. Das schützt vor einer versehentlichen Terminalfreigabe, solange die bestehende Wrapt keine eigene Login-Schicht besitzt.

Die eigenständigen Codex- und Claude-Code-Seiten halten jeweils bis zu vier Instanzen geladen. Desktop ordnet sie automatisch als Einzelansicht, zwei Spalten, Fokuslayout oder 2×2-Bento an. Mobile zeigt jeweils nur die aktive Instanz; die übrigen Prozesse und Verbindungen bleiben geparkt. OpenCode verwendet stattdessen die separate Web-UI-Fläche.

## Zwischenablage

Auf Windows und Linux kopiert `Ctrl+Shift+C` die aktuelle Terminalauswahl; `Ctrl+Shift+V` fügt Text ein. Auf macOS gelten `Cmd+C` und `Cmd+V`. `Ctrl+C` bleibt auf allen Systemen das Terminalsignal zum Unterbrechen eines Prozesses. Shell, Codex, OpenCode und Claude Code verwenden dieselbe Tastaturbehandlung.

Tastatur-Paste läuft über das native `paste`-Ereignis und benötigt keine dauerhafte Leseberechtigung für die Zwischenablage. Der mobile Einfügen-Button verwendet die Clipboard API und zeigt einen Fehler, wenn der Browser den Zugriff ablehnt. xterm normalisiert Zeilenenden und respektiert Bracketed Paste. Ab 10.000 Zeichen verlangt die Wrapt eine Bestätigung; anschließend werden große Inhalte verlustfrei in protokollkonforme Blöcke geteilt.

## Manueller Abnahmetest

1. Wrapt über `https://…:8443/wrapt/` öffnen und **Terminal** wählen.
2. Prüfen: `echo hello`, `pwd`, `ls --color=auto`, `git status`, `node`, `python3`.
3. Interaktive Programme prüfen: `htop`, `nano test.txt`, `vim test.txt`, `tmux new -s browser-test`.
4. Mit dem Mausrad und einem Trackpad durch eine lange Ausgabe scrollen; es dürfen keine Zeilenblöcke übersprungen werden.
5. **Aktionen → Split** wählen: Rechts muss eine neue Sitzung im aktuellen `pwd` starten; beide Seiten müssen unabhängig bedienbar sein.
6. Tabs in beiden Panes wechseln, den Trenner mit Maus und Tastatur verschieben und ein Pane schließen; Seiten und Fokus müssen stabil bleiben.
7. **Werkzeugaktionen → In neuem Tab öffnen** wählen und prüfen, dass nur die aktive Sitzung ohne Wrapt-Navigation erscheint.
8. **Werkzeugaktionen → Vollbild** wählen: Sidebar, Topbar und Statusleiste müssen verschwinden; `Escape` stellt sie wieder her.
9. `Ctrl+C`, die plattformüblichen Copy/Paste-Kürzel, `Ctrl+D`, `Ctrl+L`, Pfeiltasten und Tab-Completion testen; Fenstergröße und Smartphone-Ausrichtung ändern.
10. Seite neu laden bzw. Netzwerk kurz trennen: die laufende Sitzung muss mit Snapshot wieder erscheinen.
11. Backend neu starten und auf einem zweiten Gerät dieselbe Session aus **Sessions** öffnen; Prozess und Verlauf müssen weiter vorhanden sein.
12. Eine externe tmux-Sitzung starten und kontrollieren, dass sie bei Einzelbenutzerkonfiguration in der Session-Liste erscheint.
13. **Schließen** klicken und kontrollieren, dass die tmux-Sitzung beendet ist.
