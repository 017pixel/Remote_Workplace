# Lokale Previews für Agenten

Diese Seite beschreibt, wie Coding-Agenten mit den lokalen Development-Previews
arbeiten: Service-Graph, Diagnosequellen, Testharness, Tailscale-Abnahme und der
gefilterte Zugriff auf höchstens sieben Tage Preview-Logs.

## Was eine lokale Preview ist — und was nicht

Eine Preview ist ein direktes iframe auf eine dedizierte Slot-Origin, die einen
lokalen Devserver weiterleitet. Sie ist **kein** allgemeiner Webbrowser.

| Fähigkeit | Status |
|---|---|
| SPA, MPA, HMR, WebSocket, EventSource | unterstützt |
| Bestätigte Full-Stack-Graphen (Frontend + API + Socket) | unterstützt |
| localStorage/IndexedDB je Slot getrennt | ja, pro Origin |
| Cookies je Slot getrennt | **nein** — Cookies gelten hostweit, Ports isolieren sie nicht |
| Externe Websites | nie über den Gateway; Client-Browser oder Server-Chromium |
| Vollständige Geräteemulation (DPR, Safe Area, Engine) | nein, nur angenähert |
| Vollständige Netzwerksicht wie CDP/DevTools | nein, Best Effort |

## Service-Graph

1. `localPortService` erkennt Listener, PID, Prozessnamen und Protokoll.
2. Der Kandidaten-Scan ergänzt kanonischen Prozess-CWD, bestes passendes
   registriertes Projekt, statisch gelesene `package.json`-Scripts, bekannte
   Framework-Hinweise und eine WebSocket-Probe.
3. Kandidaten sind **Vorschläge**. Verbunden wird erst nach ausdrücklicher
   Bestätigung durch den Benutzer.
4. Vor dem Speichern zeigt die Oberfläche benötigte Slots, wiederverwendbare
   Bindings und die verbleibende Kapazität. Ein Graph, der die Kapazität
   überschreitet, wird nicht teilweise aktiviert (`PREVIEW_CAPACITY_EXCEEDED`).

Fremde Vite-, Next- oder Svelte-Konfiguration wird niemals importiert oder
ausgeführt; gescannt wird ausschließlich innerhalb registrierter Projektpfade.

## Diagnosequellen

Jedes Ereignis nennt seine Quelle und seine Vollständigkeit:

- `client` — Console, JavaScript-Fehler, Ressourcenfehler, Fetch/XHR, Performance
- `gateway` — HTTP-Proxy, Status, Laufzeit, Redirects, Bridge-Injektionsstatus
- `socket` — WebSocket-/EventSource-Zustand
- `system` — Slot, Lease, Reset, Service-Graph
- `inferred` — als Vermutung gekennzeichnete CORS-/Routingursache

`completeness` ist `complete`, `partial` oder `inferred`. Requests aus Workern,
Service Workern und Browser-internen Mechanismen erscheinen **nicht**.

## Arbeiten mit aktiven Previews

Preview-Sessions, Slots und Devserver gehören dem Nutzer und laufen oft über Stunden. Diese
Regeln gelten für Coding-Agenten, die neben aktiven Previews arbeiten.

- Laufende Preview-Devserver sind auf dem eigenen tmux-Socket `wrapt-previews`
  laufende Sessions mit Namen `workbench-preview-<hash>` und dem
  Marker `@wrapt_kind=preview-dev-server`. Sie werden **niemals** gestoppt, neu gestartet
  oder gekillt — weder über tmux, `kill`/`pkill`/`fuser` noch über die Devserver-API
  (`POST /api/v1/previews/dev-servers/:projectId/stop|restart`). Stirbt ein Devserver,
  startet ihn die Wrapt selbst wieder (Auto-Restart mit Backoff).
