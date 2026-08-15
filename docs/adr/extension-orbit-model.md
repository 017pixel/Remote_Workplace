# ADR: Extension Orbit Model V1

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

Orbit persistiert revisionierte Dokumente in SQLite. Dokumentversion 8 wird geschrieben, die
Versionen 6 bis 8 bleiben lesbar. Der aktuelle Vertrag enthält 17 geschlossene Knotentypen;
Renderer, Inspector, Palette, Größenlogik und Migration verzweigen direkt auf diese Typen.

Eine direkte Erweiterung dieses Enums pro Feature würde den Kernel erneut zum Feature-Monolithen
machen. Eine destruktive Umschreibung bestehender Dokumente oder historischer Revisionen würde
gleichzeitig Nutzerzustand, Undo/Redo und Backups gefährden.

## Entscheidung

Orbit erhält in Phase 4 additiv genau einen generischen Knotentyp `extension`. Featureidentität
liegt nicht im Typstring, sondern in stabilen Extension- und Contribution-IDs:

```ts
{
  id: "node-id",
  type: "extension",
  extensionId: "workbench.agent-tasks",
  contributionId: "workbench.agent-tasks.orbit.task-board",
  stateVersion: 3,
  state: {},
  title: "Agent Tasks",
  position: { x: 0, y: 0 },
  size: { width: 720, height: 480 },
  parentId: null,
  projectId: null
}
```

Manifest V1 beschreibt Discovery- und Host-Metadaten. Ausführbarer Code bleibt außerhalb des
Manifests:

```json
{
  "contributes": {
    "orbit": [
      {
        "id": "workbench.agent-tasks.orbit.task-board",
        "title": "Agent Tasks",
        "stateVersion": 3,
        "stateSchema": "./schemas/task-board-state.schema.json",
        "defaultSize": { "width": 720, "height": 480 },
        "resizable": true,
        "projectContext": true,
        "inspector": true,
        "connections": "bidirectional",
        "visibleByDefault": true
      }
    ]
  }
}
```

Der UI-Entrypoint registriert Renderer und optionale Inspector-Flächen gegen dieselbe
Contribution-ID. State-Erzeugung, Migrationsketten, Serialize/Deserialize, Toolbar- und
Kontextaktionen sowie Connection-Verhalten werden später über die öffentliche Orbit Runtime
Registry ergänzt. Runtime-Registrierung darf die deklarierte ID oder State-Version nicht
überschreiben.

### State-Vertrag

- `state` ist JSON-kompatibel. Binärdaten und große Dateien liegen im Extension Storage und
  werden nur über stabile Referenzen im Node State gespeichert.
- `stateSchema` zeigt auf ein lokales `.json` im Extension-Paket. Installer und Runtime prüfen
  Paketgrenze, `realpath`, Dateigröße und Draft-2020-12-Syntax. Entfernte `$ref`-Ziele sind in V1
  verboten; lokale Definitionen innerhalb desselben Dokuments bleiben möglich.
- `stateVersion` ist eine positive, monoton steigende Ganzzahl. Eine neue Version darf alten
  State erst nach einer vollständigen, validierten Migrationskette schreiben.
- Default State und jeder Migrationsschritt werden gegen das Schema der Zielversion geprüft.
- Der Host behält Titel, Position, Größe, Parent, Projektbezug und Z-Index getrennt vom
  Extension State. Eine Extension kann diese Hostfelder nicht durch einen State-Payload
  überschreiben.
- Payload- und Dokumentlimits werden vor Persistenz serverseitig geprüft. Der Browser ist nicht
  die autoritative Validierungs- oder Speicherinstanz.

### Migration und Historie

- Historische Revisionen und Backups werden nicht massenhaft umgeschrieben.
- Legacy-Knoten bleiben bis zur jeweiligen Built-in-Migration lesbar. Beim Laden kann der Host
  sie logisch auf Extension-ID und Contribution-ID abbilden; geschrieben wird erst die aktuelle
  Revision nach erfolgreicher Validierung.
- Eine State-Migration ist nummeriert, deterministisch und idempotent. Die Runtime benötigt für
  jede unterstützte Ausgangsversion eine lückenlose Kette.
- Schlägt Schema oder Migration fehl, bleibt der ursprüngliche State unverändert. Die neue
  Extension-Version wird nicht aktiviert; Manager und UI melden `migration-failed` und bieten
  Logs sowie Rollback an.
- Undo/Redo arbeitet weiter mit vollständigen Dokumentrevisionen. Extension-Migrationen dürfen
  keine parallel geöffneten Nutzerrevisionen still überschreiben.

### Fehlende oder deaktivierte Extension

Ein fehlender Renderer löscht niemals einen Node. Der Host zeigt einen eigenen, kernelgehosteten
Placeholder mit Extension-ID, Contribution-ID und erhaltenem Titel:

```text
Extension nicht verfügbar

Agent Tasks
workbench.agent-tasks

Die Daten dieses Elements bleiben erhalten.
```

Der vollständige State einschließlich unbekannter Felder bleibt erhalten. Nach kompatibler
Reinstallation wird derselbe Node wieder aktiviert. Entfernen bleibt eine ausdrückliche
Nutzeraktion. Disable entfernt Renderer, Inspector, Aktionen und Listener, beendet aber keine
tmux-, Preview-, T3-, Chromium-, Hermes- oder andere user-owned Runtime.

### Host-Metadaten

- Default-Größen verwenden dieselben Grenzen wie die aktuelle Orbit-Geometrie: mindestens
  160 x 96 und höchstens 20.000 x 20.000 Pixel.
- `connections` ist `none`, `incoming`, `outgoing` oder `bidirectional`. Die Runtime kann später
  strengere typisierte Ports registrieren, aber keine im Manifest ausgeschlossene Richtung
  erweitern.
- `projectContext`, `inspector`, `resizable` und `visibleByDefault` sind deklarative Fähigkeiten
  beziehungsweise Defaults. Sie sind keine Berechtigungen.
- Icons verwenden denselben kontrollierten lokalen oder namespaced Vertrag wie Navigation.
- `onOrbitNode:<id>` aktiviert nur eine tatsächlich deklarierte Orbit Contribution derselben
  Extension.

## Konsequenzen

- Phase 1 kann Manifest und Runtime-Erwartung stabilisieren, ohne Dokumentversion 8 zu ändern.
- Phase 4 benötigt einen additiven Core-Vertrag, Missing-Extension-Renderer, Legacy-Mapping,
  Revisionstests und kontrollierte Write-Migration.
- Built-in Features verwenden später denselben `extension`-Knotentyp und dieselbe Registry wie
  optionale Catalog Extensions.
- State bleibt wiederherstellbar, auch wenn Code fehlt, deaktiviert ist oder ein Update scheitert.
- Beliebiger Extension-Code erhält durch dieses Modell keine Sandbox und keine zusätzlichen
  Capabilities.

## Verworfene Alternativen

- **Neuer Core-Knotentyp pro Feature:** erhält die geschlossene Kopplung und verhindert echtes
  Dogfooding.
- **Renderername als Knotentyp:** macht umbenennbare Implementierungsdetails zu persistierter
  Identität.
- **State löschen, wenn eine Extension fehlt:** verletzt Datenhaltungs- und Recovery-Ziel.
- **Alle historischen Revisionen sofort umschreiben:** erhöht das Risiko irreversibler
  Datenverluste ohne funktionalen Nutzen.
- **State-Schema über eine Remote-URL laden:** widerspricht dem lokalen V1-Modell und öffnet eine
  unnötige Netzwerk- und Supply-Chain-Fläche.
