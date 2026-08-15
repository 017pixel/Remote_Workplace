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
- Contribution State-Schemas sind lokale JSON-Dateien; Remote-Schema-URLs werden nicht geladen.
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
pages, routes, navigation, orbit, dashboard, settings,
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

#### Page und Route Contributions

Pages beschreiben renderbare UI-Flächen. Routes stellen eine Page unter einer oder mehreren
lokalen Workbench-URLs bereit:

```json
{
  "contributes": {
    "pages": [
      {
        "id": "workbench.agent-tasks.page.main",
        "title": "Agent Tasks"
      }
    ],
    "routes": [
      {
        "id": "workbench.agent-tasks.route.main",
        "pageId": "workbench.agent-tasks.page.main",
        "path": "/agent-tasks",
        "aliases": ["/tasks"],
        "shell": "standard",
        "persistent": true,
        "prefetch": "idle",
        "projectContext": true,
        "topbar": true,
        "breadcrumbs": true,
        "standaloneActions": false,
        "mobileNavigation": true
      }
    ]
  }
}
```

- Page- und Route-IDs gehören zum Extension-Namespace und sind manifestweit eindeutig.
- Jede Route referenziert eine deklarierte Page derselben Extension. Pages benötigen einen
  UI-Entrypoint, der ihren Renderer später über die öffentliche Registry bereitstellt.
- Pfade sind absolute lokale URLs ohne Query, Fragment, Encoding, Wildcard oder Traversal.
  Statische Segmente sind kleingeschrieben; dynamische Segmente sind benannte Pflichtparameter.
- Optionale Parameter werden als eigener Alias modelliert. So bleiben Matcher und Bookmarks
  eindeutig, etwa `/orbit` als Alias zu `/orbit/:boardId`.
- Parameternamen besitzen für Kollisionen keine Semantik. `/projects/:id` kollidiert deshalb mit
  `/projects/:projectId`. Das Manifest prüft eigene Routes und Aliases; der Manager prüft später
  Kollisionen über alle installierten Extensions und reservierte Hostpfade.
- `onRoute:<id>` muss eine tatsächlich deklarierte Route derselben Extension referenzieren.
- Ohne explizite Werte gelten `standard`, nicht persistent, kein Prefetch, kein Project Context,
  Topbar und Breadcrumbs sichtbar sowie keine Standalone Actions oder Mobile Navigation.
- Ein lokaler, kontrollierter Icon-Vertrag folgt separat. Beliebige SVG-, HTML- oder Remote-Icon-
  Quellen werden nicht vorzeitig in Route-Metadaten geöffnet.

Der spätere Route Host erhält persistente Pages beim Routenwechsel gemountet. Disable entfernt
Renderer und UI-Ressourcen kontrolliert, beendet aber keine user-owned Runtime.

#### Navigation Contributions

Eine Navigation Contribution bindet eine deklarierte Route an die gemeinsame Desktop- und
Mobile-Navigation. Sie enthält nur sichere Metadaten und keine React-Komponente:

```json
{
  "contributes": {
    "navigation": [
      {
        "id": "workbench.agent-tasks.navigation.main",
        "routeId": "workbench.agent-tasks.route.main",
        "label": "Agent Tasks",
        "description": "Aufgaben und Agent Runs verwalten.",
        "icon": "workbench.agent-tasks.icon.main",
        "group": "tools",
        "order": 120,
        "badgeProvider": "workbench.agent-tasks.badge.open-tasks",
        "visibleByDefault": true
      }
    ]
  }
}
```

- Navigation IDs sind im Manifest eindeutig und gehören zum Namespace der Extension.
- `routeId` referenziert eine tatsächlich deklarierte Route derselben Extension. Pfade werden
  nicht erneut in Navigationseinträgen gespeichert.
- V1 kennt die stabilen Default-Gruppen `workspace`, `tools`, `extensions`, `account` und
  `system`. Serverseitige Benutzerpräferenzen dürfen Gruppe und Reihenfolge später überschreiben,
  ohne das Manifest oder die Contribution-ID zu verändern.
- `order` liegt zwischen 0 und 10.000. Gleiche Werte werden später deterministisch nach stabiler
  Navigation-ID sortiert.
- `visibleByDefault` ist nur der Initialwert. Installation, Enablement und benutzerbezogene
  Sichtbarkeit bleiben serverseitige Fakten. Recovery und Extension Manager dürfen durch Host
  Policy nicht ausgeblendet werden.
