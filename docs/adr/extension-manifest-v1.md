# ADR: Extension Manifest V1 und Versionierung

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

Extension Packages benötigen einen maschinenlesbaren Vertrag für Compatibility, Entrypoints,
Permissions, Activation, Dependencies und Contributions. Remote Workplace verwendet bereits
Zod 4 als geteilte Vertragsgrundlage. Zod 4 kann JSON Schema direkt erzeugen. Eine zweite
handgeschriebene Manifestdefinition würde CLI, Server, SDK und Dokumentation auseinanderlaufen
lassen.

Remote-Workplace-Releases, Extension API und Manifestformat ändern sich außerdem mit
unterschiedlicher Geschwindigkeit und dürfen nicht dieselbe Versionsnummer teilen.

## Entscheidung

Jedes Paket enthält an seiner Wurzel genau eine `extension.json`. Manifest V1 wird als striktes
Zod-Schema im neuen Package `@workbench/extension-contracts` definiert.

Aus dieser kanonischen Quelle entstehen:

- TypeScript Types über `z.infer`,
- ein versioniertes JSON Schema über Zod 4 `toJSONSchema`,
- Server-, CLI- und Testvalidierung durch Import desselben Schemas,
- dokumentierte Feldtabellen aus Schema-Metadaten und JSON Schema.

Generierte Artefakte werden im Build reproduzierbar erzeugt und in einem Contract-Test gegen
Drift geprüft. Es wird kein separates manuell gepflegtes JSON-Schema als zweite Wahrheit geben.

### Getrennte Versionen

| Version | V1-Darstellung | Bedeutung |
| --- | --- | --- |
| Remote Workplace | SemVer, aktuell `0.44.0` | Produktrelease und gebundelter Catalog |
| Extension API | Major `1`, intern kompatibel als `1.0.0` | öffentlicher SDK-/Runtime-Vertrag |
| Manifest | Integer `1` | Syntax und Semantik von `extension.json` |

`engines.remoteWorkplace` ist ein SemVer Range. `engines.extensionApi` akzeptiert den Range
`^1` und wird intern gegen die Extension-API-SemVer geprüft. Ein normales Workbench-Release darf
Extension API 1 nicht brechen. Eine unbekannte Manifestversion wird fail-closed abgelehnt.

### Pflichtfelder

```json
{
  "$schema": "./extension-manifest-v1.schema.json",
  "manifestVersion": 1,
  "id": "workbench.agent-tasks",
  "name": "Agent Tasks",
  "version": "1.0.0",
  "publisher": "remote-workplace",
  "description": "Aufgaben und Agent Runs verwalten",
  "license": "MIT",
  "engines": {
    "remoteWorkplace": ">=0.50.0",
    "extensionApi": "^1"
  },
  "trust": "catalog-first-party",
  "entrypoints": {
    "server": "./dist/server.js"
  },
  "permissions": [],
  "activationEvents": [],
  "contributes": {}
}
```

V1 unterstützt zusätzlich Kategorie, Keywords, lokale Icon-/README-/Changelog-Pfade,
Data-Schema-Version, Dependencies, Optional Dependencies und Conflicts.

Das Grundschema hält `activationEvents` und `contributes` bis zu ihren jeweiligen
Phase-1-Subgoals bewusst leer. `permissions` akzeptiert inzwischen ausschließlich strukturierte
V1-Requests. Dadurch werden noch nicht spezifizierte Inhalte nicht als untypisierte
Übergangsdaten akzeptiert. Die übrigen Bereiche werden innerhalb Manifest V1 additiv erweitert.
`$schema` dient ausschließlich Editoren; Server und Installer laden darüber keine entfernten
Verträge nach.

### IDs

- Extension IDs bestehen aus mindestens zwei punktgetrennten, kleingeschriebenen Segmenten.
- Segmente verwenden ASCII-Buchstaben, Ziffern und Bindestriche, beginnen und enden
  alphanumerisch und sind nicht lokalisierbar.
- Öffentliche Contribution IDs sind vollständig namespaced und beginnen mit der Extension ID,
  zum Beispiel `workbench.terminal.command.new`.
