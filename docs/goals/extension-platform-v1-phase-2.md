# Phase 2: Frontend Registries und Legacy Built-in Contributions

Stand: 2026-08-15

## Ergebnis

Phase 2 führt typisierte Frontend Registries und Legacy Built-in Contributions ein. Die sichtbare
Oberfläche, URLs, Persistenz, Lazy-Loading-Grenzen und Runtime-Sitzungen bleiben gleich. Phase 3
ersetzt erst danach die statische Router- und Shell-Verdrahtung durch diese dogfoodete Quelle.

Bindende Architektur: [`extension-frontend-registries.md`](../adr/extension-frontend-registries.md).
Vollständige Ausgangsbasis:
[`extension-platform-v1-inventory.md`](extension-platform-v1-inventory.md#2-frontend-inventar).

## Aktueller Ist-Zustand

| Bereich | Aktuelle Quellen | Relevante Grenze |
| --- | --- | --- |
| Routes | 3 standalone, 22 Shell-Einträge und 404 in `App.tsx` | eigene Boundary, persistente Pathname-Instanz |
| Loader | 15 Loader und 21 Pfadpräfixe in `routeModules.ts` | Lazy Chunks und einmalige Stale-Chunk-Recovery |
| Navigation | 18 Items in drei Arrays | dieselben visuellen Daten für Desktop und Mobile |
| Page Identity | Union, Array, zwei Path Maps und Settings-Labels | LocalStorage Persist v2 und Recovery-Seite |
| Shell Metadata | Titel und Pfad-Sonderfälle in `AppShell.tsx` | Topbar, Breadcrumb, Project Context, Full-Bleed |
| Orbit | geschlossene Node-/Paneltypen und drei Palette-Arrays | Dokumentversion 8 bleibt unangetastet |
| Dashboard | neun feste Sections in Contract, Store und View | Server-Config plus browserlokale Hidden-Sets |
| Settings | elf feste Cards in einer großen View | Security, Recovery und Version bleiben Core |
| Commands | Server-Command-Referenz und lokale Orbit-Palette | noch keine allgemeine UI Command Registry |
| Shortcuts | lokale `keydown`-Listener je Feature | lokale Surface-Eingabe behält Vorrang |
| Context Menus | lokale Implementierungen in Orbit, Files, Browser und Sidebar | Fokus- und Touchverhalten ist featuregebunden |
| Status Bar | Hostzustand plus drei feste Usage Provider | Workbench Health und Recovery bleiben geschützt |

## Verbindliche Reihenfolge

### 2.2 Registry Core V1

- `@workbench/extension-contracts` im Web als öffentliche Metadatenquelle verwenden.
- Generischen Ownership-Kern für atomare Owner-Batches, Kollisionen, Revision, Snapshot,
  Subscription und Dispose implementieren.
- Keine React-Komponente und keinen Serverzustand in den generischen Kern legen.
- Negative Tests für fremde Namespaces, partielle Batches und doppelte IDs ergänzen.

### 2.3 Page- und Route-Registry

- Alle bestehenden Pages, Routes, Aliase, Shell-Modi und Lazy Loader als Legacy Built-ins
  registrieren.
- Dashboard-Index, drei Standalone-Routen, dynamische Projekt-/Preview-/Terminalpfade und 404 als
  explizite Host- beziehungsweise Route-Arten abbilden.
- Parität für 25 öffentliche Muster, Boundaries, Persistenzmetadaten und Stale-Chunk-Recovery
  testen; `App.tsx` bleibt bis Phase 3 statischer Consumer.

### 2.4 Navigation- und Prefetch-Registry

- Navigation-ID, Route-ID, Page-ID, Titel, Gruppe, Reihenfolge, Sichtbarkeit, Mobile-Eignung,
  Icon-Bindung und Prefetch in einer Quelle zusammenführen.
- Sidebar, Mobile Navigation, Shell-Titel und Settings-Sichtbarkeit nacheinander adaptieren.
- Beide Path-to-ID-Maps und doppelte Labels erst nach Paritäts- und Browserprüfung entfernen.

### 2.5 Command- und Shortcut-Registry

- Bestehende globale und surfacegebundene Aktionen mit stabilen `workbench.*`-IDs registrieren.
- Handler-Lifecycle, Context, Konflikte und Dispose testen.
- Terminal-, Browser- und Formulareingabe behalten Vorrang; keine lokalen Listener vorschnell
  entfernen.

### 2.6 Context-Menu-, Status-Bar- und Topbar-Registry

- Legacy-Aktionen und Items pro kontrollierter Surface registrieren.
- Hostzustände und Recovery-Aktionen markieren und gegen Überschreiben schützen.
- Bestehendes Desktop-, Touch-, Focus- und Bottom-Sheet-Verhalten beibehalten.

### 2.7 Dashboard- und Settings-Registry

- Neun Dashboard-Bereiche sowie featurebezogene Settings-Cards mit stabilen IDs registrieren.
- Bestehende Config und LocalStorage-Werte über Legacy-Aliase weiter lesen.
- Security, Version, Extension Recovery und Installationsverwaltung bleiben Hostflächen.

### 2.8 Orbit-Registry-Metadaten

- Bestehende Palette, Renderer, Inspector und Größenmetadaten als Built-ins registrieren.
- Dokumentversion, geschlossene Legacy-Knoten und `panelTypeSchema` noch nicht verändern.
- Phase 4 erhält verifizierte Runtime-Bindings für den generischen Extension-Knoten.

### 2.9 Phase-2-Verifikation

- Typecheck, Lint, vollständige Unit-Tests und Produktionsbuild ausführen.
- Eigenen isolierten Devserver auf freiem Port starten und Desktop/Mobile ausschließlich mit dem
  Playwright MCP prüfen.
- Navigation, Prefetch, Einstellungen, Dashboard, Orbit-Palette, Menüs, Statusleiste und
  persistente Routen gegen die Baseline vergleichen.
- Erst nach grüner Parität Phase 3 und den Dynamic Shell beginnen.

## Exit Gates

- Jede geplante Registry besitzt Ownership-, Collision-, Batch-, Dispose- und Paritätstests.
- Legacy Built-ins verwenden öffentliche Contribution-IDs und dieselben Registry-Wege wie
  spätere Extensions.
- Keine sichtbare Route, Navigation, Einstellung, Dashboard-Fläche oder Orbit-Palette fehlt.
- Desktop und Mobile lesen dieselbe Navigation Registry.
- Bestehende LocalStorage-Werte, Bookmarks und Aliase bleiben lesbar.
- Persistente Iframes, Terminals und WebSockets remounten beim Seitenwechsel nicht.
- Kein Initial-Bundle lädt alle Feature-Chunks eager.
- Keine user-owned Runtime oder Preview-Session wird durch Registry-Dispose beendet.