- Mobile verwendet dieselbe Navigation Contribution. Ob ein Ziel mobil erscheint, entscheidet
  `route.mobileNavigation`; eine zweite Path-to-Route-Map oder eigene Manifestliste existiert
  nicht.
- `icon: "extension"` verwendet das lokale, nicht ausführbare Manifest-Icon. Alternativ darf
  eine namespaced Icon-ID angegeben werden, die der UI-Entrypoint später über eine kontrollierte
  Registry auflöst. Fehlt die Registrierung, rendert der Host ein generisches Icon statt HTML,
  Remote-Assets oder beliebiges SVG zu übernehmen.
- `badgeProvider` ist eine namespaced Runtime-Referenz. Die Runtime muss Registrierung,
  Fehlerisolation, Timeout und Cleanup prüfen; ausführbarer Provider-Code steht nicht im
  Manifest.

Die heutigen 18 geschlossenen `PageRouteId`-Werte und die duplizierten Pfadzuordnungen werden
erst in Phase 2 und 3 über Legacy Built-in Contributions adaptiert. Dieser Contract ändert noch
keine Sidebar-Präferenz und keine bestehende Mobile-Navigation.

#### Orbit Contributions

Orbit Contributions beschreiben einen versionierten, persistenten Node-Typ, ohne Renderer oder
Migrationscode in das Manifest zu legen:

