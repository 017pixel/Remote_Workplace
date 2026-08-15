# ADR: Extension Kernel Boundary

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

Remote Workplace initialisiert heute sichtbare Features, Datenbanken, Hintergrunddienste,
Routen und Low-Level-Runtimes direkt im Server beziehungsweise in der App Shell. Gleichzeitig
existieren bereits wertvolle Sicherheits- und Prozessgrenzen: Tailscale Identity, Same-Origin-
Prüfung, CSP, Rate Limits, Audit, kanonische Projektpfade, SSRF-Schutz, PTY/tmux, T3 Code,
code-server, Preview Gateways, Chromium und Hermes.

Die Plattformmigration soll sichtbare Funktionen über eine gemeinsame Extension API
registrierbar machen. Sie darf dafür weder Security in Extensions verschieben noch bestehende
Runtimes zusammenlegen. Ein künstlich minimaler Kernel würde diese Garantien schwächen; ein
zu großer Kernel würde dagegen den heutigen Feature-Monolithen nur umbenennen.

## Entscheidung

Der Kernel enthält ausschließlich stabile, generische oder sicherheitskritische Grundlagen.
Nutzerseitige Produktfunktionen werden standardmäßig Extensions. First-Party Extensions
verwenden dieselben öffentlichen Contracts, Registries und Capability APIs wie lokale Catalog-
und Developer Extensions.

### Kernel-Verantwortung

#### Security und Identity

- Tailscale- und Request-Identity, Allowed Users und benutzerbezogene Scopes
- Same-Origin- und Mutation-Origin-Prüfung, CSRF-Grundschutz und CSP
- zentrale Rate Limits, Audit, Secret Redaction und sichere Fehlerantworten
- kanonische Pfadauflösung, Symlink-Schutz und generische Input-/Payload-Limits

#### Extension Platform

- Discovery, Manifest Validation, Registry, Manager und deterministisches Laden
- Lifecycle, Activation, Cleanup, Dependency Resolution und API-Versionierung
- Permission Manager, Capability Broker, Storage und Settings Manager
- Event Bus, Scheduler, Logs, Health, Recovery, Safe Mode und Quarantäne

#### App Host

- App Shell, Router Host, Extension Route Host und Error Boundaries
- Extension Manager UI, Recovery UI und minimale Core Settings
- Design Tokens, grundlegendes Design System, PWA Shell und Accessibility-Grundlagen

#### Workspace Substrate

- Project Identity und sichere Project-Path-Auflösung
- Orbit Engine, Persistenz, Revisionen, Backups und generischer Panel-/Window-Host
- Command Registry und Notification Infrastructure

#### Low-Level Runtime Broker

- Terminal Runtime, PTY Manager und tmux Supervisor
- Browser Runtime und Chromium Manager
- Preview Runtime, Slot Manager und Gateway
- Filesystem, Process, Network, Git und Secrets Broker
- bestehende T3-, code-server- und Hermes-Prozess-/Proxy-Grundlagen, solange sie nicht durch
  einen nachweislich generischeren Broker ersetzt werden können

### Extension-Verantwortung

Nahezu jede sichtbare Produktfläche liegt außerhalb des Kernels. Dazu gehören insbesondere:

- Pages, Navigation, Mobile Navigation, Dashboard Cards und Settings Sections
- Orbit Renderer, Inspektoren, Toolbars und Context Actions
- Commands, Shortcuts, Context Menus, Topbar und Statusbar
- sichtbare Terminal-, Files-, Preview-, Browser-, T3-, code-server- und Agentenoberflächen
- Tech TLDRs, Usage, Skills UI, Inbox-Adapter und andere Featurelogik
- Agent Tools, extension-eigene Skills, Jobs und fachliche Notifications

Ein Runtime Broker kann Kernel bleiben, während seine UI eine Extension ist. Das Deaktivieren
einer UI-Extension entfernt Contributions und Listener, beendet aber keine langlebige,
nutzerverwaltete Runtime ohne separate ausdrückliche Nutzeraktion.

### Zulässige `hostOnly`-Ausnahmen

Direkte Host-Logik ist nur für Security, Bootstrap oder Recovery zulässig. Jede Ausnahme:

1. trägt die Kennzeichnung `hostOnly`,
2. benennt die bedrohte Garantie,
3. besitzt einen Test für den Host-Fallback,
4. wird im Decision Log oder einem ADR dokumentiert.

Extension Manager, Recovery, Safe Mode und minimale Security Settings bleiben immer erreichbar
und dürfen von einer Extension weder versteckt noch überschrieben werden.

### Abhängigkeitsrichtung

```text
Apps und Built-in Extensions
        ↓
Extension SDK und UI
        ↓
Extension Contracts
        ↓
Kernel Hosts und Broker
```

Der Kernel importiert keinen Feature-Entry-Point. Built-ins werden über Discovery oder explizite
Bootstrap-Metadaten gefunden. Legacy Adapter dürfen während der Migration Featurecode kennen,
liegen aber außerhalb der dauerhaften Kernel-Grenze und erhalten einen dokumentierten
Entfernungspunkt.

## Konsequenzen

- Bestehende Runtime- und Security-Grenzen bleiben erhalten.
- Neue Features prüfen zuerst, ob die öffentliche Extension API ausreicht.
- Ein fehlender Extension Point wird generisch entworfen, getestet, dokumentiert und in SDK
  sowie Skills aufgenommen, bevor Featurecode entsteht.
- Die Migration benötigt vorübergehend Legacy Built-in Contributions.
- Kerneländerungen erhalten strengere Review-Gates als normale Extensionänderungen.

## Verworfene Alternativen

### Alle bestehenden Features bleiben Core und nur neue Features werden Plugins

Verworfen, weil First-Party-Code die Plattform dann nicht dogfoodet und versteckte Parallel-
APIs bestehen bleiben.

### Jede Runtime wird Extensioncode

Verworfen, weil Security, Recovery und langlebige Prozesse nicht von optionalen sichtbaren
Features abhängen dürfen.

### Generischer Node-Child-Process als Sandbox

Verworfen, weil ein Prozess unter demselben Linux-Benutzer keine belastbare Isolation gegen
direkten Dateisystem- oder Prozesszugriff darstellt.

## Verifikation

- Architekturtests verhindern Featureimporte aus Kernel-Packages.
- Registry-Kollisionen und nicht dokumentierte `hostOnly`-Beiträge schlagen in Tests fehl.
- Disable-Tests beweisen, dass Contributions verschwinden und user-owned Runtimes weiterlaufen.
- Safe-Mode-Tests beweisen, dass Manager und Recovery ohne optionale Extensions starten.

## Folgeentscheidungen

- `extension-runtime-v1.md`
- `extension-permission-model.md`
- `extension-storage.md`
- `extension-ui.md`
- `builtin-extension-migration.md`