- Labels, Pfade, Titel und Icons sind keine Identität und dürfen sich ändern.
- Persistenz und Events verwenden ausschließlich stabile IDs.

Die konkreten Längenlimits und regulären Ausdrücke werden in Phase 1 als exportierte Constants
einmalig definiert und durch Schema- sowie Fixture-Tests belegt.

### Lokale Assets und Entrypoints

- `entrypoints.ui` und `entrypoints.server` sind optionale relative Paketpfade mit führendem `./`.
- Eine rein deklarative Extension darf ohne JavaScript-Entrypoint Contributions liefern.
- Absolute Pfade, `..`, Symlink Escapes und Pfade außerhalb des Pakets sind unzulässig.
- Das Manifest prüft die lexikalische Pfadform. Der spätere Installer prüft zusätzlich
  `realpath`, Symlinks und Paketgrenzen im Staging-Verzeichnis.
- Manifest V1 akzeptiert Icons zunächst nur als lokales PNG, WebP oder JPEG. SVG und HTML sind
  bis zu einem eigenen Sanitizing- und Rendering-Vertrag nicht erlaubt.
- README und Changelog sind lokale, größenbegrenzte Markdown-Dateien.
- Normale Extensions dürfen kein beliebiges globales CSS oder HTML als Icon injizieren.
- Mindestens eine Contribution oder ein gültiger Entrypoint muss vorhanden sein.

### Permissions und Trust

Permissions sind strukturierte Requests mit stabiler Permission ID und optionalem Scope. Das
Manifest fordert Rechte an; Grants liegen ausschließlich serverseitig. Ein Update vergleicht
normalisierte Permission Requests semantisch. Der genaue V1-Katalog, die Scope-Typen und die
Grenze zwischen Request, Grant und Trust stehen in
[`extension-permission-model.md`](extension-permission-model.md).

`trust` beschreibt den erwarteten Runtime-Typ, ist aber kein Grant. Der Extension Manager leitet
den effektiven Trust aus Source, Paketprovenance und Host Policy ab. Ein Manifest kann sich nicht
selbst von `developer` oder `sandboxed-webview` zu `system` hochstufen.

### Activation Events

V1 kennt typisierte Activation Events:

```text
onStartup
onCommand:<contribution-id>
onRoute:<contribution-id>
onProject
onGitRepository
onOrbitNode:<contribution-id>
onAgent
onEvent:<event-id>
onSchedule:<job-id>
```

Referenzierte Contribution IDs müssen zur Extension gehören. Das Activation-Grundschema prüft
diese Namespace-Grenze bereits. Sobald die jeweiligen Contribution-Schemas geöffnet sind, wird
zusätzlich ihre Existenz und passende Art geprüft. `onEvent` darf stabile Core-Events oder Events
anderer Extensions referenzieren. Doppelte Einträge werden abgewiesen; der spätere Manager
normalisiert und sortiert sie deterministisch für Vergleich und Persistenz.

### Contributions

`contributes` besitzt in V1 bekannte, strikt validierte Bereiche für:

```text
pages, routes, navigation, mobileNavigation, orbit, dashboard, settings,
commands, keyboardShortcuts, contextMenus, topbar, statusbar, files,
terminal, previews, browser, agentTools, agentSkills, backgroundServices,
scheduledJobs, rpc, realtime, notifications, themes
```

Die einzelnen Contribution-Schemas werden in Phase 1 additiv eingeführt. Unbekannte Bereiche
oder doppelte IDs sind Validierungsfehler statt still ignorierter Tippfehler.

#### Command Contributions

Commands bilden die erste geöffnete Contribution Surface. Ein Manifest beschreibt nur stabile
Identität und Anzeigemetadaten:

```json
{
  "contributes": {
    "commands": [
      {
        "id": "workbench.agent-tasks.command.create",
        "title": "Agent Tasks: Aufgabe erstellen",
        "description": "Erstellt eine neue Aufgabe im aktuellen Projekt.",
        "category": "Agent Tasks"
      }
    ]
  }
}
```

