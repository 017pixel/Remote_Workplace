# ADR: Frontend Registries und Legacy Built-in Contributions

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1, Phasen 2 und 3

## Kontext

Manifest V1 beschreibt Pages, Routes, Navigation, Commands, Shortcuts, Context Menus,
Statusleiste, Topbar, Dashboard, Settings und Orbit. Das aktuelle Frontend rendert dieselben
Informationen aber aus mehreren statischen Listen. Alle 18 sichtbaren Seiten stehen in der
Navigation, zwei Path-to-Page-ID-Maps, den Sidebar-Präferenzen, den Settings-Labels und den
Shell-Titeln. Routen, Lazy Loader und 21 Prefetch-Präfixe liegen nochmals getrennt.

Ein sofort dynamischer Router würde zugleich Persistenz, Lazy Loading, Stale-Chunk-Recovery,
mobile Navigation und browserlokale Präferenzen verändern. Phase 2 braucht deshalb zuerst eine
additive Runtime-Grenze, an der die heutigen Features ohne sichtbare Änderung dogfooden können.

## Entscheidung

Das Web-Frontend erhält kleine, surface-spezifische Registries auf einem gemeinsamen
Ownership-Kern. Jede Registrierung besitzt mindestens:

- die stabile Extension-ID des Owners,
- die validierte Contribution-ID und Manifest-Metadaten,
- eine hostseitige Runtime-Bindung wie Loader, Renderer, Provider oder Command Handler,
- eine deterministische Reihenfolge unabhängig von Import- und Dateisystemreihenfolge.

Ein Owner ersetzt seine Contributions atomar als Batch. IDs dürfen global nur einmal vorkommen.
Validierungs- oder Kollisionsfehler verändern den vorherigen Snapshot nicht. Disable entfernt
alle Runtime-Bindings des Owners in einem Schritt und informiert React-Consumer über eine neue
Registry-Revision. Die Registries speichern keinen Installations-, Grant- oder Lifecycle-State;
diese Fakten kommen später ausschließlich vom Server Extension Manager.

Der gemeinsame Kern ist in `apps/web/src/extensions/registryCore.ts` implementiert. Er verwendet
die öffentlichen ID-Schemas direkt aus `@workbench/extension-contracts`, liefert stabile
`getSnapshot`-/`subscribe`-Funktionen für `useSyncExternalStore` und friert Snapshot sowie
Contribution-Hüllen ein. Surface-spezifische Werte bleiben bewusst außerhalb einer generischen
Deep-Freeze- oder Serialisierungslogik, weil sie später React Loader, Provider und Handler
enthalten können.

### Registry-Aufteilung

| Registry | Phase-2-Aufgabe | Noch nicht in Phase 2 |
| --- | --- | --- |
| Page/Route | Metadaten, Lazy Loader, Boundary- und Prefetch-Bindung registrieren | dynamische React-Routen erzeugen |
| Navigation | Desktop und Mobile aus derselben stabilen Contribution-Sicht speisen | serverseitige User Preferences |
| Command | Handler, Verfügbarkeit und Lifecycle-Cleanup zentralisieren | Capability Broker implementieren |
| Shortcut | Defaults und Konflikte deterministisch auf Commands abbilden | vollständige Einstellungs-UI |
| Context Menu | Legacy-Aktionen pro kontrollierter Surface registrieren | beliebige Komponenten oder HTML |
| Status Bar/Topbar | hostgerenderte Legacy-Items und Provider registrieren | geschützte Hostzustände öffnen |
| Dashboard | neun bestehende Bereiche mit stabilen IDs abbilden | Dashboard visuell umbauen |
| Settings | bestehende Feature-Cards und Feldmetadaten registrieren | Core Security und Recovery auslagern |
| Orbit | Legacy-Palette und Renderer-Metadaten registrieren | Dokumentformat oder Node-Migration ändern |

### Legacy Built-ins

