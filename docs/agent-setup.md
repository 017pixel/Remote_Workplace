# Agent-Setup — Wrapt einrichten

Diese Datei ist eine präzise Schritt-für-Schritt-Anleitung **für einen Coding-Agent**
(z. B. Claude Code, Codex, OpenCode), der Wrapt auf einem Server einrichtet.
Der Agent führt die Schritte aus, fragt den Benutzer nach den benötigten Werten und
verifiziert am Ende, dass alles läuft.

> Menschliche Nutzer können denselben Ablauf auch manuell durchführen — siehe die
> Kurzform im [README](../README.md#manuelle-installation-kurzform).

---

## 0. Voraussetzungen (prüfen, nicht raten)

- **Betriebssystem:** Linux mit systemd (für den Dienstbetrieb). Entwicklung geht auch ohne.
- **Node.js ≥ 22** und **pnpm 10** (`scripts/install-deps.sh` prüft/installiert das).
- **tmux** — für die Terminal-Sessions.
- **Chromium/Chrome** — für das integrierte Browser-Tool (optional, aber empfohlen).
- **Tailscale** — für den privaten Remote-Zugriff (optional; lokal läuft es auch ohne).
- **code-server** — optional, nur für den eingebetteten Editor.
- **CodexBar-CLI** — optional, nur für die Nutzungs-/Limit-Historie.
- **Mistral-Account** — optional, nur für die KI-Funktionen der Tech-TLDRs.

Prüfe zuerst, was vorhanden ist:
```bash
node -v; pnpm -v; tmux -V; command -v chromium || command -v chromium-browser || command -v google-chrome; command -v tailscale
```

---

## 1. Werte vom Benutzer erfragen

Stelle dem Benutzer diese Fragen und sammle die Antworten (Pflicht = *):

1. **Systembenutzer & Home-Verzeichnis*** — z. B. `alice` / `/home/alice`
   (Standard: aktueller Benutzer, `id -un` / `$HOME`).
2. **Projekt-Wurzelverzeichnis*** — wo liegen die Projekte? z. B. `/home/alice/projects`.
3. **Tailscale-Hostname & IP** — z. B. `server-name.tailnet.ts.net` / `100.x.y.z`
   (nur nötig für Remote-Zugriff; sonst Platzhalter lassen).
4. **HTTPS-Port für Tailscale** — Standard `8443`.
5. **Erlaubte Login-E-Mails** — die Tailscale-Identitäten, die auf die Wrapt dürfen
   (z. B. `alice@example.com`).
6. **Optionale CLI-Pfade** — `codex`, `opencode`, `claude`, `codexbar`, `tmux`, `chromium`
   (Standard: automatische Erkennung im PATH).
7. **CodexBar** — soll die Nutzungshistorie aktiviert werden? Falls ja: Pfad zur
   `codexbar`-Binary und zur `config.json`.
8. **Mistral-API-Key** — optional, aktiviert die KI-Funktionen der Tech-TLDRs.

---

## 2. Konfigurationsdateien erzeugen

Es gibt genau **zwei** lokale, gitignorierte Dateien mit persönlichen Werten:

### a) `config/wrapt.local.json`
Kopiere `config/wrapt.example.json` nach `config/wrapt.local.json` und trage die
Antworten aus Schritt 1 ein. Bedeutung der Felder:

| Feld | Bedeutung |
|------|-----------|
| `branding.appName` / `shortName` | Anzeigename der App (Titel, Manifest, Footer). |
| `system.user` / `homeDirectory` | Dienstbenutzer und dessen Home. |
| `tailscale.hostname` / `ip` / `httpsPort` | Für Dev-Server-Hosts und den Reverse-Proxy. |
| `tailscale.allowedUsers` | Erlaubte Login-E-Mails (Terminal/Editor-Zugriff). |
| `paths.*` | Projekt-Roots, Datenverzeichnis, Datenbank, Backups, Assets, Profile. |
| `paths.codexSharedHome` / `claudeSharedHome` / `opencodeSharedHome` | Optional. Gemeinsame Homes der KI-Werkzeuge für den Accountwechsel (Standard: `<home>/.codex`, `<home>/.claude`, `<home>/.local/share/opencode`). |
| `cli.*` | Pfade zu `codexbar`, `codex`, `opencode`, `claude`, `tmux`, `chromium`. |
| `codexbar.configPath` / `oauthProfileHomes` | CodexBar-Konfiguration und optionale OAuth-Profile. |

### b) `.env`
Kopiere `.env.example` nach `.env`. Hier gehören **nur Secrets und neutrale Runtime-Knöpfe**
hinein — insbesondere `MISTRAL_API_KEY` (optional). Persönliche Pfade/Identität gehören
**nicht** in die `.env`, sondern in `config/wrapt.local.json`.

> Env-Variablen in `.env` überschreiben bei Bedarf einzelne Werte aus der zentralen Config.

---

## 3. Abhängigkeiten installieren & bauen

```bash
bash scripts/install-deps.sh
```
Das Skript prüft Node/pnpm, legt fehlende `config`/`.env` aus den Vorlagen an, installiert
die Abhängigkeiten und baut alle Pakete. Idempotent — mehrfach ausführbar.

---

## 4. Starten

**Entwicklung** (Server + Vite mit Hot-Reload):
```bash
pnpm dev
```

**Produktion** (Build + Server):
```bash
pnpm build && pnpm start
```

**Optional als systemd-Dienst** (Linux, dauerhafter Betrieb):
```bash
bash deploy/systemd/install.sh               # rendert User-Units aus der Config und installiert sie (kein sudo)
bash deploy/proxy/configure-tailscale-serve.sh   # veröffentlicht privat im Tailnet (optional)
sudo bash deploy/systemd/install-codexbar.sh # optionaler CodexBar-Dienst
```
Die systemd-Units werden aus den Templates in `deploy/systemd/units/` gerendert und mit den
Werten aus `config/wrapt.local.json` gefüllt (siehe `deploy/systemd/render-units.mjs`).

---

## 4b. KI-Accounts registrieren (optional)

Je Werkzeug — Codex, Claude Code, OpenCode — ist serverweit **genau ein Account aktiv**.
Umgeschaltet wird nur die Anmeldung: Die Anmeldedatei im gemeinsamen Home (`auth.json`, bei
Claude Code `.credentials.json`) ist ein Symlink in den Anmeldespeicher des aktiven Accounts.
Konfiguration, Sessions und Verlauf bleiben geteilt, es gibt also weiterhin nur einen
Projekt- und Sessionbestand.

1. Bestehende Anmeldungen erkennt die Wrapt unter **Nutzung → Accounts** automatisch;
   mit „Registrieren“ werden sie aufgenommen.
2. Weitere Accounts über „Neu anmelden“ hinzufügen — die Anmeldung läuft in einem
   eingebetteten Terminal, bei Codex per Gerätecode ohne localhost-Rückruf.
3. Umschalten per „Aktivieren“ oder auf der Kommandozeile:

```bash
scripts/ki-account.sh                  # alle Accounts, der aktive ist mit * markiert
scripts/ki-account.sh use arbeit       # per Name, E-Mail oder Profilpfad aktivieren
scripts/ki-account.sh use claude privat  # bei mehrdeutigen Namen das Werkzeug voranstellen
```

Ein Account, der noch direkt auf das gemeinsame Home zeigt, bekommt beim ersten Aktivieren
automatisch einen eigenen Anmeldespeicher unter `paths.wraptProfilesRoot`. Zugangsdaten
werden dabei nie gelöscht, sondern verschoben und gesichert.

---

## 5. Verifikation (führt der Agent selbst durch)

1. **Health-Check:**
   ```bash
   curl -s http://127.0.0.1:3010/api/v1/health
   ```
   Antwort enthält `"appName"` mit dem konfigurierten Namen.
2. **UI erreichbar:** `http://127.0.0.1:3010/workbench` (bzw. über Tailscale-Host:Port).
3. **Projekte sichtbar:** Im Orbit erscheinen die Projekte aus `paths.projectsRoot`.
4. **Terminal/Browser/News/Usage** laden ohne Fehler.

Melde dem Benutzer am Ende kurz: Was läuft, welche optionalen Dienste aktiv sind und
welche Werte in `config/wrapt.local.json` gesetzt wurden (ohne Secrets auszugeben).
