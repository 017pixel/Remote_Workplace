# CLAUDE.md — Anleitung für Claude Code

**Die vollständige Projekt- und Agenten-Anleitung steht in [`AGENTS.md`](./AGENTS.md).**
Lies sie zuerst — sie enthält Projektüberblick, Befehle, Konventionen und den Neustart-Workflow.
Diese Datei ergänzt nur Claude-spezifische Hinweise.

## Schnellreferenz

- **Projekt:** Selbst gehostete Remote-Development-Wrapt (pnpm-Monorepo, Node ≥ 22, TypeScript).
  Server `@wrapt/server` auf `127.0.0.1:3010`, Web `@wrapt/web`, Verträge `@wrapt/contracts`.
- **Sprache:** Deutsch (Commits, Kommentare, UI-Texte).
- **Vor Abschluss:** `pnpm typecheck` (nach Schema-Änderungen `pnpm --filter @wrapt/contracts build` zuerst).

## Projekt neu starten

Nach Code-Änderungen die laufende Wrapt neu bauen/starten — Details und Hintergründe in `AGENTS.md`:

```bash
bash scripts/restart-frontend.sh   # nur Frontend neu bauen (danach Seite neu laden)
bash scripts/restart-backend.sh    # Backend neu bauen + Dienst neu starten
bash scripts/restart-all.sh        # beides
```

Oder über die API (das nutzt auch der Button unter **Einstellungen → „Dienst neu starten"**):

```bash
curl -s -X POST http://127.0.0.1:3010/api/v1/system/restart \
  -H "Content-Type: application/json" -d '{"target":"both"}'   # frontend | backend | both
```

Fertig-Erkennung über `GET /api/v1/health`: `bootId` wechselt bei Backend-Neustart,
`webBuildId` bei Frontend-Rebuild. Der Dienst läuft root-frei als User-Unit `wrapt.service`
(`systemctl --user`, kein `sudo`). Workspace-, Orbit- und Galerie-Daten bleiben bei Neustarts erhalten.
