# Installation

Der empfohlene Weg ist die Einrichtung durch einen Coding-Agent
([docs/agent-setup.md](agent-setup.md)). Diese Seite beschreibt die manuellen Schritte.

## Voraussetzungen

- Linux-Server (systemd), Node.js 22+, pnpm 10+.
- Optional: Tailscale (privater Remote-Zugriff), code-server (eingebetteter Editor),
  `codex`-/`opencode`-/`claude`-CLIs, CodexBar (Nutzungshistorie), Mistral-Key (Tech-TLDRs).
- Für dauerhafte User-Dienste ohne offene SSH-Sitzung: `loginctl enable-linger your-user`.

## Anwendung vorbereiten

1. `config/wrapt.example.json` nach `config/wrapt.local.json` kopieren und mit den
   echten Werten füllen (Benutzer, Home, Projekt-Root, Tailscale, erlaubte Login-E-Mails,
   CLI-Pfade). Diese Datei ist die zentrale Personalisierung und wird von Git ignoriert.
2. `.env.example` nach `.env` kopieren; nur Secrets/Runtime-Knöpfe setzen (`MISTRAL_API_KEY`
   optional). `HOST=127.0.0.1` beibehalten.
3. Optional weitere Beispielkonfigurationen (`config/*.example.json`) nach `*.local.json`
   kopieren und anpassen.
4. `bash scripts/install-deps.sh` ausführen (prüft Node/pnpm, installiert, baut). Alternativ
   manuell: `pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Betrieb

**Entwicklung:** `pnpm dev` (Server + Vite mit Hot-Reload).

**Produktion (manuell):** `pnpm build && pnpm start`.

**Produktion (systemd):** `bash deploy/systemd/install.sh` rendert die User-Units aus
`deploy/systemd/units/` mit den Werten aus `config/wrapt.local.json`, baut als
aktueller Benutzer, prüft Typen und Build, sichert vorhandene User-Units und führt einen
Healthcheck aus. code-server wird nur eingebunden, wenn es im PATH vorhanden ist. Die kanonische
Unit heißt `wrapt.service` und liegt unter `~/.config/systemd/user/`; sie entspricht damit
den tatsächlichen Schreibpfaden in Repository, Datenverzeichnis, Browserprofilen und CLI-Homes.

code-server bindet an `127.0.0.1:8080`, deaktiviert eigene TLS-Terminierung und wird
ausschließlich durch die privates Wrapt unter `/editor/` erreicht. Die User-Unit liest
`config/code-server.yaml`; fehlt die lokale, ignorierte Datei beim Installieren, wird sie einmalig
aus `config/code-server.yaml.example` angelegt. Workspace Trust ist dort deaktiviert, weil dieser
private Einzelbenutzer-Editor alle geöffneten Projektordner mit vollständigem Zugriff nutzt.

## Tailscale Serve (optional)

`bash deploy/proxy/configure-tailscale-serve.sh` veröffentlicht Wrapt privat im Tailnet
über den in `config/wrapt.local.json` gesetzten HTTPS-Port. Editor und Previews benötigen
keinen weiteren Tailscale-Port, weil Fastify `/editor/` und code-server `/absproxy/<port>/` am
selben Origin bereitstellen. Funnel und öffentliche Portweiterleitungen bleiben deaktiviert.

## Abschlussprüfung

- `systemctl --user status wrapt.service`
- `curl -f http://127.0.0.1:3010/api/v1/health`
- Optional: `curl -f http://127.0.0.1:8080/healthz` (code-server), `tailscale serve status`
- Private Wrapt, Terminal, Codex, OpenCode und Editor im Browser testen.

Ein bestehender alter Systemdienst `workbench.service` muss nach erfolgreichem
Healthcheck bewusst deaktiviert werden, damit nicht zwei Prozesse um Port 3010 konkurrieren:
`systemctl --user disable --now workbench.service`. Für den normalen Betrieb und spätere
Updates ist danach kein `sudo` erforderlich.

## Hermes Agent

Voraussetzung ist eine vorhandene Hermes-Installation mit funktionierender virtueller Python-
Umgebung und Node/npm für den Dashboard-SPA-Build. Der Checkout wird nicht neu geklont und nicht
in dieses Repository verschoben:

```bash
bash scripts/install-hermes.sh
```

Das Skript erstellt zunächst ein offizielles Hermes-Backup, baut die Dashboard-SPA, erkennt die
lokalen Pfade, installiert das Wrapt-Theme und rendert `hermes-dashboard.service`,
`hermes-update.service`, `hermes-update.timer` sowie den Retry-Timer als User-Units. Die bestehende
`hermes-gateway.service` bleibt unverändert und wird nur aktiviert, falls sie noch nicht aktiviert
ist. Approval-Härtung wird mit Vorher-/Nachher-Anzahl der Dauerfreigaben ausgegeben.

Für Checkouts mit `package-lock.json` wird `npm ci` verwendet. Hermes-Versionen ohne Lockfile
werden mit `npm install --no-audit --no-fund` gebaut; dadurch bleibt der Installations- und
Updatepfad auch für den aktuellen Hermes-Checkout funktionsfähig.

Prüfen:

```bash
XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user is-active hermes-dashboard.service hermes-gateway.service
XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user list-timers 'hermes-*' --all
curl -f -H 'Host: 127.0.0.1:9119' http://127.0.0.1:9119/api/status
```

Der direkte Hermes-Port wird nicht veröffentlicht. Zugriff auf die offizielle Hermes-SPA erfolgt
nur über die identitätsgeschützte Wrapt-URL `/hermes/`; die Wrapt öffnet sie unter
`/wrapt/hermes-agent`.
