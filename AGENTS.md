# AGENTS.md — Anleitung für Coding-Agenten

Diese Datei ist die zentrale Anleitung für KI-/Coding-Agenten, die an **Remote Workplace**
arbeiten. Sie gilt für alle Tools, die `AGENTS.md` lesen (Codex, OpenCode, u. a.).
Claude Code liest zusätzlich `CLAUDE.md`, die auf diese Datei verweist.

Der Ton dieses Projekts ist deutsch — Commit-Messages, Kommentare und UI-Texte auf Deutsch.

## Was ist das Projekt?

Selbst gehostete Remote-Development-Workbench (privater Arbeitsplatz im Browser). Der Server
läuft auf `127.0.0.1:3010`, erreichbar über Tailscale. **Besonderheit:** Die Workbench wird
benutzt, um an sich selbst weiterzuentwickeln — Änderungen am Code werden im laufenden Betrieb
neu gebaut und neu gestartet.

- **pnpm-Monorepo** (`pnpm@10`, Node ≥ 22), TypeScript überall.
- `apps/server` — Fastify-Backend (`@workbench/server`), Port 3010, API unter `/api/v1`.
- `apps/web` — React/Vite-Frontend (`@workbench/web`), wird als statisches `dist/` vom Server ausgeliefert.
- `packages/contracts` — geteilte Zod-Schemas (`@workbench/contracts`). **Muss vor Server/Web gebaut werden.**

## Wichtigste Befehle

| Zweck | Befehl |
| --- | --- |
| Entwicklung (Hot-Reload, Server + Web parallel) | `pnpm dev` |
| Alles bauen | `pnpm build` |
| Typen prüfen | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Unit-Tests | `pnpm test` |
| End-to-End-Tests | `pnpm test:e2e` |
| Health-Check | `curl -s http://127.0.0.1:3010/api/v1/health` |

Contracts nach Schema-Änderungen zuerst bauen: `pnpm --filter @workbench/contracts build`.
Vor jedem Abschluss `pnpm typecheck` (und bei Bedarf `pnpm lint`) laufen lassen.

## Neustart-Workflow (Frontend / Backend / beides)

Nach Code-Änderungen bringst du sie so in die **laufende** Workbench, ohne Workspace-Daten zu
verlieren. Es gibt drei gleichwertige Wege — Skript, API oder UI-Button.

### 1. Shell-Skripte (empfohlen für Agenten — du siehst die Build-Ausgabe)

```bash
bash scripts/restart-frontend.sh   # nur Web neu bauen; Server liefert es sofort aus
bash scripts/restart-backend.sh    # Server neu bauen + Dienst neu starten
bash scripts/restart-all.sh        # Frontend + Backend neu bauen + Dienst neu starten
```

- Die Skripte bauen zuerst **sichtbar** (Build-Fehler brechen ab, bevor etwas neu startet).
- Der eigentliche Dienst-Neustart wird in einer eigenen `systemd`-Einheit eingeplant, damit er
  den aufrufenden Prozess (auch ein Workbench-Terminal!) überlebt. Details in `scripts/lib-restart.sh`.
- **Frontend** braucht keinen Dienst-Neustart — nach dem Build im Browser einfach neu laden.

### 2. HTTP-API (wird auch vom UI-Button benutzt)

```bash
curl -s -X POST http://127.0.0.1:3010/api/v1/system/restart \
  -H "Content-Type: application/json" \
  -d '{"target":"backend"}'      # "frontend" | "backend" | "both"
```

Antwortet sofort mit `202 Accepted` und startet das passende Skript losgelöst im Hintergrund.
Die Logs liegen unter `data/restart-logs/`.

Den Fortschritt fragst du hier ab — inklusive Build-Log, falls etwas schiefging:

```bash
curl -s http://127.0.0.1:3010/api/v1/system/restart/status
```

`phase` ist `idle`, `running`, `succeeded` oder `failed`; `step` nennt den laufenden Build-Schritt,
`logTail` enthält das Ende der Build-Ausgabe. Die Skripte schreiben denselben Zustand nach
`data/restart-logs/last-status.json`.

### Woran erkenne ich, dass es fertig ist?

`GET /api/v1/health` liefert zwei Marker:
- `bootId` — zufällig pro Serverprozess. **Ändert sich ⇒ Backend wurde neu gestartet.**
- `webBuildId` — mtime von `apps/web/dist/index.html`. **Ändert sich ⇒ Frontend wurde neu gebaut.**