```json
{
  "contributes": {
    "orbit": [
      {
        "id": "workbench.agent-tasks.orbit.task-board",
        "title": "Agent Tasks",
        "description": "Aufgaben eines Projekts im Orbit verwalten.",
        "category": "Productivity",
        "icon": "workbench.agent-tasks.icon.task-board",
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

- Orbit IDs sind manifestweit eindeutig und gehören zum Namespace der Extension.
- `stateSchema` ist ein lokales JSON-Dokument im Paket. Installer und Runtime prüfen später
  Paketgrenze, JSON-Schema-Syntax, Größe und verbotene Remote-Referenzen.
- `stateVersion` liegt zwischen 1 und 1.000.000. Erhöhungen benötigen vor Aktivierung eine
  lückenlose, validierte Runtime-Migrationskette.
- Default-Größen entsprechen den bestehenden Hostgrenzen von 160 x 96 bis 20.000 x 20.000
  Pixeln. Gespeicherte individuelle Größen werden dadurch nicht verändert.
- Ohne explizite Werte sind Nodes veränderbar, ohne Projektkontext und Inspector, in beide
  Richtungen verbindbar und in der Palette sichtbar.
- Connection-Modi sind `none`, `incoming`, `outgoing` und `bidirectional`.
- Orbit Contributions benötigen einen UI-Entrypoint. Dieser registriert Renderer und den
  optional angekündigten Inspector über dieselbe öffentliche Runtime Registry.
- `onOrbitNode:<id>` muss auf eine tatsächlich deklarierte Orbit Contribution derselben
  Extension zeigen.
- Icons verwenden den kontrollierten lokalen oder namespaced Vertrag. Fehlende Runtime-Icons
  fallen auf die generische Hostdarstellung zurück.

State Schema, Default State, Migration, Renderer, Inspector, Context-/Toolbar-Aktionen,
Connections und Serialize/Deserialize bilden zusammen den späteren Runtime-Vertrag. Das
Manifest enthält davon nur statisch validierbare Discovery-Metadaten. Das persistierte
Extension-Node-Modell, Missing-Extension-Verhalten und Legacy-Migration sind in
[`extension-orbit-model.md`](extension-orbit-model.md) festgelegt.

#### Dashboard Contributions

Dashboard Contributions beschreiben kompakte, sortierbare Flächen. Der Host kennt dabei keine
Produktnamen und erhält weder ausführbaren Code noch beliebige Komponenten aus dem Manifest:

```json
{
  "contributes": {
    "dashboard": [
      {
        "id": "workbench.agent-tasks.dashboard.open-count",
        "kind": "metric",
        "title": "Offene Aufgaben",
        "defaultSize": "small",
        "order": 100,
        "projectContext": true,
        "provider": "workbench.agent-tasks.dashboard-provider.open-count",
        "refresh": {
          "mode": "interval",
          "intervalMilliseconds": 5000
        },
        "format": "number"
      },
      {
        "id": "workbench.agent-tasks.dashboard.create",
        "kind": "quick-action",
        "title": "Aufgabe erstellen",
        "defaultSize": "small",
        "order": 110,
        "commandId": "workbench.agent-tasks.command.create"
      }
    ]
  }
}
```

- V1 kennt `metric`, `status`, `card`, `quick-action`, `list`, `chart`, `error-indicator` und
  `health-indicator`. Eine Extension darf 1 bis 256 Dashboard Contributions deklarieren.
- IDs sind manifestweit eindeutig und gehören zur Extension. Runtime Provider und Icons müssen
  ebenfalls im Extension-Namespace liegen; `icon: "extension"` verwendet das lokale
  Manifest-Icon.
- Quick Actions referenzieren ein tatsächlich deklariertes Command. Dadurch bleibt dieselbe
  Business Logic aus Command Palette, Button, Orbit, Agent Tool oder API aufrufbar.
- Alle übrigen Typen referenzieren einen Provider, der später über die öffentliche UI- oder
  Server-Runtime registriert wird. Der Manifestvertrag enthält keine Abfrage, Komponente oder
  ausführbare Funktion.
- Provider verwenden `on-demand`, ein Intervall von 1 bis 600 Sekunden oder `realtime`.
  Aktivierung bleibt lazy; die Runtime erzwingt später Timeout, Fehlerisolation und Cleanup.
- `defaultSize` ist `small`, `medium`, `large` oder `full`. `order`, `visibleByDefault` und
  `projectContext` beschreiben nur Defaults. Serverseitige Benutzerpräferenzen überschreiben
  Sichtbarkeit, Reihenfolge und Größe anhand der stabilen Contribution-ID.
- Metrics deklarieren ein Hostformat für Zahl, Prozent, Dauer, Bytes oder Text. Charts verwenden
  einen kontrollierten Typ für Linie, Balken, Fläche oder Donut. Das Daten-Payload und seine
  Größenlimits werden mit der Runtime Registry separat versioniert.

Die heutigen neun produktbezogenen Bereiche in `Dashboard.tsx` und der Browser-Key
`remote-workplace.dashboard-preferences.v1` ändern sich durch diesen Vertrag noch nicht. Phase 2
adaptiert sie zunächst als Legacy Built-in Contributions; die serverseitige Präferenzmigration
folgt kontrolliert mit Dual Read.

#### Settings Contributions

Settings Contributions sind entweder eine vom Host gerenderte Feldgruppe oder eine referenzierte
Page für komplexe Oberflächen:

```json
{
  "contributes": {
    "settings": [
      {
        "id": "workbench.agent-tasks.settings.general",
        "kind": "schema",
        "title": "Agent Tasks",
        "order": 100,
        "scope": "user",
        "fields": [
          {
            "id": "workbench.agent-tasks.setting.notifications",
            "type": "boolean",
            "label": "Benachrichtigungen",
            "default": true
          },
          {
            "id": "workbench.agent-tasks.setting.api-token",
            "type": "secret",
            "label": "API Token",
            "required": true
          }
        ]
      }
    ]
  }
}
```

- Schema Sections unterstützen `string`, `number`, `boolean`, `enum`, `multi-select`, `path`,
  `url`, `secret`, `project` und `duration`. Feld- und Section-IDs sind manifestweit eindeutig
  und gehören zum Extension-Namespace.
- `server`, `user` und `project` bestimmen die autoritative serverseitige Ablage. Der Default ist
  `user`. Ein Browser- oder Device-Scope ist absichtlich kein Extension-Settings-Scope.
- Strings und Zahlen besitzen kontrollierte Grenzen. Enum- und Multi-Select-Werte referenzieren
  eindeutige deklarierte Optionen. URLs erlauben nur HTTP und HTTPS. Durations werden
  unabhängig von der Anzeigeeinheit als ganze Millisekunden gespeichert.
- Ein Path-Wert ist nur Konfiguration. Er erweitert weder `files.read` noch `files.write` und
  umgeht keine Realpath-, Symlink- oder Root-Prüfung des Filesystem Brokers.
- Secret-Felder dürfen keinen Default im Manifest enthalten. Normale Settings-Antworten liefern
  später nur `gesetzt` oder `nicht gesetzt`; der Wert liegt in einem getrennten Secret Store und
  wird ausschließlich über den Secrets Broker verwendet.
- Eine `page` Section referenziert eine tatsächlich deklarierte Page derselben Extension. Deren
  Renderer läuft über denselben UI-Entrypoint und dieselbe Error Boundary wie andere Pages.
- Schema Sections benötigen keinen Extension-Entrypoint. Host, Settings Manager und Storage
  Manager validieren, rendern und persistieren sie generisch.
- Manifest-Defaults sind keine gespeicherten Grants oder Werte. Änderungen verwenden später
  Identity, Same-Origin, Revisionen, Audit und die serverseitige Scope-Autorisierung aus
  [`extension-server-authority.md`](extension-server-authority.md).

Die elf festen Cards in `Settings.tsx` werden in diesem Subgoal nicht verändert. Version,
Security, Extensions und Recovery bleiben Core. T3, Usage und andere Featurebereiche werden
erst über Legacy Built-in Contributions adaptiert; browserlokale Präferenzen bleiben bis zur
getesteten Dual-Read-Migration erhalten.

#### Keyboard Shortcut Contributions

Keyboard Shortcuts verknüpfen plattformübergreifende Tastenkombinationen mit bereits
deklarierten Commands. Das Manifest enthält nur Defaults und Context-Metadaten, keine zweite
Ausführungslogik:

```json
{
  "contributes": {
    "keyboardShortcuts": [
      {
        "id": "workbench.agent-tasks.shortcut.create",
        "commandId": "workbench.agent-tasks.command.create",
        "keybinding": [
          {
            "key": "KeyK",
            "modifiers": ["primary", "shift"]
          }
        ],
        "platformOverrides": {
          "mac": [
            {
              "key": "KeyK",
              "modifiers": ["meta", "shift"]
            }
          ]
        },
        "when": {
          "all": [
            {
              "key": "host.input.focused",
              "operator": "equals",
              "value": false
            }
          ]
        }
      }
    ]
  }
}
```

- Tasten verwenden kontrollierte physische `KeyboardEvent.code`-Werte. `primary` bedeutet auf
  Apple-Plattformen Meta und sonst Control. Modifikatoren stehen eindeutig in der kanonischen
  Reihenfolge `primary`, `control`, `meta`, `alt`, `shift`.
- Ein Keybinding enthält eine oder zwei Tastenfolgen. `mac`, `windows` und `linux` können den
  plattformübergreifenden Default gezielt ersetzen; Browser- oder Betriebssystem-reservierte
  Kombinationen bleiben eine Host-Policy und erhalten später einen sichtbaren Disabled Reason.
- `when` ist eine nicht ausführbare Context Expression. `all` verlangt alle, `any` mindestens
  eine und `none` keine der enthaltenen Klauseln. Unterstützt werden Existenz, Gleichheit und
  Mengenvergleich mit begrenzten String-, Zahlen- oder Boolean-Werten. Freie Expressions,
  JavaScript und reguläre Ausdrücke sind nicht erlaubt.
- Der `host`-Namespace ist geschlossen. Extension-eigene Context Keys müssen zur deklarierenden
  Extension gehören. Dadurch kann eine Extension fremde interne Zustände weder vortäuschen noch
  versehentlich als stabilen Vertrag verwenden.
- Shortcuts reagieren standardmäßig nicht in Inputs, Textareas, Selects oder editierbaren
  Flächen und ignorieren wiederholte sowie laufende Composition-Events. `allowInEditable` und
  `allowRepeat` müssen bewusst gesetzt werden; unmodifizierte druckbare Tasten bleiben auch dann
  in editierbaren Flächen verboten.
- Lokale Tastatursteuerung sicherheits- und laufzeitkritischer Flächen behält Vorrang. Terminal,
  Browser, Preview, Dialoge und Fokusfallen geben nur nicht verbrauchte Ereignisse an die globale
  Registry weiter. Eine Extension darf diese Eingabegrenzen nicht umgehen.
- Default-Kollisionen werden absichtlich nicht durch Dateireihenfolge aufgelöst. Der Manager
  ermittelt Konflikte je Plattform und Context, deaktiviert die kollidierende Belegung und zeigt
  beide Quellen an. Ein zuletzt registrierter Shortcut überschreibt niemals still einen anderen.
- Nutzer können Belegungen später serverseitig je Identität ändern. Overrides referenzieren die
  stabile Shortcut-ID, werden geräteübergreifend synchronisiert und bleiben bei einer fehlenden
  oder deaktivierten Extension erhalten.

Der bestehende Orbit-Handler für `/` und `Ctrl/Cmd+K` bleibt in diesem Subgoal unverändert.
Phase 2 registriert vorhandene Tastaturaktionen zunächst als Legacy Built-in Contributions und
führt erst dann eine zentrale Registry und Konfliktoberfläche ein.

#### Context Menu Contributions

Context Menu Contributions hängen vorhandene Commands an eine stabile Host- oder
Extension-Surface. Rechtsklick, Touch-Long-Press, Menütaste und `Shift+F10` verwenden später
dieselbe Registry:

```json
{
  "contributes": {
    "contextMenus": [
      {
        "id": "workbench.agent-tasks.context-menu.create",
        "surface": "host.context-menu.project",
        "commandId": "workbench.agent-tasks.command.create",
        "group": "create",
        "order": 100,
        "icon": "workbench.agent-tasks.icon.tasks",
        "when": {
          "all": [
            {
              "key": "host.project.open",
              "operator": "equals",
              "value": true
            }
          ]
        }
      }
    ]
  }
}
```

- V1 definiert Host-Surfaces für Project, File, Directory, Orbit Node, Orbit Pane, Preview,
  Terminal, Git, Agent Session, Browser und generische Tool-Flächen. Ihre stabilen IDs beginnen
  mit `host.context-menu.`. Unbekannte Host-Surfaces werden fail-closed abgewiesen.
- Native Extension-UIs können eine eigene Surface-ID in ihrem Namespace an den Host übergeben.
  Eine Extension darf weder eine fremde Surface verwenden noch eine Host-Surface vortäuschen.
- Jedes Item referenziert ein tatsächlich deklariertes Command. Titel, Disabled Reason,
  Berechtigungsprüfung und Business Logic bleiben im Command-System; das Manifest enthält weder
  Handler noch frei geformte Ausführungspayloads.
- Die Gruppen `navigation`, `open`, `create`, `edit`, `run`, `view`, `share` und `danger` geben
  kontrollierte Abschnitte vor. Der Host sortiert nach dieser Gruppenreihenfolge, `order`,
  Extension-ID und Contribution-ID. Dateisystemreihenfolge besitzt keine Semantik.
- `danger` wird als letzter, zurückhaltend markierter Abschnitt gerendert. Die Gruppe erteilt
  keine Berechtigung. Mutierende Commands durchlaufen weiterhin Capability, Identity,
  Same-Origin, Audit und gegebenenfalls eine Bestätigung.
- `when` verwendet dieselben strikt begrenzten Context Expressions wie Keyboard Shortcuts.
  False blendet das Item aus. Ein sichtbares, aber nicht ausführbares Command bleibt mit dem
  zentral gelieferten Disabled Reason erkennbar, statt still zu verschwinden.
- Icons verwenden das lokale Manifest-Icon oder eine namespaced Runtime-Referenz. Der Host kann
  bei fehlendem Runtime-Icon auf die Command-Darstellung ohne Icon zurückfallen.
- Der Host übergibt dem Command eine typisierte, auf die Surface begrenzte Auswahlreferenz und
  niemals DOM-Events oder ungeprüfte Capability-Objekte. Pfade, Prozesse und Runtime-Aktionen
  werden bei Ausführung erneut durch die zuständigen Broker geprüft.
- Kernel-eigene Sicherheits-, Recovery- und Datenlöschaktionen können als dokumentierte
  `hostOnly`-Items bestehen bleiben. Extensions dürfen bestehende Host-Items weder entfernen
  noch durch identische IDs oder Registrierungsreihenfolge überschreiben.

Die heutigen Menüs in `ProjectCard`, `FileManagerPanel`, `OrbitWorkbench`, `Sidebar`,
`TerminalArea`, `ChromiumBrowser` und `ToolActionMenu` werden in diesem Subgoal nicht verändert.
Phase 2 adaptiert sie schrittweise als Legacy Built-in Contributions und bewahrt dabei
Fokusführung, Touch-Bottom-Sheets, Bestätigungsdialoge und laufende Runtime-Sitzungen.

#### Status Bar Contributions

Status Bar Contributions beschreiben kleine, hostgerenderte Zustände und Aktionen. Das
Manifest enthält weder beliebiges Markup noch eine eigene Komponente:

```json
{
  "contributes": {
    "statusBar": [
      {
        "id": "workbench.agent-tasks.status-bar.open-count",
        "kind": "counter",
        "title": "Offene Aufgaben",
        "icon": "workbench.agent-tasks.icon.tasks",
        "alignment": "right",
        "order": 100,
        "priority": 60,
        "compact": "value",
        "provider": "workbench.agent-tasks.status-provider.open-count",
        "commandId": "workbench.agent-tasks.command.open",
        "when": {
          "all": [
            {
              "key": "host.project.open",
              "operator": "equals",
              "value": true
            }
          ]
        }
      }
    ]
  }
}
```

- V1 kennt `text`, `status`, `counter`, `progress` und `action`. Eine Extension darf 1 bis
  128 Status Bar Contributions deklarieren.
- `left` und `right` bilden die beiden kontrollierten Bereiche. Innerhalb eines Bereichs
  sortiert der Host deterministisch nach `order`, Extension-ID und Contribution-ID.
- `priority` liegt zwischen 0 und 100. Höhere Werte bleiben bei Platzmangel länger sichtbar.
  Sicherheits-, Recovery- und grundlegende Health-Anzeigen des Kernels sind dokumentierte
  `hostOnly`-Elemente und können durch Extensions weder verdrängt noch als `required` markiert
  werden.
- `compact` ist `hide`, `icon` oder `value`. `icon` benötigt eine lokale Manifest- oder
  namespaced Runtime-Icon-Referenz. Mobile Darstellung und verfügbare Breite bleiben eine
  Host-Policy.
- `action` referenziert ausschließlich ein tatsächlich deklariertes Command. Die übrigen Arten
  referenzieren einen Provider und können optional dasselbe Command-System für eine Aktion
  verwenden. Business Logic, Berechtigungen und Disabled Reasons werden nicht dupliziert.
- Provider-IDs gehören zur deklarierenden Extension und benötigen einen UI- oder
  Server-Entrypoint. Die spätere Runtime definiert je Art ein begrenztes, hostgerendertes
  Payload, isoliert Fehler und erzwingt Timeout, Payload-, Aktualisierungs- und Cleanup-Grenzen.
  Unkontrolliertes eigenes Polling pro Statusitem ist nicht Teil des Vertrags.
- `when` verwendet die gemeinsamen strikt typisierten Context Expressions. Fremde Extension-
  Contexts und unbekannte Host-Contexts werden fail-closed abgewiesen.
- Eine Status Bar Contribution ist nur ein ergänzender Überblick. Wichtige Fehler oder
  Handlungsbedarfe benötigen zusätzlich Health-, Notification- oder zugängliche Seitenzustände
  und dürfen nicht ausschließlich über Farbe oder die Desktop-Statusleiste vermittelt werden.

Die heutige `StatusBar.tsx` mit Workbench Health, Orbit-Kontext, Projekt und Usage-Anzeigen
bleibt in diesem Subgoal unverändert. Phase 2 registriert diese Bereiche zunächst als Legacy
Built-in Contributions und führt dabei eine gemeinsame Aktualisierungs- und Overflow-Policy ein.

#### Topbar Contributions

Topbar Contributions hängen eine kleine Aktion oder einen hostgerenderten Selector an genau eine
deklarierte Route:

```json
{
  "contributes": {
    "topbar": [
      {
        "id": "workbench.agent-tasks.topbar.create",
        "kind": "action",
        "routeId": "workbench.agent-tasks.route.main",
        "commandId": "workbench.agent-tasks.command.create",
        "icon": "workbench.agent-tasks.icon.tasks",
        "placement": "primary",
        "order": 100,
        "priority": 80,
        "presentation": "icon-label",
        "compact": "icon"
      },
      {
        "id": "workbench.agent-tasks.topbar.project",
        "kind": "selector",
        "title": "Projekt",
        "routeId": "workbench.agent-tasks.route.main",
        "provider": "workbench.agent-tasks.topbar-provider.projects",
        "commandId": "workbench.agent-tasks.command.select-project",
        "placement": "secondary",
        "order": 110,
        "priority": 60,
        "presentation": "label",
        "compact": "overflow"
      }
    ]
  }
}
```

- V1 kennt `action` und `selector`. Beide referenzieren ein tatsächlich deklariertes Command und
  genau eine tatsächlich deklarierte Route derselben Extension. Die Zielroute muss `topbar: true`
  besitzen.
- Actions beziehen Titel, Disabled Reason, Berechtigungsprüfung und Business Logic aus dem
  Command-System. Selector Provider liefern später eine begrenzte Options- und Auswahlstruktur;
  Änderungen laufen ebenfalls über das referenzierte Command. Das Manifest enthält keine
  Callback-Funktion, freie React-Komponente oder HTML-Struktur.
- `primary`, `secondary` und `overflow` sind die kontrollierten Platzierungen. Der Host sortiert
  innerhalb einer Platzierung nach `order`, Extension-ID und Contribution-ID. Navigation,
  Breadcrumbs, Route-Titel und Recovery-Flächen sind keine öffentlichen Topbar-Platzierungen.
- `presentation` ist `icon`, `label` oder `icon-label`. Bei enger Breite verschiebt `compact:
  "overflow"` das Item in das zugängliche Host-Menü, `icon` reduziert es auf das Icon und `hide`
  blendet nur diese zusätzliche Sicht aus. Jede icon-basierte Darstellung benötigt eine lokale
  oder namespaced Icon-Referenz.
- `priority` liegt zwischen 0 und 100. Niedrigere Prioritäten wechseln zuerst in ihren Compact-
  Modus. Platzierung und Priorität erteilen keine Berechtigung und können geschützte Host-Aktionen
  nicht verdrängen.
- Selector Provider gehören zur deklarierenden Extension und benötigen einen UI- oder
  Server-Entrypoint. Der spätere Runtime-Vertrag begrenzt Optionszahl, Textlänge,
  Aktualisierungsrate und Payload, isoliert Fehler und entfernt Provider beim Disable.
- `when` verwendet die gemeinsamen strikt typisierten Context Expressions. Der Host prüft den
  Context und die Command-Ausführbarkeit erneut, bevor er ein Item zeigt oder ausführt.
- Auf Touch-Flächen behält der Host 44-Pixel-Ziele, Keyboard-Navigation, Focus Management und
  Reduced Motion. Ein wichtiges Feature darf nicht ausschließlich als ausgeblendete Topbar-
  Aktion erreichbar sein; Command Palette oder Seite bleiben der zugängliche Fallback.

Die aktuelle Topbar in `AppShell.tsx`, `ContextProjectPicker`, `StandaloneRouteActions` und der
Portal-Zielpunkt `topbar-tool-actions` bleiben in diesem Subgoal unverändert. Phase 2 übernimmt
sie kontrolliert als Route-Metadaten, `hostOnly`-Elemente und Legacy Built-in Contributions. Die
Route-Activity-Prüfung des Portals muss dabei erhalten bleiben, damit persistente T3- und
code-server-Flächen nicht gleichzeitig Aktionen in die aktive Topbar schreiben.

#### File Contributions

File Contributions registrieren einen Viewer oder ein „Öffnen mit“-Command anhand begrenzter
Dateimetadaten:

```json
{
  "contributes": {
    "files": [
      {
        "id": "workbench.markdown.file.viewer",
        "kind": "viewer",
        "title": "Markdown Vorschau",
        "icon": "workbench.markdown.icon.file",
        "matcher": {
          "extensions": ["md", "markdown"],
          "fileNames": ["README"],
          "mimeTypes": ["text/markdown"],
          "caseSensitiveFileNames": false
        },
        "priority": 80,
        "provider": "workbench.markdown.file-provider.viewer",
        "surfaces": ["detail", "quick-look"],
        "contentMode": "text"
      },
      {
        "id": "workbench.markdown.file.open",
        "kind": "opener",
        "title": "Im Markdown Editor öffnen",
        "matcher": {
          "extensions": ["md", "markdown"],
          "caseSensitiveFileNames": false
        },
        "priority": 60,
        "commandId": "workbench.markdown.command.open"
      }
    ]
  }
}
```

- Matcher verwenden ausschließlich kleingeschriebene Endungen ohne führenden Punkt, exakte
  Basenames und kleingeschriebene MIME-Typen ohne Parameter. MIME-Wildcards sind nur als
  Subtyp `type/*` erlaubt. Mindestens eine Matcher-Liste ist erforderlich und jede Liste ist auf
  64 eindeutige Werte begrenzt.
- Pfade, Verzeichnisse, Globs, reguläre Ausdrücke, URLs und ausführbarer Matcher-Code sind nicht
  erlaubt. `caseSensitiveFileNames` macht die Basename-Semantik explizit; Endungen und MIME-Typen
  bleiben kanonisch kleingeschrieben.
- Viewer registrieren einen namespaced UI-Provider für `detail`, `quick-look` oder beide Flächen.
  `text`, `media` und `binary` wählen nur den späteren Broker-Kanal. Sie erhöhen weder Payload-
  Grenze noch Dateiberechtigung.
- Jeder Viewer benötigt einen UI-Entrypoint und einen ausdrücklichen `files.read` Permission
  Request. Ein Match ist niemals ein Grant. Der Host liefert nur eine begrenzte Auswahlreferenz;
  der Filesystem Broker prüft Root, Scope, kanonischen Pfad, Realpath und Symlinks bei jedem
  tatsächlichen Zugriff erneut.
- Opener referenzieren ein tatsächlich deklariertes Command. Dateiauswahl, Disabled Reason und
  Business Logic laufen durch Command Registry und Capability Broker. Die Contribution verleiht
  weder `files.read` noch `files.write`.
- `priority` liegt zwischen 0 und 100. Überlappende Viewer und Opener bleiben sichtbar als
  „Öffnen mit“-Auswahl; ein Hostdefault wird deterministisch nach Priorität, Extension-ID und
  Contribution-ID ermittelt. Spätere serverseitige Nutzerpräferenzen referenzieren die stabile
  Contribution-ID und werden bei fehlender Extension nicht gelöscht.
- Icons und Context Expressions folgen den gemeinsamen Namespace-Regeln. Freier HTML- oder SVG-
  Code ist nicht Teil einer File Contribution. Gerenderte Markdown-/HTML-Inhalte bleiben an die
  Host-Sanitizing-, CSP- und Sandbox-Regeln gebunden.
- Disable entfernt Viewer und Opener, verändert aber keine Datei und beendet keinen Editor,
  Terminalprozess oder andere user-owned Runtime. Download, Rename, Move und Delete bleiben
  eigene Commands mit erneuter Capability- und Bestätigungsprüfung.

`previewKindOf`, `FilePreview`, `QuickLook` und `FileManagerService` werden in diesem Subgoal
nicht verändert. Phase 2 adaptiert die vorhandenen Code-, Markdown-, Media-, PDF-, HTML- und
Fallback-Renderer als Legacy Built-in Contributions. Die bestehenden O_NOFOLLOW-, Realpath-,
Root- und Größenprüfungen bleiben Kernel-Substrat.

#### Terminal Contributions

Terminal Contributions registrieren hostgerenderte Profile oder Command-basierte Aktionen. Das
Manifest enthält weder Shell-Text noch Prozessargumente, Umgebungsvariablen, Zugangsdaten oder
direkte PTY-Nachrichten:

```json
{
  "contributes": {
    "terminal": [
      {
        "id": "workbench.python.terminal.profile.repl",
        "kind": "profile",
        "title": "Python REPL",
        "icon": "workbench.python.icon.terminal",
        "order": 100,
        "provider": "workbench.python.terminal-provider.repl",
        "projectContext": true,
        "supportsSplit": true,
        "visibleByDefault": true
      },
      {
        "id": "workbench.python.terminal.action.interrupt",
        "kind": "action",
        "title": "Prozess unterbrechen",
        "order": 200,
        "commandId": "workbench.python.command.interrupt",
        "group": "session",
        "surfaces": ["toolbar", "mobile-actions"],
        "requiresSession": true
      }
    ]
  }
}
```

- Profile benötigen einen namespaced Provider, einen UI- oder Server-Entrypoint und die
  Permission `terminal.create`. Der spätere Provider liefert nur einen typisierten Startwunsch;
  Projektpfad, Executable, Account, Limits und Grants prüft der Terminal Broker erneut.
- PTY Manager, tmux Supervisor, Session Registry, History, Geometrie, Ownership, Reconnect und
  Workspace-Sync bleiben Kernel. Ein deaktiviertes Profil beendet keine laufende user-owned
  Session. Die UI kann sie weiter über die geschützte Session-Liste öffnen oder beenden.
- Actions referenzieren tatsächlich deklarierte Commands. Sie können in Toolbar, Session-Menü,
  Session-Liste und mobiler Aktionsleiste erscheinen. `requiresSession` steuert nur den
  Hostzustand; Eingabe, Restart, Close und andere Mutationen prüfen ihre Capability bei jeder
  Ausführung erneut.
- Gruppen und Reihenfolge sind deklarativ und deterministisch. Die Gefahrengruppe erhält in der
  späteren UI eine sichtbare Bestätigung, verleiht aber selbst keine zusätzliche Berechtigung.
- Icons und Context Expressions folgen denselben Namespace-Regeln wie andere Surfaces. Freie
  React-Komponenten, HTML, Terminal Escape Sequences oder beliebiger WebSocket-Code sind nicht
  Teil der Contribution.
- Split-Unterstützung ist ein UI-Merkmal. Pane-Identitäten, mobile Ein-Pane-Darstellung und das
  bestehende persistierte Split-Dokument werden durch diesen Contract nicht verändert.

Phase 2 registriert Shell, Codex, OpenCode und Claude Code zunächst als Legacy Built-in Profile.
Die dynamische Profilauflösung folgt erst mit Runtime Registry und Capability Broker. Bestehende
Terminal- und Agentensitzungen bleiben bis dahin vollständig auf dem bisherigen Codepfad.

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
