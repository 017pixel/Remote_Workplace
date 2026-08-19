# Terminal V2 — Architektur und Zielbild

Status: in Arbeit. Dieses Dokument beschreibt den Ist-Zustand, die Fehlerursachen,
die Zielarchitektur und den Migrationsweg für den Neuaufbau des Terminal-Subsystems.

## Aktueller Datenfluss (Ist)

```text
node-pty (Prozess)
   ↓ raw bytes
tmux Session (Supervisor, capture-pane)
   ↓ zwei Wahrheiten nebeneinander
   a) lokale ANSI-History (session.history, limitiert)
   b) tmux capture-pane Dump (gerendert)
   ↓
WebSocket (eine Session je WebTerminal)
   ↓
Browser xterm (replayt History, errät Maus-/Alternate-Screen-Modi)
```

Es gibt **mehrere Wahrheiten** über den Terminalzustand: den rohen PTY-Bytestrom, eine
gekürzte ANSI-History, einen `capture-pane`-Dump, manuell rekonstruierte Alternate-Screen-
und Maus-Modi und ein Browser-xterm, das diese wiederum selbst interpretiert. Genau aus
diesen überlappenden Schichten entstehen die Rechtsversätze, schwarzen Flächen und
kaputten TUIs.

## Bekannte Fehlerursachen

1. **Keine autoritative Terminaldarstellung.** Der Server hält keinen echten
   Terminalzustand, sondern nur Textfragmente. Jede Schicht interpretiert ANSI neu.
2. **Snapshot aus `capture-pane` ist kein Byte-Strom.** Ein newline-separierter Dump wird
   in ein xterm geschrieben, das ihn erneut umbricht und neu interpretiert. Boxen und
   Sidebars driften.
3. **Alternate Screen und Maus-Reporting werden geraten** (`kind !== "shell"`, Regex auf
   History), statt aus dem tatsächlichen Terminalmodus zu kommen.
4. **Keine Sequenz-/Epoch-Ordnung.** Output und Snapshot haben keine gemeinsame,
   monotone Ordnung. Alter Output kann nach einem Snapshot eintreffen und das Bild
   zerstören.
5. **Permanente Renderer.** Versteckte Tabs bleiben montiert und verbunden, parsen
   tausende ANSI-Updates und erzeugen eigene Buffer-Wahrheiten.
6. **Geometry Ownership ist implizit und flüchtig.** ResizeObserver, Tab-Wechsel und
   Verzögerungen können die Geometrie umreißen (Ping-Pong, falsches Snapshot-Raster).
7. **Backend-Restart hängt am Prozesslebenszyklus.** tmux wird vom Workbench-Prozess
   gesteuert; ein Neustart kann laufende Terminals unterbrechen.

## Zielarchitektur

```text
echter Prozess
   ↓
tmux Session (dedizierter Supervisor-Socket, eigene systemd-Unit)
   ↓
node-pty Attach
   ↓
authoritative Headless xterm (Server, pro Runtime)
   ↓
sequence-numbered output (+ OutputJournal für Fast Reconnect)
   ↓
1 multiplexter Terminal-WebSocket je Browserseite
   ↓
Browser xterm renderer (nur sichtbare Panes)
```

**Eine autoritative Wahrheit:** Jedes Byte aus der PTY fließt zuerst in den Headless
Terminal auf dem Server. Reconnect-Clients bekommen einen **serialisierten konsistenten
Zustand an Sequenz N** plus Deltas > N. Kein roher History-Ausschnitt, kein
`capture-pane`-Dump als Live-Quelle.

### Drei klar getrennte Konzepte

- **Runtime** (Server): Prozess, tmux, CWD, Headless-Terminal, PTY, Epoch, Sequenz,
  Geometry Lease, Lifecycle-Policy.
- **Browser Renderer** (Ansicht): kann jederzeit erstellt, geschlossen, neu geladen,
  unmounted werden. Beeinflusst die Runtime nicht.
- **Workspace Entry** (Organisation): Name, Ordner, Pin, Runtime-ID, Projekt, Profil.

## Session Lifecycle

```text
Ansicht schließen / Route wechseln / Split schließen  → Runtime bleibt
Explizit "Terminal beenden"                            → Runtime wird beendet
Pin / Persistent                                       → Schutz vor versehentlichem Beenden
```

Runtime-Status: `starting | running | exited | interrupted | restoring | closed`
Transport-Status: `connecting | connected | reconnecting | offline`
Renderer-Status: `initializing | syncing | ready | resyncing | error`

Ein WebSocket-Disconnect bedeutet **nie** Prozessende. Netzwerkfehler, Sleep, Tab-Close:
nur Client-Detach.

## Rendering Lifecycle

