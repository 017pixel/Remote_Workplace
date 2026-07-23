# Installation

Der empfohlene Weg ist die Einrichtung durch einen Coding-Agent
([docs/agent-setup.md](agent-setup.md)). Diese Seite beschreibt die manuellen Schritte.

## Voraussetzungen

- Linux-Server (systemd), Node.js 22+, pnpm 10+.
- Optional: Tailscale (privater Remote-Zugriff), code-server (eingebetteter Editor),
  `codex`-/`opencode`-/`claude`-CLIs, CodexBar (Nutzungshistorie), Mistral-Key (Tech-TLDRs).
- Für dauerhafte User-Dienste ohne offene SSH-Sitzung: `loginctl enable-linger your-user`.

## Anwendung vorbereiten

1. `config/workbench.example.json` nach `config/workbench.local.json` kopieren und mit den
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

**Produktion (systemd):** `sudo bash deploy/systemd/install.sh` rendert die Units aus
`deploy/systemd/units/` mit den Werten aus `config/workbench.local.json`, baut als
Dienstbenutzer, prüft die Units, sichert vorhandene System-Units und führt einen Healthcheck
aus. code-server wird nur eingebunden, wenn es im PATH vorhanden ist.

code-server bindet an `127.0.0.1:8080`, deaktiviert eigene TLS-Terminierung und wird
ausschließlich durch die private Workbench unter `/editor/` erreicht. Eine Beispiel-Konfiguration
liegt unter `config/code-server.yaml.example`.

## Tailscale Serve (optional)

`bash deploy/proxy/configure-tailscale-serve.sh` veröffentlicht die Workbench privat im Tailnet
über den in `config/workbench.local.json` gesetzten HTTPS-Port. Editor und Previews benötigen
keinen weiteren Tailscale-Port, weil Fastify `/editor/` und code-server `/absproxy/<port>/` am
selben Origin bereitstellen. Funnel und öffentliche Portweiterleitungen bleiben deaktiviert.

## Abschlussprüfung

- `systemctl status remote-workplace.service`
- `curl -f http://127.0.0.1:3010/api/v1/health`
- Optional: `curl -f http://127.0.0.1:8080/healthz` (code-server), `tailscale serve status`
- Private Workbench, Terminal, Codex, OpenCode und Editor im Browser testen.
