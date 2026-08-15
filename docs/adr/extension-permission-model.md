# ADR: Extension Permission Model V1

- Status: accepted
- Datum: 2026-08-15
- Entscheider: Remote Workplace
- Geltungsbereich: Extension Platform V1

## Kontext

Extensions benötigen Zugriff auf Projekte, Dateien, Prozesse, Netzwerk, Runtimes und weitere
Kernel-Funktionen. Direkter Zugriff würde die bestehenden Sicherheitsgrenzen umgehen. Ein
Manifest darf außerdem weder Vertrauen noch Grants selbst festlegen. Besonders Developer-
Extensions mit direktem Node-Code laufen in V1 weiterhin unter demselben Linux-Benutzer und
sind dadurch nicht technisch sandboxed.

Permission Requests müssen deshalb stabil, verständlich diffbar und enger als bloße Strings
sein. Gleichzeitig darf das Schema keine Hostpfade, Secret-Werte oder beliebigen Command-Text
als vermeintlichen Sicherheitsumfang persistieren.

## Entscheidung

Manifest V1 verwendet ausschließlich strukturierte Permission Requests:

```json
{
  "permission": "files.read",
  "scope": {
    "projects": ["current", "id:remote-workplace"]
  }
}
```

Jede Permission darf pro Manifest nur einmal vorkommen. Ein fehlender `scope` fordert den
weiten, serverweiten Umfang der Capability an. Das ist kein automatischer Grant und umgeht
keine Broker-Regeln. Ein vorhandener Scope schränkt den Request ein. Leere oder unbekannte
Scopes werden fail-closed abgelehnt.

### Permission IDs V1

| Bereich | Permission IDs |
| --- | --- |
| Projects | `projects.read`, `projects.write` |
| Files | `files.read`, `files.write` |
| Git | `git.read`, `git.write` |
| Terminal | `terminal.create`, `terminal.input` |
| Process | `process.execute` |
| Network | `network.fetch` |
| Notifications | `notifications.create` |
| Browser | `browser.control` |
| Preview | `preview.read`, `preview.manage` |
| Agents | `agents.invoke`, `agents.tools.register`, `agents.skills.register` |
| Storage | `storage.read`, `storage.write` |
| Secrets | `secrets.request` |
| System | `system.metrics.read`, `system.services.read`, `system.services.control` |

Der Host ordnet jeder ID genau eine Risikostufe zu: `normal`, `sensitive` oder
`highly-privileged`. Eine Extension kann ihre Einstufung nicht im Manifest verändern. Die UI
übersetzt diese Werte verständlich als normal, sensitiv und hochprivilegiert.

### Scope-Typen

Project Scopes verwenden `current` für den aktuellen Projektkontext oder `id:<project-id>` für
eine stabile explizite Projektidentität. Der Präfix verhindert Kollisionen zwischen dem
Kontextselektor und einem realen Projekt namens `current`.

Process Scopes enthalten Projektselektoren, exakte ausführbare Dateinamen oder beides. Pfade,
Argumente und Shell-Text sind nicht Teil des Grants. Der spätere Process Broker prüft weiterhin
Command Policy, `cwd`, Environment, Timeout, Output-Limit, Abort und Child Cleanup.

Network Scopes enthalten exakte kleingeschriebene DNS-Hostnamen. Wildcards, URLs, IP-Literale
und `localhost` werden nicht als Scoped Host akzeptiert. Der Network Broker prüft unabhängig
davon Scheme, Port, DNS-Auflösung, private und link-lokale Ziele, Redirects, Timeout und
Payload-Limit bei jedem Request erneut. Ein globaler Network Request hebt diese SSRF-Regeln
nicht auf.

Secret Scopes referenzieren logische Secret-Namen, niemals Werte. Service Scopes referenzieren
exakte systemd-Service-Units. Filesystem-Zugriff wird über Project Scopes begrenzt; jeder
konkrete Pfad wird später zusätzlich kanonisch gegen die erlaubte Projektwurzel aufgelöst.

### Requests, Grants und Trust

- Das Manifest enthält Requests, nicht Grants.
- Grants sind serverseitiger, auditierter Extension-State.
- Ein Grant darf einen Request einschränken, aber niemals erweitern.
- Eine neue Extension-Version mit zusätzlichen IDs oder weiterem Scope bleibt
  `permissions-pending`, bis der Benutzer den Diff bestätigt.
- Entzogene Grants wirken beim nächsten Broker-Aufruf und werden nicht aus Browserzustand
  rekonstruiert.
- Agenten dürfen Requests erzeugen und fehlende Grants melden, aber keine Grants setzen,
  Trust ändern oder die Permission-Datenbank bearbeiten.
- Ownership, Same-Origin, Mutation-Origin, Rate Limits und Audit bleiben zusätzliche
  unabhängige Kernel-Prüfungen.

`system` und `builtin` beschreiben Provenance, nicht automatisch unbegrenzte Rechte. Explizite
`hostOnly`-Ausnahmen sind nur für Security, Bootstrap oder Recovery zulässig und müssen separat
dokumentiert werden.

Developer-Extensions mit Server-Entrypoint besitzen faktisch Full Trust, solange beliebiger
Node-Code unter demselben Linux-Benutzer läuft. Permission Checks sind dort Plattformvertrag
und Auditgrenze, aber keine OS-Sandbox. Sandboxed Webviews erhalten ausschließlich validierte
Bridge-Funktionen im Umfang ihrer Grants.

## Konsequenzen

- Permission-Diffs bleiben stabil, namespaced und maschinenlesbar.
- UI, CLI, Manager und Capability Broker können dieselben Request-Typen verwenden.
- Scope-Felder sind auf logische Identitäten begrenzt und enthalten keine Secrets oder
  Hostpfade.
- Ein fehlender Scope ist sichtbar breiter und muss in Review und UI entsprechend dargestellt
  werden.
- Die spätere Grant-Persistenz benötigt eine Teilmengenprüfung pro Scope-Typ.

## Verworfene Alternativen

### Nur String-Permissions

Verworfen, weil Projekt-, Host-, Command-, Secret- und Service-Grenzen nicht ausdrückbar wären.

### Browserseitige Grants

Verworfen, weil Browserzustand manipulierbar, gerätespezifisch und nicht autoritativ ist.

### Beliebige JSON-Scopes

Verworfen, weil Tippfehler, inkompatible Semantik und still ignorierte Sicherheitsgrenzen
entstehen würden.

### Pfade als Filesystem-Scope

Verworfen, weil Hostpfade nicht paketportabel sind und Symlink-/Realpath-Sicherheit ohnehin bei
jeder Operation im Filesystem Broker geprüft werden muss.

### Node Child Process als Sandbox

Verworfen, weil ein Prozess unter demselben Linux-Benutzer direkten Zugriff außerhalb des
Capability Brokers erlangen kann.

## Verifikation

- Contract-Tests decken alle Permission IDs und die vollständige Risikomatrix ab.
- Negative Tests prüfen unbekannte IDs, falsche Scope-Typen, doppelte Requests und doppelte
  Scope-Werte.
- Security-nahe Fixtures prüfen Project Traversal, Command Paths, Host-Wildcards, IP-Literale,
  Secret-Referenzen und Service-Wildcards.
- Das generierte Manifest-JSON-Schema enthält dieselben Request-Varianten und wird gegen Drift
  geprüft.

## Folgeentscheidungen

- `extension-runtime-v1.md`
- `extension-storage.md`
- `extension-server-authority.md`
