# ADR: Built-in Extension Migration

- Status: accepted
- Datum: 2026-08-17
- Geltungsbereich: Extension Platform V1

## Kontext

Die Frontend-Registries bilden viele bestehende Produktflächen bereits als Contributions ab. Ihre Registrierung erfolgt während der Migration jedoch noch über mehrere `legacy*` Bootstrap-Module. Ohne eine zentrale Grenze kann jede neue Funktion wieder direkt in die App Shell eingebaut werden und die Extension-first-Architektur schleichend umgehen.

## Entscheidung

Die App Shell kennt genau einen Built-in-Einstiegspunkt: `bootstrapBuiltinContributions()` in `apps/web/src/extensions/builtinContributions.ts`.

Alle bestehenden Legacy-Adapter bleiben vorübergehend hinter dieser Grenze. Neue optionale Produktfunktionen dürfen keine weiteren direkten Bootstrap-Imports in `main.tsx`, `App.tsx` oder anderen Host-Einstiegspunkten hinzufügen.

`pnpm architecture:extensions` prüft diese Regel und ist Teil von `pnpm quality`.

## Dauerhafter Core

Im Core bleiben generische oder sicherheitskritische Plattformfähigkeiten:

- Identity, Auth, CSP, Origin- und Path-Security
- Extension Discovery, Contracts, Registry, Lifecycle, Permissions und Recovery
- Router Host und minimale App Shell
- Project Identity und sichere Project-Path-Auflösung
- Terminal-, Browser-, Preview-, Filesystem-, Process-, Network-, Git- und Secrets-Broker
- Notification Infrastructure, Event Bus, Scheduler und Storage
- Design Tokens, UI-Primitives und Accessibility-Grundlagen

Ein Broker darf Core bleiben, auch wenn seine sichtbare Oberfläche als Extension ausgeliefert wird.

## First-Party-Extension-Ziel

Folgende sichtbare Produktflächen sollen schrittweise aus Legacy-Adaptern oder direktem Feature-Wiring in installierbare First-Party-Extensions überführt werden:

| Priorität | Produktfläche | Ziel |
| --- | --- | --- |
| P1 | T3 Code UI | First-Party-Integration über öffentliche Route-, Navigation-, Browser-/Editor-Bridge-Capabilities |
| P1 | Hermes UI | First-Party-Agent-Integration; Runtime-Broker darf Core bleiben |
| P1 | Tech TLDRs | vollständig optionale Content-/Dashboard-Extension |
| P2 | Usage Provider | provider-spezifische Datenquellen und Karten als Extensions |
| P2 | Skills UI | Host kann Agent-Skill-Infrastruktur bereitstellen, sichtbare Verwaltung als Built-in Extension |
| P2 | spezialisierte Dashboard Sections | einzelne Dashboard Contributions statt Shell-Wiring |
| P3 | code-server UI | sichtbare Integration als Extension, Runtime-/Proxy-Broker bleibt Core |
| P3 | Inbox-Adapter | fachliche Quellen als Extensions, Notification Infrastructure bleibt Core |

Diese Tabelle ist eine Migrationsreihenfolge, kein Auftrag, die langlebigen Runtime-Broker zu entfernen.

## Migrationsregel pro Feature

Ein Feature gilt erst als migriert, wenn:

1. Manifest und benötigte Contributions im First-Party-Paket liegen.
2. Die Extension ausschließlich öffentliche Contracts und Capability APIs nutzt.
3. Permissions minimal sind und über den normalen Permission Review laufen.
4. Aktivieren, Deaktivieren, Update und Deinstallieren ohne Sonderpfad funktionieren.
5. Die Host UI ohne die Extension weiterhin startet und Recovery/Extension Manager erreichbar bleiben.
6. Der entsprechende `legacy*` Adapter entfernt oder auf reine generische Kompatibilitätslogik reduziert wurde.
7. Tests beweisen, dass Disable die sichtbaren Contributions entfernt, ohne user-owned Runtimes unbeabsichtigt zu beenden.

## Neue Features

Ab dieser Entscheidung gilt:

- Neue optionale Seite: Extension.
- Neue provider-spezifische Integration: Extension.
- Neues Dashboard Widget: Extension Contribution.
- Neues Agent Tool oder Skill: Agent Contribution.
- Neuer Hintergrundjob für eine Fachfunktion: Extension Job/Service.
- Neue Core API: nur für eine generische Capability oder Security-/Recovery-Garantie.

Eine einzelne Feature-Anforderung ist kein ausreichender Grund für eine neue private Core-API.

## Architektur-Gate

`scripts/extensions/check-boundary.mjs` verhindert direkte `legacy*`-Imports und `bootstrapLegacy*`-Aufrufe außerhalb der Extension-Boundary. Die Liste der temporären Built-in-Bootstraps ist dort explizit. Entfernt eine Migration einen Adapter, muss die Gate-Liste im selben PR angepasst werden.

So wird der Abbau der Legacy-Schicht sichtbar und monoton: neue Legacy-Einstiegspunkte entstehen nicht unbemerkt.

## Konsequenzen

- Die App Shell wird kleiner und kennt keine einzelnen Produktfeatures mehr.
- First-Party-Code muss dieselben Extension-Pfade dogfooden wie lokale Erweiterungen.
- Bestehende Runtimes können stabil weiterlaufen, während ihre Oberflächen schrittweise migriert werden.
- API-Lücken werden generisch im Extension-System gelöst statt durch Feature-Sonderwege.
- Kleine Coding-Agenten können Änderungen enger auf einen Extension-Ordner begrenzen.
