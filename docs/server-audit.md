# Server Audit

**Datum:** 12.07.2026 (UTC)  
**Methode:** Read-only Prüfung; keine bestehende Unit, kein Proxy und kein Dienst wurde verändert.

## Ergebnis

- Betriebssystem: Ubuntu 24.04.4 LTS, Kernel 6.8.0-134-generic.
- Entwicklungsbenutzer: `bbecker` (UID 1000).
- Node.js: 22.23.1.
- Paketmanager: npm 11.17.0, pnpm 10.29.2, Yarn 1.22.22 und Bun 1.3.11.
- Servername: `benjaminsserver`.
- Tailscale: verbunden; privater DNS-Name `benjaminsserver.tail6494b7.ts.net`.
- Reverse Proxy: Tailscale Serve, kein systemweit installiertes Caddy, nginx oder Apache.
- Tailscale Serve leitet HTTPS Port 443 auf `http://127.0.0.1:3773` weiter.
- Firewallstatus: nicht lesbar, weil die Ausführungsumgebung Root-Eskalation über `no_new_privs` blockiert. `ufw` ist vorhanden. Vor Live-Schaltung muss ein Administrator `sudo ufw status verbose` manuell prüfen.

## Dienste und Ports

- T3 Code: vorhanden, aktiv, systemd Unit `t3-code.service`, Benutzer/Gruppe `bbecker`, Working Directory `/home/bbecker/projects`, Startskript `/home/bbecker/.local/bin/t3-code-service`, lokaler Port 3773, privates HTTPS auf Port 443.
- code-server: nicht im PATH, nicht als Debian-/Snap-/npm-/pnpm-Paket, nicht als systemd Unit und nicht als Docker-Container gefunden. Kein Port konnte zugeordnet werden.
- Workbench Backend: im Audit noch nicht installiert; Port 3010 war frei und wurde als localhost-Port festgelegt.
- Aktive Vite Preview: Port 1234, Prozess unter `bbecker`, Projektordner `/home/bbecker/projects/tg-vereinsapp`.
- Weitere belegte TCP-Ports: 22, 631, 7000, 8081, 8091, 8100, 54321 und 54322 sowie Tailscale-interne Listener.
- Freie geprüfte Kandidaten: 3010, 5173, 8080, 8443, 8444 und 8445.

## Reale Projektordner

Im Root `/home/bbecker/projects` wurden folgende Verzeichnisse gefunden:

- `Bred.AI`
- `CHAPPiE`
- `DailyQuest-Next`
- `HomeOrganizer`
- `Info-Hall`
- `Ltbb`
- `PaintingIdeas`
- `Remote_Workplace`
- `Sandbox--Zerstoerer`
- `SchulPage`
- `Server_Infos`
- `TikTok-Saves`
- `agent-workflows`
- `bred`
- `dailyquest`
- `memory`
- `minecraft-2d-mobile`
- `odysseus`
- `opencode-skills`
- `tg-vereinsapp`
- `zindonit-adventure`

Für den initialen lokalen Workbench-Stand wurden CHAPPiE, DailyQuest, TG VereinsApp, SchulPage und Bred.AI ausgewählt. Alle fünf Pfade wurden vom Backend als vorhandene, direkt zugängliche Verzeichnisse validiert. Die lokale Auswahl liegt absichtlich in der ignorierten Datei `config/projects.local.json`.

## Kapazität zum Auditzeitpunkt

- Root-Dateisystem: 774 GiB gesamt, etwa 125 GiB belegt, etwa 617 GiB frei.
- RAM: 754 GiB gesamt, etwa 10 GiB aktiv verwendet.
- Server-Uptime: etwa 6 Tage und 6 Stunden.

## Risiken und Blocker

- code-server fehlt. Editor-Links bleiben deshalb `null`; die Workbench erfindet keinen Port und zeigt den Dienst als inaktiv.
- Die aktive Preview ist nur über HTTP Port 1234 erreichbar. In einer HTTPS-Workbench wäre sie Mixed Content und bleibt deshalb zunächst `external`.
- Eine gepaarte T3-Session wurde nicht hergestellt, weil dafür ein Credential hätte gelesen oder erzeugt werden müssen. Pairing-Secrets werden weder auditiert noch gespeichert.
- Der Firewallstatus muss mit Administratorrechten bestätigt werden. Insbesondere die aktuell auf `0.0.0.0` gebundenen Ports 1234, 7000, 54321 und 54322 sind gegen die gewünschte ausschließlich private Erreichbarkeit zu prüfen.
- Tailscale ACLs sind nicht aus dem lokalen Node-Status ableitbar. Die Workbench setzt voraus, dass der Tailnet-Zugriff auf Benjamin bzw. freigegebene Geräte begrenzt ist.

