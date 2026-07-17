# Benjamin Dev Workbench

Private, selbst gehostete Remote-Development-Workbench für T3 Code, code-server, native PTY-Terminals, lokale Projekte und Development-Previews.

## Implementierter Stand

- React-19-/Vite-Frontend und Fastify-5-Backend in einem strict TypeScript Monorepo.
- Tech TLDRs mit RSS-, Atom-, Hacker-News- und YouTube-Feed, deutschen Mistral-Zusammenfassungen, automatischer Wichtigkeit, semantischer Suche und quellengebundenen Rückfragen.
- Editorial-Bento auf Desktop sowie vertikaler Mobile-Snap-Feed mit Dynamic-Island-Wechsel zwischen Feed und benennbaren Sammlungen.
- Freier Orbit Workspace mit Zoom, Pan, Lasso, Mehrfachauswahl, adaptiv wachsendem Arbeitsgebiet und mehreren Canvas-Tabs.
- Mobile Orbit-Bedienung mit zuverlässigem Canvas-/Inhaltsmodus, Zwei-Finger-Pan und Pinch-Zoom, scrollbarer Steuerleiste sowie daumenfreundlichem Fünfer-Dock.
- Projekt-Hubs verbinden T3 Code, Code-Server, Preview, Browser, Terminal, Codex, OpenCode, Notizen, Snippets, Dateien und Nutzungsanzeigen visuell.
- Orbit-Zustand wird in einer updatefesten lokalen SQLite-Datei mit vollständiger Revisionshistorie gespeichert und automatisch synchronisiert.
- Jede erfolgreiche Orbit-Revision erhält zusätzlich eine unveränderliche, prüfsummengesicherte JSON-Sicherung außerhalb des Repositorys.
- Fehlende Datenbankstände werden automatisch wiederhergestellt; Konflikte und ungewöhnlich große Löschungen bleiben als getrennte Wiederherstellungsentwürfe erhalten.
- Sidebar-Palette und Slash-Menü erzeugen Knoten per Klick oder Drag-and-drop; Inspector, Szenen und Undo/Redo ermöglichen freie Organisation.
- Native `node-pty`-/xterm.js-Terminals mit Tailscale-Identität, Sitzungswiederaufnahme, Resize, Verlauf und Reconnect.
- Eigenständige Codex- und OpenCode-Seiten mit automatisch gestarteten CLIs, Projektbindung und bis zu vier persistenten Bento-Instanzen je Werkzeug.
- Automatische Erkennung aller direkten, nicht versteckten Verzeichnisse unter `PROJECTS_ROOT`; lokale JSON-Einträge ergänzen Namen, Reihenfolge und Previews.
- code-server bleibt auf `127.0.0.1:8080` und wird samt WebSockets unter `/editor/` am privaten Workbench-HTTPS-Origin bereitgestellt.
- Development-Previews laufen über code-servers `/absproxy/<port>/`; ohne gewählte Preview zeigt die Workbench alle erkannten lokalen HTTP-Ports als Schnellstart an.
- Ein eigener, serverseitig isolierter Chromium-Browser ermöglicht Recherche und lokale Vorschauen direkt in Werkzeugansichten und Orbit-Knoten.
- Besuchte Hauptansichten, Iframes, xterm-Instanzen und WebSockets bleiben während der Browser-Session gemountet und wechseln ohne Neustart.
- Alle Live-Werkzeuge lassen sich frei positionieren und skalieren; stabile Laufzeit-IDs erhalten Terminal- und Agent-Sitzungen über Canvas-Interaktionen hinweg.
- Code-Server ist zusätzlich als eigenständiges Werkzeug in der Sidebar erreichbar; Workbench und Einzelroute teilen dieselbe optimierte Einbettung.
- Codex und OpenCode sind zusätzlich als mehrfach öffnbare Werkzeugtypen in der Workbench verfügbar.
- Preview-Island mit Reload, externem Tab, Vollbild ohne Reload, Schließen, Geräteauswahl und Portrait-/Landscape-Wechsel sowie getrennte Vollseiten für Preview und Browser.
- Lazy geladene Routen, Idle-Prefetch, Brotli/Gzip und langfristig gecachte Build-Assets reduzieren Start- und Wechselzeiten.
- Desktop-Sidebar, echte Breadcrumbs, mobile Gruppenansicht und Statuszeile mit Codex-/OpenCode-Limits.
- SQLite-gestützte Token-, Kosten-, Projekt- und Modellhistorie aus CodexBar mit Diagrammen und Limitprognosen.
- Sichere Codex-/OpenCode-Accountverwaltung mit lokaler Profilerkennung und isolierten CLI-Neuanmeldungen.
- Zod-validierte API, strenge CSP, loopback-only Dienste und Tailscale Serve ohne öffentlichen Funnel.
- Reproduzierbare System- und Benutzer-systemd-Units mit Neustart, Healthchecks und Rollback-Vorbereitung.

## Befehle

- `pnpm dev` – Contracts bauen und Server/Web parallel starten.
- `pnpm typecheck` – strict TypeScript prüfen.
- `pnpm lint` – Repository linten.
- `pnpm test` – Unit-/Integrationstests ausführen.
- `pnpm build` – Contracts, Server und Web produktiv bauen.
- `pnpm test:e2e` – Playwright-API-Abläufe prüfen.
- `pnpm start` – gebauten Produktionsserver auf localhost starten.
- `bash deploy/systemd/install-user-tools.sh` – Workbench, code-server und die konfigurierte Preview ohne Root als dauerhafte User-Dienste starten.

## Dokumentation

- Architektur: `docs/architecture.md`
- Installation: `docs/installation.md`
- Konfiguration: `docs/configuration.md`
- Fehlerbehebung: `docs/troubleshooting.md`
- Einbettungstest: `docs/embedding-test.md`
- Security Audit: `docs/security-audit.md`
- Serveraudit: `docs/server-audit.md`
