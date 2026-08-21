# Nächste Schritte — Aufgabenliste für den nächsten Agenten

Stand: 25.07.2026, Version 0.30.2. Sortiert nach Nutzen. Jeder Punkt nennt, was
zu tun ist und woran man erkennt, dass es erledigt ist.

## Erledigt am 26.07.2026

### 1. Alles committen — der Arbeitsbaum ist ungesichert ✅
Aufgeteilt in elf thematische Commits auf dem Zweig
`sicherung/arbeitsstand-0.30.2` (Lint-Regeln, Absturzbericht, Neustart-Workflow,
T3-Kanal, Design, Sidebar/Navigation, Seiten-Cache, Orbit-Farben,
Terminal-Neustart, Browser, Doku/Version). Der Versionssprung auf 0.30.2 liegt
gesammelt im letzten Commit, damit er die Themen nicht verschmiert.

### 2. E2E-Tests laufen lokal nicht durch ✅
Basis-Adresse kommt aus `tests/e2e/helpers/environment.ts`: `WRAPT_E2E_URL`
mit Fallback `127.0.0.1:3010`. Tests, die eine eingerichtete Instanz brauchen
(Projekte, Tailscale-Identität, News), überspringen sich mit Begründung.
`pnpm test:e2e` läuft ohne Sonderumgebung grün — 68 bestanden, 70 übersprungen,
in drei Läufen hintereinander bestätigt.

Dabei aufgefallen und mitbehoben: Der Lauf lief in `429`. Das API-Ratenlimit
zählt pro IP, und hinter dem Tailscale-Proxy sehen alle Anfragen wie 127.0.0.1
aus — 180 Anfragen/Minute waren ein gemeinsames Budget für sämtliche Tabs,
während die Oberfläche allein je Tab 20–45 Anfragen/Minute pollt. Jetzt 1.200,
und `/api/v1/health` zählt gar nicht mehr mit.

## Stabilität und Absicherung

### 3. Der T3-Kanalwechsel hat keinen einzigen Test
`scripts/sync-t3-channel.sh` tauscht npm-Pakete, beendet Prozesse und startet
Dienste — die riskanteste Automatik im Projekt, ungetestet.
Vorgehen: Die Logik in prüfbare Funktionen ziehen (Kanal aus Version ableiten,
npm-Tag bestimmen, Port-Freigabe abwarten) oder einen Test mit einem Dummy-Binary
und einem Fake-Port schreiben. Mindestens: Abbruch bei fehlgeschlagenem Install.
**Fertig, wenn:** Fehlerfall „Registry nicht erreichbar" automatisiert nachgewiesen ist.

### 4. Zustandserhalt der Routen absichern
Der Cache-Fehler (Fehlergrenze mit wechselndem `key`) war zweimal da und beide Male
nur durch manuelles Messen gefunden. Ohne Test kommt er wieder.
Vorgehen: E2E-Test, der auf `/t3-code` ein `iframe` markiert, über zwei andere
Routen navigiert, zurückkehrt und prüft, dass die Markierung noch da ist.
**Fertig, wenn:** Der Test rot wird, sobald man den `key` in `App.tsx` zurückdreht.

### 5. Verdrängung im Seiten-Cache prüfen
`PersistentOutlet` hält zehn Routen und verdrängt die am längsten ungenutzte.
Die Verdrängung selbst ist nie gelaufen (es gibt nur 14 Routen, im Alltag kaum zehn).
Vorgehen: Unit-Test für die Verdrängungsreihenfolge; sicherstellen, dass die
Renderreihenfolge dabei stabil bleibt (sonst laden iframes neu).
**Fertig, wenn:** Test zeigt, dass beim elften Aufruf die älteste Route verschwindet
und die übrigen ihre Position behalten.

### 6. Letzten Befehl nach Terminal-Neustart verifizieren
Die Logik steht (`rememberTyping` plus Vorbelegung nach dem Neustart), konnte aber
nie end-to-end geprüft werden: Ohne Tailscale-Identität startet auf diesem Server
gar kein Terminal.
Vorgehen: Über die Tailscale-Adresse testen — Befehl eintippen, ausführen, `exit`,
Neustart klicken, prüfen dass der Befehl in der Eingabe steht.
**Fertig, wenn:** Manuell bestätigt oder als E2E-Test mit gesetzter Identität grün.

### 7. Downgrade Nightly → Stable absichern
T3 Nightly hat zwei Schema-Migrationen auf `~/.t3/userdata/state.sqlite` angewendet
(32 → 34). Stable 0.0.28 kennt sie nicht. Der Rückweg ist ungetestet.
Vorgehen: `state.sqlite` sichern, auf Stable stellen, neu starten, prüfen ob die
91 Threads laden. Bei Problemen die Sicherung zurückspielen und in `AGENTS.md`
festhalten, ab welcher Nightly-Version der Rückweg blockiert ist.
**Fertig, wenn:** Ergebnis dokumentiert ist — funktioniert oder nachweislich nicht.

## Frontend

