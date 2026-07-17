# Browser-Terminal

Das Terminal verwendet eine echte `node-pty`-Sitzung mit `/bin/bash --login`; es ist kein Command-Runner. Es ist nur über den privaten Tailscale-HTTPS-Endpunkt der Workbench erreichbar und akzeptiert WebSockets ausschließlich, wenn Tailscale eine Benutzeridentität übermittelt und diese explizit erlaubt ist.

Codex und OpenCode verwenden denselben abgesicherten PTY-Transport. Der Browser übermittelt dabei nur `codex` oder `opencode` als typisierte Auswahl. Das Backend ordnet diese Auswahl festen ausführbaren Dateien zu und akzeptiert weder freie Befehle noch Argumente. Beide CLIs starten normal im gewählten Projektordner und behalten ihre eigenen Freigabe- und Sicherheitsdialoge.

Jeder Terminal-Bereich verwaltet bis zu fünf nummerierte Tabs. Jeder Tab besitzt eine eigene PTY-Sitzung und bleibt beim Wechsel zu anderen Werkzeugen aktiv. Auf Desktop können zwei Tabs per Drag-and-drop oder langem Drücken nebeneinander geöffnet werden; Mobile zeigt bewusst nur einen Tab im Fokus. Ein explizit geschlossener Tab beendet die Prozessgruppe, löscht die Sitzung serverseitig und entfernt die lokale Sitzungskennung.

Die Projektwahl sendet ausschließlich eine Projekt-ID. Der Server löst daraus den konfigurierten, verfügbaren Projektpfad auf und prüft ihn zusätzlich gegen `TERMINAL_ALLOWED_ROOTS`, bevor die neue Shell direkt im Projektordner startet. Laufende Sitzungen wechseln ihr Arbeitsverzeichnis nie ungefragt.

## Aktivierung

In der privaten `.env` müssen die Tailscale-Loginnamen berechtigt werden, etwa:

```dotenv
TERMINAL_ALLOWED_USERS=benjamin@example.com
TERMINAL_ALLOWED_ROOTS=/home/bbecker,/home/bbecker/projects
TERMINAL_DEFAULT_CWD=/home/bbecker
TERMINAL_MAX_SESSIONS=5
CODEX_CLI_PATH=/home/bbecker/.local/bin/codex
OPENCODE_CLI_PATH=/home/bbecker/.npm-global/bin/opencode
CODEX_MAX_SESSIONS=4
OPENCODE_MAX_SESSIONS=4
```

Danach Backend neu starten. Ohne `TERMINAL_ALLOWED_USERS` bleibt der Endpunkt absichtlich gesperrt. Das schützt vor einer versehentlichen Terminalfreigabe, solange die bestehende Workbench keine eigene Login-Schicht besitzt.

Die eigenständigen Codex- und OpenCode-Seiten halten jeweils bis zu vier Instanzen geladen. Desktop ordnet sie automatisch als Einzelansicht, zwei Spalten, Fokuslayout oder 2×2-Bento an. Mobile zeigt jeweils nur die aktive Instanz; die übrigen Prozesse und Verbindungen bleiben geparkt.

## Manueller Abnahmetest

1. Workbench über `https://…:8443/workbench/` öffnen und **Terminal** wählen.
2. Prüfen: `echo hello`, `pwd`, `ls --color=auto`, `git status`, `node`, `python3`.
3. Interaktive Programme prüfen: `htop`, `nano test.txt`, `vim test.txt`, `tmux new -s browser-test`.
4. `Ctrl+C`, `Ctrl+D`, `Ctrl+L`, Pfeiltasten und Tab-Completion testen; Fenstergröße und Smartphone-Ausrichtung ändern.
5. Seite neu laden bzw. Netzwerk kurz trennen: die laufende Sitzung muss mit Snapshot wieder erscheinen.
6. **Schließen** klicken und kontrollieren, dass die Shell beendet ist.