Jedes bestehende Feature erhält eine stabile `workbench.*`-Extension-ID und Contribution-IDs aus
dem öffentlichen Contract. Legacy Adapter dürfen vorhandene React-Komponenten und Services
binden, aber keine zweite Metadatenquelle erfinden. Paritätstests vergleichen IDs, Pfade,
Sichtbarkeit, Reihenfolge, Loader, Titel und Prefetch-Verhalten mit dem bisherigen Zustand.

`system`-Beiträge bleiben auf Security, Bootstrap und Recovery begrenzt. 404, App Shell,
Error Boundaries, `PersistentOutlet`, Offline-Anzeige und Settings-Recovery sind explizite
`hostOnly`-Flächen. Ihre Existenz ist kein Präzedenzfall für Feature-Sonderlogik.

### React und Fehlerisolation

Registries bieten unveränderliche Snapshots und eine `useSyncExternalStore`-kompatible
Subscription. Consumer rendern aus einem konsistenten Snapshot und sortieren nicht erneut nach
Registrierungszeit. Ein fehlerhafter Provider oder Renderer wird an seiner Contribution-Grenze
isoliert; die Registry selbst wirft den restlichen Owner-Batch bei einer ungültigen Registrierung
zurück.

## Kompatibilität

- Bestehende URLs und `/gallery` als Alias bleiben erhalten.
- `PersistentOutlet` behält volle Pathnames als Cache-Key; geparkte Iframes, Terminals und
  WebSockets werden nicht remountet.
- `remote-workplace.sidebar-preferences.v1` Persist v2 und
  `remote-workplace.dashboard-preferences.v1` bleiben in Phase 2 unverändert.
- Die 18 bisherigen Page IDs bleiben als Legacy-Aliase lesbar und werden deterministisch auf
  Contribution-IDs abgebildet.
- Desktop und Mobile verwenden dieselbe Navigation Registry; Focus Trap, History Overlay,
  Reduced Motion und Touchziele bleiben unverändert.
- Lazy Imports bleiben in getrennten Chunks und behalten den einmaligen Stale-Chunk-Recovery-Pfad.

## Konsequenzen

- Phase 2 kann jede Surface einzeln migrieren, ohne den Router oder persistierte Daten gemeinsam
  umzubauen.
- Phase 3 erhält eine bereits dogfoodete Page-/Route-/Navigation-Quelle für den Dynamic Shell.
- Kurzzeitig existieren Legacy Adapter neben den alten Consumern; Paritätstests und klar benannte
  Exit Gates verhindern dauerhafte Doppelquellen.
- Registries müssen vor dem ersten App-Render mit Required- und Built-in-Beiträgen gebootstrapped
  sein, später aber atomare Server-Snapshots übernehmen können.

## Verworfene Alternativen

### Eine globale Universal-Registry

Verworfen, weil Renderer, Commands, Menüs und Settings unterschiedliche Runtime-Bindungen und
Fehlergrenzen besitzen. Der gemeinsame Kern enthält nur Ownership, Batch, Kollision, Revision und
Subscription.

### Router, Navigation und Präferenzen in einem Schritt ersetzen

Verworfen, weil ein Fehler gleichzeitig Bookmarks, persistente Routen und mobile Bedienung
gefährden würde.

### Manifest-Metadaten direkt in React-Komponenten importieren

Verworfen, weil Disable, Lifecycle-Cleanup, Kollisionen und dynamische Server-Snapshots dann keine
atomare Grenze hätten.

## Verifikation

- Unit-Tests prüfen atomare Batches, Ownership, Kollisionen, deterministische Snapshots,
  Subscription und Dispose.
- Paritätstests sichern alle bisherigen IDs, Pfade, Titel, Gruppen, Reihenfolgen und Loader.
- Phase-2-Browserprüfungen vergleichen Desktop und Mobile vor und nach jeder Consumer-Migration.
- Persistent-Route-Tests und Browserprüfung stellen sicher, dass T3, Hermes, Terminal, Browser,
  Preview und code-server beim Navigieren nicht remounten.
