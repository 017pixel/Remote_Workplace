# ADR: Server Authority für Extension State

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

Remote Workplace ist ein persönlicher, selbst gehosteter Server mit Tailscale-Identity und
mehreren Browsergeräten. Heute liegen einige Präferenzen und Drafts im Browser, während Orbit,
Notifications, Usage, Preview- und Terminalmetadaten serverseitig persistiert werden. Für eine
Extension-Plattform wären browserlokale Installations- oder Berechtigungsflags inkonsistent,
nicht auditierbar und auf einem zweiten Gerät falsch.

## Entscheidung

Der Remote-Workplace-Server ist die einzige autoritative Quelle für Extension-Code, Installation,
Aktivierung, Berechtigungen, Einstellungen, Health, Jobs, Logs, Updates, Catalog Status und
serverweite Contributions. Der Browser ist Client und darf diese Zustände nur abfragen,
darstellen und über geschützte APIs verändern.

### State Scopes

| Scope | Beispiele | Autoritative Ablage |
| --- | --- | --- |
| serverweit | installiert, Version, enabled, privilegierte Grants, Jobs, Services, Code | Server Registry und Extension-Verzeichnisse |
| benutzerbezogen | Sidebar-Reihenfolge, Sichtbarkeit, Pins, Dashboard Layout, Favoriten, UI Preferences | serverseitig unter normalisierter Workbench Identity |
| gerätebezogen | PWA-Installation, Push Subscription, OS Reduced Motion, lokale Fenstergröße | Browser/OS beziehungsweise identitätsgebundene Device Registry |
| ephemer | offener Dialog, Hover, ungesendeter kurzer Formzustand | React State oder Session Cache |

Ein Zustand wird nicht gerätebezogen, nur weil er heute in `localStorage` liegt. Bestehende
Sidebar-, Dashboard- und ähnliche Präferenzen werden versioniert importiert und anschließend
serverseitig synchronisiert. Alte Keys bleiben während einer definierten Dual-Read-Periode als
Fallback unangetastet.

### Identität und Mehrgerätezugriff

- Benutzerzustand wird über die vorhandene normalisierte Workbench-/Tailscale-Identity
  adressiert, nicht über einen fest codierten Besitzer.
- Serverweite Änderungen gelten für alle erlaubten Benutzer und verlangen die passende
  administrative Capability.
- Benutzerpräferenzen dürfen nur für die aktuelle Request Identity gelesen oder verändert
  werden.
- Gleichzeitige Änderungen verwenden Revisionen oder einen äquivalenten Conditional-Write-
  Vertrag. Kein Browser überschreibt still einen neueren Zustand eines anderen Geräts.

### API- und Security-Vertrag

- Management APIs liegen unter `/api/v1/extensions`.
- Extension-eigene APIs liegen ausschließlich namespaced unter
  `/api/v1/extensions/<extension-id>/...` oder verwenden typed RPC.
- Keine Extension registriert oder überschreibt globale Core-Routen.
- Mutationen verwenden dieselben zentralen Identity-, Mutation-Origin-, Rate-Limit- und
  Audit-Regeln wie andere Workbench-Mutationen.
- Permission Grants können nur über autorisierte Nutzeraktionen gesetzt werden. Agent Tools
  dürfen Requests erzeugen, aber niemals Grants schreiben oder Full Trust aktivieren.

### Management API Contract V1

Die kanonischen Request- und Response-Schemas liegen in
`packages/extension-contracts/src/management.ts`. Der spätere Server stellt darunter mindestens
folgende Ressourcen bereit:

- `GET /api/v1/extensions` liefert einen revisionierten Registry Snapshot,
- `GET /api/v1/extensions/catalog` liefert den lokalen Catalog Snapshot,
- `GET /api/v1/extensions/<extension-id>` liefert Manifest, Grants, Health und letzte Operation,
- `POST /api/v1/extensions/operations` nimmt genau eine typisierte Manager-Operation an,
- `GET /api/v1/extensions/operations/<operation-id>` liefert ihren autoritativen Fortschritt.