Baseline vor dem Neustart merken, danach `health` pollen, bis sich der relevante Marker ändert.
Das Frontend (Einstellungen → „Dienst neu starten") macht genau das und lädt dann automatisch neu.

### Produktion vs. Entwicklung

- **Produktion:** Der Server läuft als **User-**systemd-Dienst `workbench.service`
  (`~/.config/systemd/user/`, `Restart=always`, `StartLimitIntervalSec=0` in `[Unit]` —
  in `[Service]` ignoriert systemd den Schlüssel und der Dienst gibt nach 5 Fehlstarts auf).
  Steuern:
  `XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user <status|restart|stop> workbench.service`.
  `sudo` kann auf dem Server vorhanden sein, wird von der Workbench aber bewusst nicht verwendet.
  Alle Workbench-, T3- und Hermes-Dienste sind User-Units und werden mit `systemctl --user` gesteuert.
- **Entwicklung (`pnpm dev`):** `tsx watch` startet das Backend bei Dateiänderung selbst neu,
  Vite macht HMR fürs Frontend. Ein Dienst-Neustart ist dann unnötig; die Skripte erkennen das
  und überspringen den Neustart mit einem Hinweis.

## Hermes Agent

Hermes bleibt in seinem eigenen Checkout und verwendet weiterhin `HERMES_HOME`. Die Workbench
verschiebt diese Daten nicht. Die sichtbare Chat- und Verwaltungsoberfläche ist ausschließlich
die offizielle Hermes-SPA unter `/hermes`, inklusive ihres PTY-Chats und Events Feed. Interne
ACP-Funktionen dürfen für Hintergrundaufgaben bestehen bleiben, sind aber keine zweite sichtbare
Chatfläche. Der Dashboard-Port bindet nur an Loopback und ist nicht über Tailscale Serve oder
Funnel veröffentlicht.

- `hermes-dashboard.service` und die beiden Update-Timer sind User-Units. Die bestehende
  `hermes-gateway.service` wird übernommen und nicht ersetzt.
- Installation und SPA-Build laufen mit `bash scripts/install-hermes.sh`; der Lauf erstellt ein
  Hermes-Backup, installiert das Workbench-Theme und setzt die Approval-Grundlage auf `ask`.
- Updates laufen über `hermes-update.service`, eine Sperre und den Beschäftigungscheck. Ein
  fehlgeschlagenes Update bleibt in der Diagnose und der Benachrichtigungszentrale sichtbar.
- API-Schlüssel und Session-Tokens bleiben in Hermes beziehungsweise im serverseitigen Adapter.
  Sie werden niemals in Browserzustand, Logs oder Implementierungsberichte geschrieben.
- Konfiguration, Diagnose und Rollback: [`docs/configuration.md`](docs/configuration.md),
  [`docs/troubleshooting.md`](docs/troubleshooting.md) und [`docs/security-exceptions.md`](docs/security-exceptions.md).

## T3 Code: Stable oder Nightly

T3 Code läuft als **eine** Instanz (`t3-code.service`, User-Unit) auf `127.0.0.1:3773`. Alle
Flächen (Panel, Orbit, Projekt-Detail, Seite „T3 Code") hängen am selben Proxy `/t3` — es gibt
keinen Parallelbetrieb beider Kanäle.

- **Umschalten:** Einstellungen → „T3 Code Kanal" (Stable = `t3@latest`, Nightly = `t3@nightly`).
  Der Wert landet in `config/workbench.local.json` unter `t3.channel` und überlebt Neustarts.
- **Wirksam wird der Wechsel erst beim nächsten Neustart** (Backend oder Beides). Es gibt bewusst
  keinen Auto-Neustart; die Card zeigt bis dahin „Neustart erforderlich".
- **Was beim Neustart passiert** (`scripts/sync-t3-channel.sh`, aufgerufen aus `lib-restart.sh`):
  npm-Paket installieren → alten Prozess beenden (SIGTERM, dann SIGKILL) → warten, bis Port 3773
  frei ist → Unit starten → per HTTP auf Bereitschaft warten. Stimmt der Kanal bereits und
  antwortet T3, passiert **nichts** — laufende T3-Sitzungen bleiben also bei normalen Neustarts erhalten.
- **Fehler:** Schlägt der npm-Install fehl (offline), bricht der Lauf ab und der alte Kanal läuft
  weiter. Steht kein Kanalwechsel an, ist ein Fehler nur eine Warnung und blockiert den
  Backend-Neustart nicht.
- **Status abfragen:** `curl -s http://127.0.0.1:3010/api/v1/system/t3-channel`
- **Daten:** Beide Kanäle nutzen `~/.t3/userdata/state.sqlite`. Threads bleiben beim Wechsel
  erhalten. **Achtung beim Downgrade Nightly → Stable:** Nightly kann Schema-Migrationen anwenden,
  die die ältere Stable-Version nicht kennt. Vorher `state.sqlite` sichern.

## Keine Daten verlieren

- **Workspace-Zustand** (geöffnete Panels, Arbeitsflächen) liegt im Browser-`localStorage` → von Neustarts unberührt.
- **Orbit-Daten, Galerie, Accounts** liegen in SQLite unter `~/.local/share/remote-workplace/workbench.sqlite`
  (NICHT `data/workbench.sqlite` im Repo — das ist eine alte Kopie) → unberührt.
- **Laufende Terminals** werden beim **Backend-**Neustart unterbrochen — unvermeidlich, so erwartet.

## Aktiver KI-Account (Codex, Claude Code, OpenCode)

Serverweit ist je Werkzeug genau ein Account aktiv. Umgeschaltet wird nur die Anmeldung: Die
Anmeldedatei im gemeinsamen Home ist ein Symlink in den Anmeldespeicher des aktiven Accounts
und wird atomar umgehängt. Konfiguration, Sessions und Verlauf bleiben gemeinsam — es gibt
weiterhin nur einen Projekt- und Sessionbestand.

| Werkzeug | Gemeinsames Home | Anmeldedatei |
|---|---|---|
| Codex | `~/.codex` | `auth.json` |
| Claude Code | `~/.claude` | `.credentials.json` |
| OpenCode | `~/.local/share/opencode` | `auth.json` |

```bash
scripts/ki-account.sh                    # Accounts anzeigen, der aktive ist mit * markiert
scripts/ki-account.sh use arbeit         # per Name, E-Mail oder Profilpfad aktivieren
scripts/ki-account.sh use claude privat  # bei mehrdeutigen Namen das Werkzeug voranstellen
```

- Jeder **danach gestartete** Prozess nutzt den neuen Account, auch außerhalb der Workbench.
  Bereits laufende Prozesse behalten ihren — also gegebenenfalls das Terminal neu starten.
- Eine erneute Anmeldung ist nie nötig. Ersetzt ein CLI den Symlink durch eine reguläre Datei,
  übernimmt die Workbench deren neuere Zugangsdaten in den Speicher des aktiven Accounts und
  hängt den Symlink wieder ein; die alte Fassung bleibt als `*.ersetzt-<Zeitstempel>` liegen.
- Ein gemeinsames Home ist selbst kein Account. Zeigt ein Account noch darauf, bekommt er beim
  ersten Aktivieren automatisch einen eigenen Anmeldespeicher.

## Preview-Slots und Browser

- Development-Previews verwenden standardmäßig direkte iframes über getrennte HTTPS-Slot-Origins. Die internen Ports stehen in `previews.slotPorts`, die Tailscale-Ports in `previews.publicPorts`.
- Slot-Zuordnungen liegen in derselben externen SQLite-Datenbank wie Orbit und überleben Neustarts. HTTP und WebSocket werden am Root weitergeleitet; Vite braucht keinen besonderen `base`.
- localStorage und IndexedDB sind pro Slot getrennt, Cookies jedoch nicht. Für Cookie-Isolation, geräteübergreifend geteilte Sitzungen oder blockiertes Embedding den Server-Chromium-Fallback verwenden.
- **Externe URLs erreichen den lokalen Preview-Gateway nie.** Sie werden im echten Client-Browser oder im Server-Chromium geöffnet.
- Alle Preview-Endpunkte verlangen eine erlaubte Tailscale-Identität, mutierende zusätzlich Same-Origin. Benutzer sehen nur eigene Sessions, Snapshots und Storage-Profile; fremde Slots erscheinen nur als „belegt".
- Ein Slot, dessen Storage-Reset nicht verifizierbar war, bleibt fail-closed in Quarantäne und wird nicht neu vergeben.
- Die Feature-Flags stehen unter `previews` in `config/workbench.local.json` (`gatewayV2Enabled`, `bridgeEnabled`, `diagnosticsEnabled`, `storageSyncMode`, `slotResetEnabled`) — Details in [`docs/configuration.md`](docs/configuration.md).
- Der eigenständige Browser bleibt ein serverseitiger Chromium-Stream. Seine lokale Portübersicht öffnet ein Preview-Panel beziehungsweise eine 1er-Preview-Gruppe.
- Nach Änderungen an Preview-Ports einmalig `sudo bash deploy/proxy/configure-tailscale-serve.sh` ausführen.

### Doctor und sichere Reparatur

```bash
bash scripts/preview-doctor.sh --status     # Slots, Routing-Revision, Kandidaten
bash scripts/preview-doctor.sh --probe      # Dienste erneut prüfen (nur Vorschläge)
bash scripts/preview-doctor.sh --logs --since 1h --severity error
```

Der Doctor läuft ohne `sudo`, spricht nur über Loopback und liest sein Capability-Token aus
`<paths.dataDir>/preview-agent-capability`. Er verändert **keinen** Projektcode, schließt keine
fremde Session, bestätigt keinen Storage-Reset und liest keine Snapshots.

### Browser-Verifikation durch Coding-Agenten

- Die T3-eigenen `preview_*`-Werkzeuge benötigen einen verfügbaren Automation-Host der
  Desktop-App. Ein `PreviewAutomationNoAvailableHostError` in Web-, TUI- oder headless-
  Umgebungen bedeutet deshalb nicht, dass Browser-Verifikation grundsätzlich unmöglich ist.
- Wenn dieser Fehler auftritt, verwenden Agenten den konfigurierten headless
  `playwright`-MCP-Server für UI-Prüfungen: zuerst `browser_navigate`, danach
  `browser_snapshot` und bei Bedarf die fokussierten Browser-Aktionen. Für lokale Dienste
  sind `http://127.0.0.1:<port>` oder `http://localhost:<port>` zu verwenden.
- `curl` oder ein API-Smoke-Test kann zusätzlich sinnvoll sein, ersetzt aber bei UI-Änderungen
  nicht die Browser-Verifikation. Ist auch der `playwright`-MCP nicht verfügbar, muss das als
  separates MCP-/Browser-Problem gemeldet werden.

### Zugriff auf Preview-Logs (max. sieben Tage)

Preview-Logs dürfen gelesen werden, wenn sie für eine **aktuelle** Diagnose nötig sind oder der
Benutzer es verlangt — nie vorsorglich oder flächendeckend. Zeitraum, Preview und Severity so eng
wie möglich wählen, Ergebnisse zusammenfassen und keine Secrets, Tokens oder personenbezogenen
Inhalte in Antworten kopieren. Standardweg ist die redigierte API beziehungsweise der Doctor;
direkter Dateizugriff auf `<paths.dataDir>/preview-logs/` nur, wenn API/Doctor defekt sind, der
Logger untersucht wird oder der Benutzer es ausdrücklich verlangt. Logs sind Best-Effort-Diagnose
und nicht so vollständig wie CDP/Chrome DevTools. Vollständige Anleitung:
[`docs/previews-for-agents.md`](docs/previews-for-agents.md).

### Design-Pflicht für Preview-UI

Vor Änderungen an Preview-, Diagnose-, Storage-, Quarantäne- oder Browser-Komponenten sind die
Skills `design-system-guide` und `mobile-design` zu lesen und anzuwenden. Das bestehende
Remote-Workplace-Design hat Vorrang; einzige Farbquelle bleibt der `@theme`-Block in
`apps/web/src/index.css`. Keine Gradients, keine Emojis, keine neuen Hex-Farben in Komponenten,
Touch-Ziele ab 44 × 44 px, Diagnose mobil als Bottom Sheet.

## Design-System

Die Oberfläche folgt der Palette von **T3 Code Nightly**. Einzige Quelle ist der `@theme`-Block
ganz oben in `apps/web/src/index.css` — Farben gehören dort hinein, nicht in Komponenten.

- **Basis** ist neutrales `#0a0a0a`. Darüber liegen genau drei opake Ebenen: Karte/Sidebar
  (`--color-ink-900`), Overlay (`--color-ink-850`) und Dialoge.
- **Flächen entstehen durch weiße Transparenz** (`--color-ink-800/750/700/600` = 4/6/8/12 %),
  nicht durch weitere Grautöne. Opak bleiben nur Ebenen, hinter denen Inhalt liegt — sonst
  scheint er durch Menüs und Dialoge.
- **Akzent** ist `oklch(58.8% .217 264)`; Primäraktionen sind gefüllt blau mit weißer Schrift.
  Status: Emerald (ok), Amber (warn), Red (bad), jeweils mit `-soft` als 15-%-Fläche.
- **Schrift:** DM Sans Variable für Text, JetBrains Mono für Code/Zahlen (via `@fontsource`,
  selbst gehostet — keine externen Font-CDNs).
- **Radius** rechnet aus `--radius: .625rem`; Schatten sind auf der dunklen Basis kräftiger.
- Neue Styles nutzen ausschließlich Tokens. Vor dem Abschluss prüfen:
  `grep -oE '#[0-9a-fA-F]{3,8}' apps/web/src/index.css` darf nur den `@theme`-Block,
  die drei bewusst weißen Flächen (Geräte-Vorschau, Browser-Canvas) und den
  bewusst abgegrenzten `.hermes-shell`-Tokenblock (Hermes-Farbwelt) treffen.

## Konventionen

- Globale/konfigurierbare Werte gehören in `config/workbench.local.json` bzw. `.env`, nicht hartkodiert.
- API-Verträge zuerst in `packages/contracts` (Zod) definieren, dann Server und Client anpassen.
- Deutsch schreiben (Commits, Kommentare, UI). Bestehenden Stil der Nachbardateien übernehmen.
- Vor dem Abschluss: `pnpm typecheck` grün, relevante Tests laufen lassen.