```text
Container mount (sichtbar, >0 px, Fonts geladen)
   → xterm erzeugen, open, fit
   → stabile cols/rows bestimmen
   → Runtime abonnieren
   → Sync anfordern (epoch/sequence)
   → Snapshot einspielen, Deltas > N
```

Parkierte Renderer werden **detached/unmounted**, nicht weiter geparst. Bei Rückkehr wird
synchronisiert. Resize wird framewise zusammengefasst, nur echte cols/rows-Wechsel gehen
zum Server. Keine Font-Gegenkompensation über dynamische Fontgrößen; die logische
Geometrie bleibt stabil, der äußere Panel-Layer skaliert.

## Reconnect Protokoll

```text
Client: subscribe { runtimeId, desiredCols, desiredRows, epoch?, lastSequence? }
Server: Geometry Lease bestimmen → ggf. PTY+Headless atomar resizen
        Snapshot an Sequenz N (falls Lücke/anderer Epoch) sonst Deltas > lastSequence
Client: xterm auf Snapshot-Geometrie → reset → serialisierten Zustand → Deltas
```

Regeln: alte Nachrichten (Sequence ≤ N) werden ignoriert. Sequenzlücken erzwingen einen
Resync, nie best-effort weiterlaufen.

## Geometry Ownership V2

Eine Runtime hat `canonicalCols/CanonicalRows`, `geometryOwnerClientId` und
`lastInteraction`. Owner-Transfer nur bei echter Interaktion (Fokus, Eingabe,
„Steuerung übernehmen", Tap). ResizeObserver, Tab-sichtbar, Snapshot-Empfang, Polling
übernehmen nie den Owner. Secondary Clients rendern das kanonische Raster (skaliert /
scrollbar / Mirror), bis sie selbst Control anfordern.

## Persistenzmodell

- **SQLite bleibt Source of Truth** für Workspace-Daten (TerminalWorkspace v2), Sessions
  und Runtime-Registry. Kein Supabase.
- Workspace-Mutationen laufen transaktional mit Revision-Check gegen Lost Updates
  zwischen Tabs/Geräten. Serverseitige Operationen statt blindes Ganzdokument-Überschreiben.
- Runtime-Registry + tmux werden beim Backendstart reconciliert (SQLite/tmux/Fälle).
- Host-Reboot: Runtime-Registry, CWD, Name, Ordner, Pin wiederherstellen; nie so tun, als
  liefe der Prozess weiter. UI: „Nach Serverneustart wiederhergestellt".

## UI Modell

- Vertikale Terminal Sidebar (Ordner, Unterordner, Pins, Status, DnD, Kontextmenü).
- Keine horizontale Tab-Bar mehr auf der Terminal-Hauptseite.
- Pane-Layout (Split) und Sidebar-Organisation sind getrennt.
- Mobile: Drawer/Switcher statt zweiter Sidebar, große Touch-Ziele, Long-Press-Aktionen.
- Split: 1 Pane / 2 Panes horizontal zuverlässig; interne Struktur auf Split-Tree
  vorbereitet.

## Testmatrix

- Unit: Headless-Terminal, Journal, Sequenz, Geometry, Workspace-Migration, Protokoll.
- Deterministische TUI-Fixture (kein Internet/API): Alternate Screen, Cursor, Clear,
  Box Drawing, Farben, Unicode, Mouse Reporting, Resize, lange Ausgabe.
- Reconnect: Reload, Browser-Recreate, Tab-Wechsel, Desktop↔Mobile, zwei Clients,
  zwei Tabs, Split, Offline/Online, Output während Sync, Sequence-Gap → Resync,
  alte Nachricht → ignorieren.
- E2E: Chromium + WebKit, visuelle Assertions (linke Kante, Boxen, Cursor, kein Drift).
- Backend-Restart: gated, echter Dienstneustart mit PID-Vergleich (Nutzerfreigabe nötig).

## Migrationsstrategie

- TerminalWorkspace v1 → v2: flache Tabs in Standardordner übernehmen, Runtime-IDs und
  CWDs erhalten, Splits übernehmen. Beschädigte Daten fail safe behandeln.
- Bestehende laufende Sessions: keine neuen Runtime-IDs, solange eindeutige Zuordnung
  möglich ist (tmux `@workbench_runtime_id`).
- Transport: alte `terminal.*`-Nachrichten werden durch das V2-Protokoll ersetzt; die
  äußere `TerminalArea`-API bleibt für die Integration zunächst erhalten.

## Grenzen

- Kein Supabase, keine externe Cloud-DB.
- Keine Tool-spezifischen Rendering-Hacks (OpenCode/Codex/Claude/CommandCode).
- Keine Datei > 400 Zeilen; fachliche Aufteilung.
- Security: Tailscale-Identität, Same-Origin-WebSocket, Session-Ownership, Zod-Contracts,
  sichere Runtime-IDs, tmux-Socket nur für den Workbench-Benutzer.