- Eigene Testserver nur auf freien Ports starten. Vorher prüfen, ob der gewünschte Port von
  einem aktiven Preview genutzt wird: lokale Portübersicht in der Wrapt (Dashboard →
  „Lokale Ports") oder `GET /api/v1/services/ports`. Ein Port, auf dem ein Preview-Devserver
  lauscht, ist tabu.
- Preview-Sessions des Nutzers werden nicht geschlossen (`DELETE /api/v1/previews/sessions/...`
  und `/previews/sessions/by-key/...`), und direkte Slot-Zuweisungen werden nicht geändert
  (`PUT /api/v1/previews/slots`). Slots gibt der Nutzer über die Oberfläche frei; abgelaufene
  Sessions räumt das System nur bei Slot-Knappheit ab.
- Der Doctor (`bash scripts/preview-doctor.sh`) ist reine Diagnose. `--probe` erneuert nur
  Vorschläge; er schließt keine Session, bestätigt keinen Reset und ändert keine Zuweisung.
- Zeigt ein Preview beim Neuladen „Preview nicht aktiv" (503) oder „nicht erreichbar" (502),
  wird **nichts neu konfiguriert**. Stattdessen: Devserver-Status abfragen
  (`curl -s http://127.0.0.1:3010/api/v1/previews/dev-servers/<projekt-id>`), bei Bedarf den
  Hub-Status (`/api/v1/previews/doctor/status`) lesen und das Ergebnis dem Nutzer melden.
  Der Slot erholt sich von selbst, sobald der Devserver wieder läuft; die 502-Seite lädt sich
  dann automatisch neu.

## Zugriff auf Preview-Logs (max. sieben Tage)

**Verbindliche Regeln:**

- Agenten dürfen Preview-Logs lesen, wenn sie für eine aktuelle Diagnose nötig
  sind oder der Benutzer den Zugriff ausdrücklich verlangt.
- Ohne Diagnosebedarf werden Logs **nicht** vorsorglich oder flächendeckend
  durchsucht.
- Standardzugriff läuft über die redigierte API oder den Doctor, nicht direkt
  über die JSONL-Dateien.
- Zeitraum, Preview, Slot und Severity werden so weit wie möglich eingegrenzt.
  Niemals pauschal sieben Tage laden oder zitieren.
- Ergebnisse werden zusammengefasst. Secrets, Tokens, Cookies und
  personenbezogene Inhalte werden nicht in Antworten kopiert.
- Logs werden niemals ohne ausdrückliche Benutzerfreigabe an externe Dienste
  übertragen.

```bash
bash scripts/preview-doctor.sh --logs \
  --since <1h|24h|7d> \
  [--preview <previewNodeId>] \
  [--severity <debug|info|warn|error>]
```

Ohne `--since` gilt eine Stunde; erlaubt sind maximal sieben Tage. Der Doctor
liest das Capability-Token aus `<paths.dataDir>/preview-agent-capability`
(Modus `0600`) und spricht ausschließlich über Loopback. Er darf systemweite
Probes und Vorschlagsneubau auslösen sowie redigierte Logs lesen — er darf
**keine** aktive Benutzersession schließen, keinen Storage-Reset bestätigen,
keinen Snapshot lesen und keine Benutzerpräferenz ändern.

Typische Abfragen:

```bash
# Letzte Fehler einer Preview
bash scripts/preview-doctor.sh --logs --since 1h --preview <nodeId> --severity error

# Routingfehler und Slot-Zustand
bash scripts/preview-doctor.sh --status

# HMR-/WebSocket-Abbrüche der letzten 24 Stunden
bash scripts/preview-doctor.sh --logs --since 24h --severity warn

# Dienste erneut prüfen (nur Vorschläge, keine Verbindung)
bash scripts/preview-doctor.sh --probe
```

**Direkter Dateizugriff** auf `<paths.dataDir>/preview-logs/` ist nur erlaubt,
wenn Diagnose-API oder Doctor selbst defekt sind, wenn der Logger untersucht
werden muss oder wenn der Benutzer es ausdrücklich verlangt. Auch dann gelten
Redaction, minimale Zeitspanne und lokale Verarbeitung. Komprimierte ältere Tage
und `index.json` liest der Doctor transparent; die Rotation muss niemand selbst
umgehen.

Preview-Logs sind **Best-Effort-Diagnose** und besitzen nicht die
Vollständigkeit von CDP oder Chrome DevTools.

## Redaction

Immer entfernt: `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`,
bekannte Token-/Secret-Header und URL-Credentials. Standardmäßig zusätzlich:
Query-Werte bekannter Secret-Parameter, E-Mail-Adressen, Tokens in strukturierten
Metadaten und Request-/Response-Bodies vollständig. Persistierte Logs führen
`userId` nur als stabiles HMAC-Pseudonym; der Schlüssel liegt separat unter
`<paths.dataDir>/preview-log-hmac.key`.

Eine zeitlich begrenzte Rohdiagnose (maximal 15 Minuten, pro Preview, mit
sichtbarem Indikator und Audit-Eintrag) ändert daran nichts: Cookies und
Authorization-Werte bleiben immer ausgeschlossen.

## Testharness

`tests/fixtures/preview-apps/` enthält ein deterministisches Loopback-Harness:
SPA mit HMR-Socket, MPA mit `/`, `/login`, `/admin`, API mit CORS/Preflight und
Redirect, WebSocket-/EventSource-Dienst, Cookie-App, Service-Worker-App,
localStorage-App und eine fehlerhafte App. Die Ports stehen in
`tests/fixtures/preview-apps/ports.json`; es wird kein fremder Projektcode
ausgeführt und nichts zurückgelassen.

```bash
WRAPT_E2E_USER=<erlaubte-adresse> pnpm test:e2e
```

Ohne `WRAPT_E2E_USER` überspringen sich die Preview-Szenarien, statt an `401`
zu scheitern.

## Manuelle Tailscale-Abnahme

Nicht Bestandteil von `pnpm test:e2e` und bewusst manuell:

- echtes Tailscale-HTTPS und zwei reale Geräte im Tailnet,
- echtes iOS-/Android-Touchverhalten,
- administratives `sudo bash deploy/proxy/configure-tailscale-serve.sh` (nur bei
  geänderten Portmappings),
- eine reale MPA und eine reale Full-Stack-App,
- optional ein Chromium-Cookie-Profiltest.

Der normale Abschluss verlangt kein `sudo`.