Die Mutations-Union umfasst Install, Enable, Disable, Update, Uninstall, Rollback, Developer
Reload und Permission Review. Jeder Request enthält Extension-ID und erwartete Registry-Revision.
Ein veralteter Browser erhält einen Konflikt und lädt den Serverzustand neu; er darf weder einen
Lifecycle-String noch `enabled`, Trust, Health oder eine aktive Version direkt schreiben. Eine
Annahme bedeutet nur `queued` oder `running`, nicht Erfolg. Abschluss und neue Revision kommen
aus Manager und Registry.

Catalog-Ziele werden mit Provider, Catalog-Revision, Version und Paket-Hash adressiert. Ein
lokales Paket verwendet ausschließlich einen kurzlebigen serverseitigen Upload-Beleg, ein
Entwicklerverzeichnis ausschließlich eine vorher registrierte ID. Hostpfade, URLs, Git-, GitHub-
und npm-Quellen sind im Browservertrag nicht darstellbar. Uninstall verlangt immer die explizite
Entscheidung `retain` oder `delete`; Datenlöschung ist nie ein stiller Default.

Registry Summaries nennen getrennt Lifecycle, gewünschtes Enablement, Runtime-Aktivität,
installierte, aktive, verfügbare und rollback-fähige Version sowie die aktuell erlaubten
Operationen. Details ergänzen Manifest, Grants, Health und redigierte Operationsfehler. Grants
müssen eine Teilmenge der Manifest Requests bleiben. Öffentliche Fehler enthalten keinen freien
Text, Stack, Pfad oder Secret, sondern nur einen geschlossenen Code, Zeitpunkt und optional eine
opaque Referenz für serverseitige Diagnose.

### Browser Cache und Offline-Verhalten

Der Browser darf serverseitige Metadaten mit Version und Revision cachen. Bei Reconnect wird der
Serverzustand neu geladen. Offline oder bei unbekannter Revision darf der Browser:

- zuletzt bekannte Informationen read-only anzeigen,
- ephemere UI-Einstellungen vormerken,
- keine Installation, Aktivierung, Permission-Änderung oder Migration als erfolgreich melden.

Eine UI Contribution wird erst aktiv, wenn die Server Registry dieselbe Extensionversion und
denselben Asset Hash bestätigt. Dadurch können Service Worker oder Browsercache nicht still UI
1.1 mit Servercode 1.2 kombinieren.

### Persistenztrennung

Die bestehende Workbench-SQLite darf zentrale Registry-Metadaten enthalten:

- installierte Version und Status
- Source, Integrity und Compatibility
- Permission Grants und Settings-Metadaten
- Aktivierungs-, Crash- und Health-Zustand
- Jobdefinitionen und Run History
- benutzerbezogene Contribution Preferences

Extension-Fachdaten liegen nicht in dieser Datenbank. Sie werden vom Storage Manager in einer
eigenen SQLite-Datei und einem eigenen Dateibaum je Extension provisioniert. Secrets liegen in
einem getrennten Secret Store und niemals in normalem Settings JSON.

## Konsequenzen

- Installations- und Permission-Zustände sind geräteübergreifend konsistent und auditierbar.
- Die Frontend-Registry konsumiert Server-Metadaten und ist nicht selbst Installationsregistry.
- Bestehende Browserpräferenzen benötigen versionierte Import- und Konflikttests.
- API-Ausfälle benötigen explizite Loading-, Stale-, Offline- und Reconnect-Zustände.

## Verworfene Alternativen

### `localStorage` als Extension Registry

Verworfen wegen Mehrgeräteinkonsistenz, fehlendem Audit und fehlender Kontrolle über Servercode.

### Browser installiert lokale Packages direkt

Verworfen, weil der Browser weder das Serverdateisystem noch atomare Migrationen und Runtime-
Aktivierung kontrollieren darf.

### Alle Präferenzen bleiben gerätebezogen

Verworfen, weil Sidebar, Dashboard und Extension Preferences erwartbar dem Benutzer folgen.

## Verifikation

- Zwei-Client-Tests prüfen Revisionen, Konflikte und serverseitige Synchronisierung.
- API-Tests prüfen Identity, Same-Origin, Audit und Agenten-Grant-Verbot.
- PWA-Tests prüfen Asset-Hash-Mismatch und Cache Invalidierung.
- Migrationstests prüfen Dual Read und erhaltene Preferences fehlender Extensions.

## Folgeentscheidungen

- `extension-storage.md`
- `extension-permission-model.md`
- `extension-runtime-v1.md`
- `extension-ui.md`