### 8. Neun Lint-Warnungen abarbeiten
Alle aus `react-hooks/exhaustive-deps` in `MobileNav`, `ChromiumBrowser`,
`OrbitWorkbench` und `TechTldrs`. Genau diese Kategorie hat den Cache-Fehler
verursacht — fehlende Abhängigkeiten sind hier keine Kosmetik.
**Fertig, wenn:** `pnpm lint` 0 Warnungen meldet.

### 9. `TechTldrs.tsx` aufteilen (1.547 Zeilen)
Größte Datei im Projekt, enthält Feed, Reader, Chat, Filter und Sammlungen in einem.
Vorgehen: In Teilkomponenten je Bereich zerlegen, gemeinsame Zustände in einen Hook.
**Fertig, wenn:** Keine Datei über ~600 Zeilen und `pnpm test` weiter grün.

### 10. `OrbitWorkbench.tsx` entflechten (1.081 Zeilen)
Kontextmenü, Kantenmenü, Inspector, Zwischenablage und Canvas-Steuerung in einer
Komponente. Das Umfärben scheiterte genau an dieser Verflechtung.
Vorgehen: Kontextmenü und Inspector herauslösen, die Ableitung von Flow-Knoten und
-Kanten in einen eigenen Hook mit klaren Abhängigkeiten.
**Fertig, wenn:** Die Datei unter ~600 Zeilen liegt und Farbe/Position/Projekt
nachweislich alle Ableitungen auslösen.

### 11. Bundle-Größen prüfen
`WebTerminal` 344 KB, Hauptbündel 320 KB, `OrbitWorkbench` 248 KB (unkomprimiert).
Vorgehen: Prüfen, ob xterm-Addons und `@xyflow/react` erst beim Öffnen geladen
werden; ungenutzte lucide-Icons fallen bereits durch Tree-Shaking weg — verifizieren.
**Fertig, wenn:** Startbündel spürbar kleiner ist, gemessen mit `pnpm build`.

### 12. Kontrast der gedämpften Textfarbe prüfen
`--color-faint` (#737373) auf `#0a0a0a` liegt bei etwa 4,15:1 und damit unter den
4,5:1 für Fließtext. Wird für Hinweise und Zeitangaben verwendet.
Vorgehen: Entweder aufhellen oder nur noch für Text ab 18 px einsetzen.
**Fertig, wenn:** Alle Fließtexte 4,5:1 erreichen.

### 13. Eigene Knotenfarben in die Einstellungen holen
Die selbst gemischten Farben liegen nur im `localStorage` des Browsers
(`wrapt.node-colors.v1`) und fehlen auf jedem anderen Gerät.
Vorgehen: Entweder in die Orbit-Datenbank aufnehmen oder in den Einstellungen
sichtbar machen, damit klar ist, dass sie gerätegebunden sind.

### 14. Frame-Knoten färben
Die Farbwahl im Kontextmenü gilt für alle Knotentypen, aber nur Projektknoten
zeigen die Farbe sichtbar. Bereiche (`frame`) ignorieren sie.
**Fertig, wenn:** Ein eingefärbter Bereich seine Farbe an Rahmen und Titel zeigt.

## Backend

### 15. Vier Dienste ohne Test
`commandService`, `serviceStatusService`, `systemService` und `t3Proxy` haben keine
Tests. Besonders `t3Proxy` ist kritisch: Er trägt alle T3-Flächen.
Vorgehen: Mindestens Pfad-Umschreibung (`/t3/...` → `/...`) und
WebSocket-Puffergrenze testen.

### 16. Restart-Serialisierung härten
`restartInFlight()` betrachtet einen Lauf nach zehn Minuten als hängend und gibt
ihn frei. Bricht ein Neustart mittendrin ab, kann in diesem Fenster kein neuer
starten — und danach zwei gleichzeitig.
Vorgehen: Prozess-Existenz statt Zeitfenster prüfen (PID in der Statusdatei).

### 17. Pairing-Token im Journal
`t3-code.service` schreibt Pairing-URL und Token beim Start ins User-Journal. Der
alte Starter hat sie herausgefiltert.
Vorgehen: Abwägen und entscheiden — Filter zurückholen oder bewusst so lassen und
in `AGENTS.md` begründen.

### 18. Fehlerformat der Restart-Route vereinheitlichen
`POST /api/v1/system/restart` antwortet im Fehlerfall mit `{error, message}`,
alle übrigen Routen mit `{error: {code, message}}`. Der Client liest nur das
zweite Format und zeigt deshalb eine unspezifische Meldung.

## Aufräumen

### 19. Tote CSS-Regeln entfernen
Aus den Umbauten sind verwaiste Klassen übrig, etwa `.orbit-gallery-move-menu`
und `.orbit-gallery-move-dropdown` (das Menü ist jetzt ein Dialog).
Vorgehen: Klassen im Stylesheet gegen die Verwendung im TSX prüfen.

### 20. `data/wrapt.sqlite` im Repo klären ✅
Erledigt am 19.08.2026 im Zuge des Renames zu Wrapt: Die alte Kopie
`data/workbench.sqlite` wurde in `~/wrapt-rename-altlasten/` verschoben und
`AGENTS.md` entsprechend angepasst. Die echte Datenbank liegt ausschließlich
unter `~/.local/share/wrapt/wrapt.sqlite`.