- Command IDs gehören zum Namespace der deklarierenden Extension und sind im Manifest eindeutig.
- Ein vorhandener Commands-Bereich enthält mindestens einen und höchstens 256 Commands.
- `onCommand:<id>` muss auf einen tatsächlich deklarierten Command derselben Extension zeigen.
- Command Contributions benötigen einen UI- oder Server-Entrypoint, der den Handler später über
  die öffentliche Runtime Registry registriert.
- `execute`-Code, Shell-Befehle, Secrets und beliebige Payloads gehören nicht ins Manifest.
- Conditions, Disabled Reason, Shortcuts und Menüs werden über eigene typisierte Contracts
  additiv ergänzt und referenzieren dieselbe Command ID.

Die heutige Dashboard Command Reference mit kopierbaren Serverbefehlen ist kein Ersatz für diese
Registry und wird erst in einer späteren Featuremigration adaptiert.

### Dependencies und Conflicts

Pflicht- und optionale Abhängigkeiten verwenden Maps. Konflikte sind eine Liste, damit eine
Versionsspanne ausgelassen und eine Extension trotzdem explizit als generell inkompatibel
markiert werden kann:

```json
{
  "extensionDependencies": {
    "workbench.projects": "^1.0.0"
  },
  "optionalExtensionDependencies": {
    "workbench.git": ">=1.0.0 <2.0.0"
  },
  "extensionConflicts": [
    {
      "id": "workbench.legacy-agent-tasks",
      "range": "<2.0.0"
    },
    {
      "id": "workbench.agent-board"
    }
  ]
}
```

- Jede Map und die Konfliktliste sind auf 64 Einträge begrenzt.
- IDs und Ranges verwenden dieselben kanonischen Verträge wie das übrige Manifest.
- Eine fehlende Conflict Range bedeutet einen Konflikt mit jeder installierten Version.
- Selbstabhängigkeiten, Selbstkonflikte, doppelte Konflikte und Überschneidungen zwischen
  Pflicht-, optionalen und inkompatiblen Extensions werden bereits im Manifest abgewiesen.
- Der Manager prüft später fehlende oder inkompatible Abhängigkeiten, transitive Zyklen und
  Konflikte gegen den installierten Graphen vor Aktivierung.
- Der Manager sortiert Knoten und Kanten für Auflösung, Persistenz und Fehlermeldungen nach
  stabilen Extension IDs. Die Reihenfolge von JSON-Objektschlüsseln besitzt keine Semantik.

## Konsequenzen

- Server, UI, SDK, CLI und Tests sprechen denselben Manifestvertrag.
- Schemaänderungen innerhalb Manifest V1 müssen rückwärtskompatibel und optional sein.
- Ein Breaking Manifestformat benötigt `manifestVersion: 2` und einen eigenen Migrationspfad.
- Ein Breaking Runtimevertrag benötigt Extension API 2, nicht zwingend Manifest 2.
- Die spätere CLI kann Fehler mit exakten Feldpfaden und Codes ausgeben.

## Verworfene Alternativen

### TypeScript Interface als einzige Quelle

Verworfen, weil zur Laufzeit keine Validierung und kein belastbares JSON Schema entsteht.

### Handgeschriebenes JSON Schema plus separates Zod-Schema

Verworfen wegen unvermeidbarer Drift und doppelten Änderungen.

### Workbench-Version als Extension API Version

Verworfen, weil jedes Produktrelease unnötig Extensionkompatibilität signalisieren würde.

### Labels oder Routen als Contribution IDs

Verworfen, weil Umbenennung und Route Aliases persistierte Daten brechen würden.

## Verifikation

- Golden Tests validieren minimale und vollständige V1-Manifeste.
- Broken Fixtures prüfen unbekannte Version, unbekannte Felder, Pfadescape, doppelte IDs,
  Dependency Cycle und inkompatible Engines.
- Snapshot-/Drift-Test prüft das generierte JSON Schema.
- Compatibility Tests trennen Remote-Workplace-, Extension-API- und Manifestversion.

## Folgeentscheidungen

- `extension-runtime-v1.md`
- `extension-permission-model.md`
- `extension-storage.md`
- `extension-agent-skills.md`
