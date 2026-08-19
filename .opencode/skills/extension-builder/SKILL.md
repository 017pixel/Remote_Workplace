---
name: extension-builder
description: Baut, erweitert und repariert Wrapt-Extensions nach dem Extension-first-Prinzip. Nutze diesen Skill für neue Seiten, Tools, Dashboards, Agent-Integrationen, Browser-/Terminal-Funktionen, Background Services oder andere optionale Produktfeatures, die als Extension umgesetzt werden sollen. Erzwingt minimale Permissions, bestehende Contribution Points, Host-UI-Konventionen, Manifest-Validation und vollständige Verifikation, bevor Core-Code verändert wird.
metadata:
  opencode/slash: "true"
---

# Wrapt Extension Builder

Ziel: Eine angeforderte Funktion möglichst vollständig als Extension umsetzen, ohne unnötig den Core zu verändern. Der Core ist Plattform-Infrastruktur. Provider-, Workflow- und Nutzerfunktionen gehören standardmäßig in Extensions.

## Harte Regeln

1. **Extension first.** Beginne nicht mit Änderungen in `apps/web`, `apps/server` oder Core-Packages. Prüfe zuerst, ob die Funktion über bestehende Extension Contributions lösbar ist.
2. **Kein stiller Core-Fallback.** Wenn eine Capability fehlt, dokumentiere die konkrete API-Lücke. Ändere den Core nur, wenn die Lücke generisch ist und nicht nur die aktuelle Extension bevorzugt.
3. **Least privilege.** Fordere ausschließlich Permissions an, die tatsächlich benutzt werden. Erweiterungen bestehender Permissions müssen im Ergebnis ausdrücklich genannt werden.
4. **Keine internen Imports.** Extension-Code importiert keine privaten React-Komponenten, Stores, Servermodule oder Datenbankdetails aus dem Core, sofern sie nicht Teil einer veröffentlichten Extension API sind.
5. **Host statt Vendor-Chrome.** Navigation, Toolbar, Buttons, Loading-, Empty- und Error-Zustände verwenden Host-Primitives und Host-Icons. Vendor-Logos dürfen in einer Integrations-/Detailansicht vorkommen, nicht als primäres Navigationssymbol.
6. **Kleine Diffs.** Keine Nebenrefactors. Keine Formatierung fremder Dateien. Keine Architekturänderung ohne Notwendigkeit.
7. **Keine Erfolgsmeldung ohne Verifikation.** Manifest, Tests, Typecheck und Build müssen geprüft werden. Bei einem Fehler Ursache nennen und den Fix versuchen.

## Schritt 1: Aufgabe in Capabilities zerlegen

Extrahiere aus der Anfrage nur die benötigten Fähigkeiten. Ordne jede Fähigkeit einem vorhandenen Contribution Point zu.

Bevorzugte Contribution Points:

- Befehle: `commands`
- eigene UI: `pages` + `routes`
- Navigation: `navigation`
- Workbench/Canvas: `orbit`
- Dashboard: `dashboard`
- Einstellungen: Settings Contributions
- Statusleiste / Topbar / Kontextmenüs: entsprechende UI Contributions
- Dateien und Git: File Contributions plus minimale File-/Git-Permissions
- Terminal: Terminal Contributions und Terminal-Permissions
- Browser / Preview: Browser- und Preview-Contributions
- Notifications: Notification Contributions
- Agenten: Agent Tool und Agent Skill Contributions
- Hintergrundarbeit: Background Services, Scheduled Jobs und Realtime Contributions
- HTTP/RPC: öffentliche HTTP/RPC Contributions
- Theme: Theme Contributions

Lies bei Unsicherheit die Contracts unter `packages/extension-contracts/src/`. Erfinde kein Manifestfeld.

## Schritt 2: Neue Extension scaffolden

Für eine neue Extension:

```bash
pnpm extension:create <publisher.name>
```

Standardpfad ist `extensions/<publisher.name>/`.

Nutze eine stabile, namespaced ID, zum Beispiel:

```text
benjamin.docker-monitor
wrapt.t3-code
wrapt.hermes
```

Passe danach `extension.json` an. Entferne den generierten Platzhalter-Command, sobald echte Contributions vorhanden sind.

Für eine bestehende Extension keinen zweiten Ordner anlegen. Bestehendes Manifest, aktuelle Permissions und Lifecycle zuerst lesen.

## Schritt 3: Manifest entwerfen

Das Manifest ist die Source of Truth.

Pflichtprinzipien:

- `manifestVersion` nicht frei erhöhen.
- `engines.remoteWorkplace` und `engines.extensionApi` passend zum vorhandenen Contract lassen.
- nur echte `entrypoints` deklarieren.
- nur nötige `activationEvents` verwenden.
- Contributions so klein wie möglich halten.
- IDs innerhalb der Extension konsistent namespacen.
- keine Route oder Navigation ohne klaren Zweck.
- `visibleByDefault` nur verwenden, wenn die Funktion im normalen Workflow wirklich sichtbar sein soll.

## Schritt 4: Permissions ableiten

Erstelle intern eine Capability-zu-Permission-Liste. Beispiele:

- Projekt lesen: `projects.read`
- Projekt ändern: `projects.write`
- Dateien lesen/schreiben: `files.read`, `files.write`
- Git lesen/schreiben: `git.read`, `git.write`
- Terminal erstellen/Eingabe: `terminal.create`, `terminal.input`
- Prozesse: `process.execute`
- Netzwerk: `network.fetch`
- Browser: `browser.control`
- Preview: `preview.read`, `preview.manage`
- Agent aufrufen: `agents.invoke`
- Agent Tools/Skills registrieren: `agents.tools.register`, `agents.skills.register`
- Notifications: `notifications.create`
- Storage: `storage.read`, `storage.write`
- Secrets: `secrets.request`
- Systemmetriken: `system.metrics.read`
- Dienste: `system.services.read`, `system.services.control`

Wenn nur gelesen wird, keine Write-/Control-Permission anfordern.

## Schritt 5: Implementieren

Arbeite ausschließlich im Extension-Ordner, solange keine bestätigte API-Lücke besteht.

UI-Regeln:

- bestehende Host-Primitives verwenden, sofern öffentlich verfügbar,
- keine neue globale Farbpalette einführen,
- Produkticons monochrom und semantisch halten,
- responsive Desktop- und Mobile-Zustände berücksichtigen,
- Loading, Empty, Error, Offline und Permission-Denied explizit behandeln,
- destruktive Aktionen bestätigen,
- Accessibility-Namen und Fokuszustände prüfen.

Server-/Runtime-Regeln:

- keine Secrets in Manifest, Client-Bundle oder Logs,
- Prozesse und Shell-Eingaben nicht aus untrusted Strings zusammensetzen,
- Netzwerkzugriffe und Dateipfade auf deklarierte Scopes begrenzen,
- Hintergrunddienste sauber stoppbar machen,
- Update/Disable/Uninstall dürfen keine verwaisten Prozesse hinterlassen.

## Schritt 6: API-Lücke behandeln

Wenn die Extension nicht implementierbar ist:

1. Stoppe den Workaround über interne Imports.
2. Beschreibe exakt: gewünschte Capability, vorhandener nächster Contribution Point, fehlende Operation.
3. Prüfe mindestens einen zweiten plausiblen Extension-Anwendungsfall.
4. Ergänze nur die kleinste generische Contract-/Host-Capability.
5. Schreibe Contract- und Runtime-Tests.
6. Kehre danach zur Extension zurück.

Core-Änderungen sind Infrastrukturänderungen, nicht Teil der Feature-Implementierung selbst.

## Schritt 7: Validieren

Mindestens:

```bash
pnpm extension:validate extensions/<extension-id>
pnpm typecheck
pnpm test
pnpm build
```

Wenn die Änderung nur einen klar abgegrenzten Workspace betrifft, darf zuerst gezielt getestet werden. Vor Abschluss muss aber mindestens die relevante Repo-Qualitätskette erfolgreich sein oder ein nicht durch die Änderung verursachter Blocker konkret belegt werden.

Zusätzlich prüfen:

- Extension erscheint korrekt im Catalog.
- Install funktioniert.
- Permission Review zeigt nur erwartete Rechte.
- Enable und Disable funktionieren.
- Update-Pfad bleibt valide.
- Uninstall entfernt Runtime-Aktivität sauber.
- Route, Navigation und Mobile-Darstellung funktionieren, falls vorhanden.

## Schritt 8: Ergebnis melden

Am Ende kurz berichten:

- Extension-ID und Pfad
- implementierte Contributions
- angeforderte Permissions
- geänderte Core-Dateien, normalerweise keine
- Verifikationsergebnisse
- verbleibende API-Lücken oder Risiken

Wenn Core-Dateien geändert wurden, begründe für jede Datei, weshalb die Funktion nicht rein als Extension möglich war.
