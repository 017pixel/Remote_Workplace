# ADR: Local Extension Catalog V1

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

V1 soll ungefähr zehn optionale First-Party Extensions anbieten und gleichzeitig den späteren
Installations-, Update- und Recoverypfad real testen. Dafür ist keine öffentliche Registry
nötig. Eine Online-Infrastruktur würde Accounts, Publisher Trust, Paketverteilung und Isolation
erzwingen, bevor der lokale Plattformvertrag stabil ist.

## Entscheidung

V1 verwendet ausschließlich lokale serverseitige Sources:

1. mit Remote Workplace ausgelieferter bundled Local Catalog,
2. explizit registriertes lokales Entwicklerverzeichnis,
3. lokales `.rwext`-Paket.

Es gibt keinen öffentlichen Marketplace, keine Remote Registry und keine Installation über npm,
Git, GitHub oder HTTP. Catalog Listing, Installation, Updates und Status funktionieren ohne
Internetverbindung.

### Catalog Provider

Der Manager konsumiert einen kleinen internen Providervertrag:

```ts
interface ExtensionCatalogProvider {
  readonly id: string;
  list(): Promise<readonly CatalogEntry[]>;
  get(id: ExtensionId): Promise<CatalogEntry | null>;
  resolvePackage(id: ExtensionId, version: string): Promise<LocalPackage>;
}
```

V1 implementiert ausschließlich `LocalCatalogProvider`. Der Vertrag hält Discovery und Manager
getrennt, ist aber keine Vorwegnahme eines Remote Providers. Ein späterer Catalog Provider
benötigt einen neuen Security-, Trust- und Distribution-ADR.

### Paketablage

- Source Extensions liegen im Monorepo unter `extensions/catalog/<name>`.
- Release Builds erzeugen versionierte, integritätsgeprüfte lokale Catalog-Pakete.
- Catalog-Metadaten werden serverseitig gelesen und nicht in das initiale Webbundle eingebettet.
- Lokale Icons, README, Changelog und Screenshots sind Paketassets. Remote Tracking URLs sind
  unzulässig.
- `.rwext` ist ein lokales, versioniertes Archivformat mit `extension.json` an einer festen
  Wurzel. Archivpfade werden vor dem Entpacken gegen absolute Pfade, Traversal und Symlinks
  geprüft.

### Einheitlicher Installationspfad

Auch ein bundled First-Party-Paket durchläuft:

```text
Resolve Local Package
→ Staging
→ Manifest Validation
→ Compatibility und Dependency Check
→ Permission Diff/Review
→ Integrity und sichere Archivpfade
→ Backup
→ versioniertes Install Directory
→ Storage Provisioning
→ Migration
→ Health Check
→ Atomic Activate
→ Contribution Registration
```

Ein Installationslock serialisiert Mutationen pro Extension ID. Staging-Reste sind nach Crash
erkennbar und recovery-fähig. `current` wechselt erst atomar nach erfolgreichem Health Check.

### Trust und Ausführung

| Source | Effektiver Trust | Regel |
| --- | --- | --- |
| required system | `system` | mit Kernel ausgeliefert, nicht deinstallierbar |
| Built-in | `builtin` | First-Party im Monorepo, öffentliche APIs |
| Local Catalog | `catalog-first-party` | optional, nur geprüfter mitgelieferter Code |
| Entwicklerverzeichnis | `developer` | explizit registriert, Servercode ist sichtbar Full Trust |
| UI-only Webview | `sandboxed-webview` | isoliertes iframe und validierte Bridge |

Der Manifestwert allein erhöht Trust nie. Der Manager leitet effektiven Trust aus Source und
bekannter Paketprovenance ab. Developer Extensions mit Node-Code erhalten eine klare Warnung,
weil ein Child Process unter demselben Linux-Benutzer keine Security Sandbox ist.

### Updates und Rollback

- Es gibt keine Remote-Update-Abfrage.
- Ist eine mit einer neuen Workbench-Version gelieferte Catalog-Version neuer als die lokal
  installierte, erscheint `update-available`.
- Eine zusätzliche Permission stoppt die Aktivierung bei `permissions-pending`, bis der Benutzer
  den Diff bestätigt.
- Die vorherige installierte Version und ein Datenbackup bleiben bis zum erfolgreichen Health
  Check als Rollback-Ziel erhalten.
- Ist die installierte Version neuer als der Catalog, erfolgt kein automatischer Downgrade.

### Deinstallation und Daten

Deinstallation entfernt standardmäßig Code und Contributions, behält aber Extension-Daten.
Datendestruktion ist eine getrennte, explizite Nutzerentscheidung. Required System Extensions
können weder deaktiviert noch deinstalliert werden. Abhängige Extensions verhindern oder
koordinieren Disable/Uninstall deterministisch.

## Nicht Teil von V1

- Remote Catalog Provider oder CDN
- Marketplace Backend, Supabase, Convex oder GitHub Registry
- Publisher Accounts, Verifikation und Community Uploads
- Suche außerhalb des lokalen Catalogs
- Bewertungen, Kommentare, Zahlungen oder Submission Pipeline
- automatische Installation aus npm, Git, GitHub oder URLs

## Konsequenzen

- V1 testet den echten Manager ohne externe Betriebsabhängigkeit.
- Catalog Updates werden mit Remote-Workplace-Releases verteilt.
- Nur First-Party-Code darf optional serverseitig aus dem Catalog laufen.
- Die Extensions-UI kann später einen weiteren Provider darstellen, ohne heute einen zu bauen.

## Verworfene Alternativen

### Frontend-Boolean für installiert

Verworfen, weil dadurch Staging, Migration, Permissions, Integrity, Recovery und Lifecycle
ungetestet blieben.

### GitHub-Repository als V1 Registry

Verworfen, weil es eine Remote Source, Trust- und Updateinfrastruktur einführen würde.

### npm-Pakete direkt installieren

Verworfen wegen Supply-Chain-, Lifecycle- und Reproduzierbarkeitsrisiken.

## Verifikation

- Installationsfixtures prüfen fehlende, ungültige und inkompatible Pakete.
- Crash-Tests prüfen Staging Cleanup, atomare Aktivierung und Rollback.
- Offline-E2E installiert, deaktiviert, aktiviert und deinstalliert eine Catalog Extension.
- Update-Tests prüfen Permission Expansion sowie neuere installierte Versionen.

## Folgeentscheidungen

- `extension-runtime-v1.md`
- `extension-storage.md`
- `extension-permission-model.md`
- `extension-ui.md`
