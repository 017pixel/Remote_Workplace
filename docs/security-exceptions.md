# Aufgelöste Security-Ausnahmen

Diese Datei ist ein Audit-Archiv. Aktuell ist keine Security-Ausnahme im
automatisierten Gate aktiv.

## GHSA-qwww-vcr4-c8h2 – React Router RSC (aufgelöst)

- Status: behoben
- Verantwortlicher Bereich: Web-Frontend
- Erfasst am: 30. Juli 2026
- Behoben am: 1. August 2026
- Installierte Version: `react-router@8.3.0`

Das [GitHub Security Advisory](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)
beschreibt den verwundbaren Pfad in den instabilen React-Server-Components-APIs.
Wrapt verwendet jetzt die veröffentlichte React-Router-8-SPA-API
direkt und importiert keine RSC-APIs. `pnpm audit --prod --audit-level=high`
meldet damit keine Advisories; das CI-Gate ignoriert keine Advisory-ID mehr.

## Hermes Agent: bewusst dokumentierte Betriebsgrenzen

- Das Dashboard bindet ausschließlich an Loopback. Es gibt keinen Tailscale-Serve- oder Funnel-
  Eintrag für den Hermes-Port; die Wrapt schützt `/hermes` mit Tailscale-Identität und
  Same-Origin-Prüfung.
- Das ephemere Hermes-Session-Token wird aus dem internen Dashboard-HTML gelesen, im Speicher des
  Backendprozesses gehalten und bei 401 genau einmal erneuert. Es wird nicht persistiert, nicht an
  das Frontend gegeben und nicht geloggt.
- Der Hermes-Checkout bleibt außerhalb des Repositories, weil `hermes update` ihn per Git-Pull
  aktualisiert. Das Wrapt-Theme liegt separat unter `HERMES_HOME/dashboard-themes`.
- `sudo` wird trotz vorhandener Systemberechtigung nicht verwendet. Dashboard, Gateway und Update
  sind User-Units; Dienstnamen kommen aus einer festen serverseitig validierten Zuordnung.
- Bei der Integration wurden die zuvor dauerhaft freigegebenen Muster für rekursives Löschen,
  Root-Löschen, privilegiertes `sudo`, Skriptausführung per `-c`/`-e` und Überschreiben von
  Projekt-Config entfernt. Ziel ist `approvals.mode: ask`, `cron_mode: deny` und keine globale
  `Immer erlauben`-Aktion in der Wrapt-UI. Ein Installationslauf mit `--keep-allowlist` ist
  ausdrücklich sichtbar und bleibt eine dokumentierte Ausnahme.
