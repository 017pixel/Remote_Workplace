# Extension Authoring

Remote Workplace behandelt neue, optionale Produktfunktionen standardmäßig als Extensions. Der Core stellt Infrastruktur und sichere Contribution Points bereit. Fachliche oder provider-spezifische Werkzeuge gehören nicht automatisch in den Core.

## Schnellstart

```bash
pnpm extension:create benjamin.docker-monitor
pnpm extension:validate extensions/benjamin.docker-monitor
```

Der Scaffolder erzeugt ein gültiges `extension.json` und eine lokale README. Der anfängliche Command ist nur ein Platzhalter und soll durch die tatsächlich benötigten Contributions ersetzt werden.

## Produktgrenze

Im Core bleiben nur Fähigkeiten, die mehrere Extensions zuverlässig benötigen:

- Authentifizierung, Routing und Project Context
- Extension Host, Registry, Lifecycle, Catalog und Permissions
- Datei-, Git-, Terminal- und Prozess-Infrastruktur
- Notification Bus, Realtime und sichere Secret-Vermittlung
- Theme-, Layout- und UI-Primitives
- Preview- und Browser-Infrastruktur

Als First-Party-Extension beginnen oder dorthin migrieren sollen dagegen provider- oder workflow-spezifische Funktionen, zum Beispiel T3 Code, Hermes, Tech TLDRs, spezielle Usage Provider und spezialisierte Dashboards.

## Authoring-Regeln

1. Extension first. Eine neue optionale Funktion verändert den Core standardmäßig nicht.
2. Least privilege. Nur Permissions deklarieren, die die konkrete Funktion benötigt.
3. Contribution first. Bestehende Contributions für Pages, Routes, Navigation, Dashboard, Orbit, Commands, Settings, Terminal, Browser, Agents und Background Services verwenden, bevor neue APIs eingeführt werden.
4. Host UI. Navigation und Produktchrome verwenden Host-Primitives und die kontrollierte Icon Registry. Vendor Branding gehört auf Integrations- oder Detailseiten, nicht in die primäre Navigation.
5. Kein verstecktes Coupling. Eine Extension darf keine internen React-Komponenten oder Servermodule aus dem Core importieren, wenn dafür kein öffentlicher Extension Contract existiert.
6. API-Lücken dokumentieren. Wenn eine Funktion ohne Core-Änderung unmöglich ist, zuerst die fehlende generische Capability beschreiben. Die Core-Erweiterung muss mindestens zwei realistische Extension-Anwendungsfälle unterstützen oder eine zwingende Plattform-/Sicherheitsfunktion sein.
7. Reproduzierbar validieren. Vor Installation mindestens Manifest-Validation, betroffene Tests, Typecheck und Build ausführen.

## Manifest als Source of Truth

`extension.json` wird ausschließlich gegen `@workbench/extension-contracts` validiert. Eigene parallele Manifesttypen oder lockere JSON-Prüfungen sind nicht erlaubt.

Der Validator baut das Contract-Paket und verwendet anschließend direkt `extensionManifestSchema`:

```bash
pnpm extension:validate extensions/meine.extension
```

Ohne Pfadangabe werden alle `extension.json` unter `extensions/` geprüft.

## Permissions

Permissions werden klein gehalten und nach Capability geschnitten. Beispiele:

- nur lesen: `projects.read`, `files.read`, `git.read`
- mutieren nur bei Bedarf: `projects.write`, `files.write`, `git.write`
- Prozesszugriff nur für echte Runtime-Funktionen: `process.execute`
- Agent Integration getrennt: `agents.invoke`, `agents.tools.register`, `agents.skills.register`
- Systemdienste getrennt lesen und steuern: `system.services.read`, `system.services.control`

Ein Agent darf bei einer bestehenden Extension Permissions nicht stillschweigend erweitern. Neue Rechte müssen im Diff und in der Permission Review sichtbar sein.

## Lokaler Catalog

Die Server-Runtime verwendet ihren konfigurierten `dataDirectory` und darunter `extension-catalog` als lokalen Catalog. Der Repository-Ordner `extensions/` ist dagegen der versionierbare Authoring-Ort für First-Party- und Entwicklungs-Extensions.

Der Build-/Installationsschritt darf beide Orte nicht verwechseln. Erst validieren, dann das fertige Paket kontrolliert in den Runtime-Catalog übernehmen und über die bestehende Extension-Verwaltung installieren oder aktualisieren.

## Definition of Done

Eine Extension ist fertig, wenn:

- ihr Manifest gegen den öffentlichen Contract validiert,
- keine unnötigen Permissions vorhanden sind,
- Navigation und UI dem Host-System folgen,
- Loading-, Empty-, Error- und Permission-Zustände berücksichtigt sind,
- betroffene Tests sowie Typecheck und Build grün sind,
- Installation, Aktivierung, Deaktivierung, Update und Deinstallation den bestehenden Lifecycle nicht umgehen,
- keine neue Core-Abhängigkeit ohne dokumentierte API-Lücke entstanden ist.
