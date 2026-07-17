# CodexBar Audit

Auditdatum: 2026-07-12

## Installation

- Vor dem Audit war `codexbar` nicht installiert.
- Installiert wurde die offizielle Linux-x86_64-Release-CLI von CodexBar `v0.42.1` nach SHA-256-Prüfung unter `/home/bbecker/.local/bin/codexbar`.
- `codexbar --version` gibt bei dieser Distribution nur `CodexBar` aus. Die Release-Version stammt daher aus dem verifizierten Release-Artefakt, nicht aus einer geratenen CLI-Ausgabe.

## Unterstützte Schnittstellen

- Strukturierte JSON-Ausgabe: `--format json --pretty`
- Sichtbare Codex-Accounts: `--all-accounts`
- Lokaler Serve-Modus: `codexbar serve --port <port> --refresh-interval <seconds> --request-timeout <seconds>`
- Der Serve-Modus bindet laut eigener Hilfe ausschließlich an `127.0.0.1`.
- Getestete Endpunkte: `GET /health` und `GET /usage?provider=<provider>`.

## Tatsächliche Ergebnisse auf diesem Server

| Provider | Ergebnis | Verwendete Quelle |
| --- | --- | --- |
| Codex | Verfügbar; zwei sichtbare Accounts mit Prozentwerten und Resetzeiten | OAuth |
| OpenCode Go | Verfügbar; lokale Datenquelle, drei Zeitfenster mit Prozentwerten und Resetzeiten | local |
| OpenCode | Nicht nutzbar; der ausgewählte Web-Quellmodus wird unter Linux nicht unterstützt | auto |

`codexbar --provider all --format json --pretty` endet erwartungsgemäß mit einem Fehlercode, weil mehrere nicht konfigurierte Provider abgefragt werden. Die Workbench fragt daher ausschließlich `codex` und `opencodego` ab.

## Sicherheit

- Für den optionalen 5-Stunden-Fallback liest die Workbench Zugangstoken ausschließlich im Arbeitsspeicher aus explizit konfigurierten lokalen Codex-Profilen. Sie werden weder kopiert, protokolliert, gespeichert noch an den Browser ausgegeben. Ohne aktivierten Fallback verarbeitet ausschließlich CodexBar die Authentifizierung.
- Die Workbench erhält ausschließlich normalisierte Nutzungsdaten. Die vollständigen Account-E-Mail-Adressen werden auf Wunsch des Benutzers innerhalb der privaten Workbench angezeigt.
- Der lokale CodexBar-HTTP-Dienst wird weder per Proxy noch öffentlich erreichbar gemacht.

## Mehrere Codex-Accounts unter Linux

- Zusätzliche Codex-Accounts verwenden ein eigenes Codex-Home mit separater `auth.json`.
- Das Home wird als `codexProfileHomePaths` für den Codex-Provider in der privaten CodexBar-Konfiguration unter `~/.config/codexbar/config.json` hinterlegt.
- Die Datei bleibt lokal, hat Berechtigung `0600` und wird nicht in dieses Repository übernommen.
