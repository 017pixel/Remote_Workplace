# Browser-Terminal

Das Terminal verwendet eine echte `node-pty`-Sitzung mit `/bin/bash --login`; es ist kein Command-Runner. Es ist nur über den privaten Tailscale-HTTPS-Endpunkt der Workbench erreichbar und akzeptiert WebSockets ausschließlich, wenn Tailscale eine Benutzeridentität übermittelt und diese explizit erlaubt ist.

Codex, OpenCode und Claude Code verwenden denselben abgesicherten PTY-Transport. Der Browser übermittelt dabei nur den typisierten Werkzeugnamen. Das Backend ordnet diese Auswahl festen ausführbaren Dateien zu und akzeptiert weder freie Befehle noch Argumente. Die CLIs starten normal im gewählten Projektordner und behalten ihre eigenen Freigabe- und Sicherheitsdialoge.

Jeder Terminal-Bereich verwaltet bis zu fünf nummerierte Tabs. Jeder Tab besitzt eine stabile `runtimeId`, eine eigene beaufsichtigte tmux-Sitzung und bleibt beim Wechsel zu anderen Werkzeugen aktiv. `node-pty` dient als Ein-/Ausgabe-Gateway zum Supervisor; der eigentliche Shell-, Codex- oder OpenCode-Prozess hängt nicht an der Lebenszeit des Backendprozesses. Die Tab- und Area-Struktur wird serverseitig pro Tailscale-Benutzer synchronisiert. Auf Desktop können zwei Tabs per Drag-and-drop oder langem Drücken nebeneinander geöffnet werden; Mobile zeigt bewusst nur einen Tab im Fokus. Das Schließen eines Browserfensters oder ein Backend-Neustart trennt nur das Gateway: Die Session läuft weiter und kann auf einem anderen Gerät wieder geöffnet werden. Erst ein explizit geschlossener Tab beendet die tmux-Sitzung und entfernt die Registry-Zeile.

Die Workbench führt eine laufende Session-Liste. Dort können Sessions auf einem anderen Gerät geöffnet, beendet oder bewusst neu gestartet werden. Mehrere Geräte dürfen dieselbe Session gleichzeitig verbinden; Output wird an alle Geräte verteilt und Eingaben werden gemeinsam an tmux weitergeleitet. Beim Backendstart gleicht die Registry ihre Einträge mit den real laufenden tmux-Sitzungen ab. Bei exakt einem erlaubten Tailscale-Benutzer werden auch bereits vorhandene tmux-Sitzungen erkannt und als Shell, Codex oder OpenCode angeboten. Unbeaufsichtigte Rohprozesse ohne PTY-Supervisor können technisch nicht nachträglich an ein neues interaktives Terminal gebunden werden; neue Workbench-Läufe sind deshalb standardmäßig immer beaufsichtigt.

Die Projektwahl sendet ausschließlich eine Projekt-ID. Der Server löst daraus den konfigurierten, verfügbaren Projektpfad auf und prüft ihn zusätzlich gegen `TERMINAL_ALLOWED_ROOTS`, bevor die neue Shell direkt im Projektordner startet. Laufende Sitzungen wechseln ihr Arbeitsverzeichnis nie ungefragt.

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

Danach Backend neu starten. Ohne `TERMINAL_ALLOWED_USERS` bleibt der Endpunkt absichtlich gesperrt. Das schützt vor einer versehentlichen Terminalfreigabe, solange die bestehende Workbench keine eigene Login-Schicht besitzt.

Die eigenständigen Codex- und OpenCode-Seiten halten jeweils bis zu vier Instanzen geladen. Desktop ordnet sie automatisch als Einzelansicht, zwei Spalten, Fokuslayout oder 2×2-Bento an. Mobile zeigt jeweils nur die aktive Instanz; die übrigen Prozesse und Verbindungen bleiben geparkt.

## Zwischenablage

Auf Windows und Linux kopiert `Ctrl+Shift+C` die aktuelle Terminalauswahl; `Ctrl+Shift+V` fügt Text ein. Auf macOS gelten `Cmd+C` und `Cmd+V`. `Ctrl+C` bleibt auf allen Systemen das Terminalsignal zum Unterbrechen eines Prozesses. Shell, Codex, OpenCode und Claude Code verwenden dieselbe Tastaturbehandlung.

Tastatur-Paste läuft über das native `paste`-Ereignis und benötigt keine dauerhafte Leseberechtigung für die Zwischenablage. Der mobile Einfügen-Button verwendet die Clipboard API und zeigt einen Fehler, wenn der Browser den Zugriff ablehnt. xterm normalisiert Zeilenenden und respektiert Bracketed Paste. Ab 10.000 Zeichen verlangt die Workbench eine Bestätigung; anschließend werden große Inhalte verlustfrei in protokollkonforme Blöcke geteilt.

## Manueller Abnahmetest

1. Workbench über `https://…:8443/workbench/` öffnen und **Terminal** wählen.
2. Prüfen: `echo hello`, `pwd`, `ls --color=auto`, `git status`, `node`, `python3`.
3. Interaktive Programme prüfen: `htop`, `nano test.txt`, `vim test.txt`, `tmux new -s browser-test`.
4. `Ctrl+C`, die plattformüblichen Copy/Paste-Kürzel, `Ctrl+D`, `Ctrl+L`, Pfeiltasten und Tab-Completion testen; Fenstergröße und Smartphone-Ausrichtung ändern.
5. Seite neu laden bzw. Netzwerk kurz trennen: die laufende Sitzung muss mit Snapshot wieder erscheinen.
6. Backend neu starten und auf einem zweiten Gerät dieselbe Session aus **Sessions** öffnen; Prozess und Verlauf müssen weiter vorhanden sein.
7. Eine externe tmux-Sitzung starten und kontrollieren, dass sie bei Einzelbenutzerkonfiguration in der Session-Liste erscheint.
8. **Schließen** klicken und kontrollieren, dass die tmux-Sitzung beendet ist.
