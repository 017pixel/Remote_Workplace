# Installation

## Voraussetzungen

- Ubuntu Server, Node.js 22+, pnpm 10+, Tailscale, code-server sowie installierte `codex`- und `opencode`-CLIs.
- T3 Code bleibt als unabhängiger Dienst aktiv.
- `loginctl enable-linger bbecker`, damit die User-Dienste ohne offene SSH-Sitzung laufen.

## Anwendung vorbereiten

1. `pnpm install --frozen-lockfile` ausführen.
2. `.env.example` nach `.env` kopieren, Benutzer, erlaubte Terminal-Wurzeln, CLI-Pfade und Instanzlimits setzen und `HOST=127.0.0.1` beibehalten.
3. Die Beispielkonfigurationen nach `*.local.json` kopieren und die privaten URLs anpassen.
4. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` ausführen.

## Dienste

`bash deploy/systemd/install.sh` installiert mit Root-Rechten Workbench, code-server und die konfigurierte Vite-Preview. Das Skript baut als Benutzer, prüft alle Units, sichert vorhandene System-Units und führt lokale Healthchecks aus.

Wenn Root-Rechte in einer Ausführungsumgebung nicht verfügbar sind, startet `bash deploy/systemd/install-user-tools.sh` Workbench, code-server und Preview als dauerhafte User-Dienste. Dafür werden `XDG_RUNTIME_DIR` und der User-DBus automatisch gesetzt. Ein noch laufender, veralteter Workbench-Systemprozess wird nur dann beendet, wenn Besitzer und Arbeitsverzeichnis eindeutig zum Projekt passen.

code-server verwendet `config/code-server.yaml`, bindet an `127.0.0.1:8080`, deaktiviert eigene TLS-Terminierung und wird ausschließlich durch die private Workbench unter `/editor/` erreicht. Die Preview bindet an `127.0.0.1:1234`.

## Tailscale Serve

`bash deploy/proxy/configure-tailscale-serve.sh` erhält T3 Code auf Port 443 und veröffentlicht die Workbench auf HTTPS 8443. Editor und Previews benötigen keinen weiteren Tailscale-Port, weil Fastify `/editor/` und code-server `/absproxy/<port>/` am selben Origin bereitstellen. Funnel und öffentliche Portweiterleitungen bleiben deaktiviert.

## Abschlussprüfung

- `systemctl --user status benjamin-dev-workbench.service`
- `systemctl --user status code-server.service tg-vereinsapp-preview.service`
- `curl -f http://127.0.0.1:3010/api/v1/health`
- `curl -f http://127.0.0.1:8080/healthz`
- `curl -f http://127.0.0.1:1234/`
- `tailscale serve status`
- Private Workbench, Terminal, Codex, OpenCode, Editor und Preview im Browser testen.
