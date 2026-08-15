# ADR: Extension Runtime und Lifecycle V1

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

Installation, Aktivierung, Updates, Migrationen und Recovery laufen künftig über einen
serverseitigen Extension Manager. Ohne einen gemeinsamen Lifecycle würden Server, UI, CLI und
Recovery dieselbe Extension unterschiedlich beurteilen. Ein einzelner Status darf aber auch
nicht Fakten vermischen: Eine aktive Version kann weiterlaufen, während ein lokales Update
bereitliegt oder auf neue Permissions wartet.

## Entscheidung

Der Server führt für jede Extension eine autoritative primäre Lifecycle-Phase. Der öffentliche
V1-Vertrag enthält:

```text
available
staging
installing
permissions-pending
installed
disabled
enabling
activating
active
deactivating
crashed
quarantined
incompatible
update-available
updating
migration-failed
uninstalling
```

Der Contract exportiert die geschlossene Zustandsliste, alle zulässigen direkten Übergänge,
ein validierbares Transition-Objekt und die Menge transienter Operationszustände. Unbekannte
Zustände, Selbstübergänge und nicht freigegebene Abkürzungen werden fail-closed abgewiesen.

### Registry-Fakten bleiben getrennt

Die primäre Phase ist die wichtigste aktuelle Nutzer- und Recovery-Information. Sie ersetzt
nicht die übrigen Registry-Fakten. Der Manager speichert später getrennt mindestens:

- installierte und aktive Version,
- gewünschtes `enabled`,
- tatsächlich aktivierte Runtime,
- verfügbare lokale Catalog-Version,
- laufende Operation und ihr Recovery Journal,
- letzte erfolgreiche Phase und letzten redigierten Fehler.

Damit kann `update-available` oder `permissions-pending` sichtbar sein, während die atomar
beibehaltene alte Version weiterläuft. UI und API dürfen aus der primären Phase allein weder
laufende Prozesse beenden noch eine Version als aktiv behaupten.

Der öffentliche Management-Vertrag bildet diese Trennung als Registry Summary und Detail ab.
Zusätzlich liefert der Server pro Extension eine geschlossene Liste aktuell erlaubter Operationen.
Clients leiten Aktionen nicht selbst aus einzelnen Statusfeldern ab. Mutationen tragen eine
erwartete Registry-Revision und erzeugen eine eigene Operation mit ID, Typ, Status und redigiertem
Fehler. Damit bleiben konkurrierende Browser, Restart-Recovery und Lifecycle-Journal klar
voneinander unterscheidbar.

### Hauptpfade

```text
Install:
available -> staging -> installing -> installed

Enable:
installed|disabled -> enabling -> activating -> active

Disable:
active -> deactivating -> disabled

Update:
active|disabled|installed -> update-available -> staging -> updating
updating -> activating|disabled|installed

Uninstall:
installed|disabled -> uninstalling -> available
```

Ein Permission Diff kann nach `staging` zu `permissions-pending` wechseln und nach Zustimmung
in `installing` oder `updating` fortfahren. Bei Ablehnung stellt der Manager anhand des Journals
die vorherige stabile Phase wieder her. Für Required System Extensions blockiert die Host Policy
Disable und Uninstall, bevor ein Lifecycle-Übergang beginnt.

### Fehler und Recovery

- Ein Fehler oder Timeout während Activation führt zu `crashed`.
- Ein erneuter Start ist nur über einen erlaubten Übergang zu `activating` möglich.
- Wiederholte Startfehler innerhalb des später festgelegten Fensters führen zu `quarantined`.
- `quarantined` wechselt nicht direkt zu `active`. Nutzer oder Recovery deaktivieren die
  Extension, stellen ein geprüftes Update bereit oder rollen zuerst kontrolliert zurück.
- Eine fehlgeschlagene Datenmigration führt zu `migration-failed`. Die vorherige Version und ihr
  Backup bleiben aktivierbar; der neue `current`-Zeiger wird nicht veröffentlicht.
- `incompatible` verhindert Activation, bis Workbench-, API-, Dependency- oder Conflict-Prüfung
  wieder eine zulässige stabile Phase ergibt.

Die transienten Zustände `staging`, `installing`, `enabling`, `activating`, `deactivating`,
`updating` und `uninstalling` benötigen ein persistiertes Operationsjournal. Findet der Manager
sie nach einem Neustart, setzt er nicht blind fort, sondern prüft Staging, Pointer, Backup,
Runtime und Health und stellt danach eine erlaubte Phase wieder her.

### Autorität und Nebenwirkungen

- Nur der Manager verändert Lifecycle-State, serialisiert durch einen Lock je Extension ID.
- HTTP, CLI, Agent Tools und UI fordern eine Operation an. Sie setzen niemals direkt einen State.
- Alle Aufrufer verwenden dieselbe diskriminierte Operations-Union aus dem öffentlichen
  Contract; spezielle Browser- oder Agenten-Abkürzungen existieren nicht.
- Jeder Übergang erhält Audit, Zeitstempel und eine redigierte Fehlerreferenz.
- Contributions werden bei Disable unabhängig von fehlerhaftem Extension Cleanup hostseitig
  entfernt.
- Disable oder Quarantäne beendet keine user-owned tmux-, T3-, Preview-, Chromium- oder Hermes-
  Runtime und löscht keine Extension-Daten.
- Safe Mode aktiviert nur Kernel, Manager, Recovery und erforderliche System Extensions.

## Konsequenzen

- Server, UI, CLI und Recovery können denselben stabilen Vertrag verwenden.
- Atomare Updates bleiben von der sichtbaren Runtime und der gewünschten Enablement-Policy
  unterscheidbar.
- Der Manager benötigt ein transaktionales Operationsjournal und eine zentrale
  Übergangsfunktion statt verteilter Statuswrites.
- Health, Crash-Zähler, Rollback und konkrete Registry-Records folgen in späteren Phasen auf
  dieser Vertragsgrundlage.

## Verworfene Alternativen

### Nur `enabled` und `installed` als Booleans

Verworfen, weil Installation, Permission Review, Migration, Crash, Quarantäne und Recovery nicht
eindeutig oder atomar darstellbar wären.

### Lifecycle-State als einzige Registry-Wahrheit

Verworfen, weil `update-available` und `permissions-pending` sonst eine weiterlaufende alte
Version oder das gewünschte Enablement verdecken würden.

### Freie Statusstrings pro Runtime

Verworfen, weil UI, API, CLI und Recovery unbekannte Zustände unterschiedlich behandeln würden.

## Verifikation

- Contract-Tests prüfen die vollständige Zustandsmenge und eine Übergangsliste für jeden State.
- Pfadtests prüfen Install, Permission Review, Enable, Disable, Update und Uninstall.
- Negative Tests blockieren direkte Aktivierung, direkte Deinstallation aktiver Extensions,
  Selbstübergänge und einen direkten Neustart aus Quarantäne.
- Manager-Integrationstests prüfen später Locks, Restart-Recovery, Crash Loop und Rollback.

## Folgeentscheidungen

- `extension-storage.md`
- `extension-ui.md`
- `builtin-extension-migration.md`
