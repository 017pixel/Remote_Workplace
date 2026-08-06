# Design-Audit der Workbench-Oberfläche

Stand: 04.08.2026 · Methode: Code-Review + Live-Prüfung der laufenden Instanz (Desktop 1440px und Mobile 390px, Accessibility-Snapshots)

## Produktverständnis

- **Produkttyp:** Private, selbst gehostete Remote-Development-Workbench (Operations- und Agent-Werkzeug).
- **Primärnutzer:** Benjamin (Einzelnutzer, Desktop und Mobile).
- **Primärtasks:** Projekte und Workflows öffnen, Agenten (T3 Code, Hermes, CLI-Terminals) bedienen, Serverzustand überwachen, Terminals und Previews steuern.
- **Business-Ziel:** Zuverlässiger, schneller Zugriff auf alle Remote-Werkzeuge von jedem Gerät.
- **Constraints:** Nur ein Nutzer, Tailscale-Identity-Auth, Produktion läuft als systemd-Dienst, Workbench wird für die Eigenentwicklung benutzt.
- **Annahmen:** Der Orbit („Workbench“-Seite) ist die zentrale Arbeitsfläche und wird täglich genutzt; die Projektliste wächst weiter.

## Was bereits funktioniert (erhalten!)

- **Token-System:** Konsequente T3-Nightly-Palette im `@theme`-Block von `apps/web/src/index.css`; kaum Farb-Hardcodes in Komponenten; saubere Typo-, Radius- und Elevation-Skala.
- **Dashboard:** Abgeleiteter Systemstatus („Alles betriebsbereit“ mit konkreter Problemliste), Skeleton- und Fehlerzustände pro Panel, adaptive Chart-Skalen, Messzeitpunkte und Vergleichsfenster sichtbar.
- **Zustandsdisziplin:** Confirm-Dialoge für destruktive Aktionen (Terminal löschen, Workspace-Reset, T3-Kanalwechsel), EmptyStates, Offline-Banner, Fehlertexte mit Handlungsoption.
- **Barrierefreiheit Grundlagen:** Skip-Link, `aria-live`-Seitentitel, `role=switch` mit `aria-checked`, Fokus-Rückgabe nach Menü-/Dialog-Schließen, `aria-modal`-Dialoge.
- **Mobile:** Eigenständiges Layout mit Drawer-Navigation, Swipe-Geste, Safe-Areas, dynamischer Viewport-Höhe, unterer Navigation statt Sidebar.
- **Texte:** Durchgehend präzises Deutsch ohne Marketing-Sprech, konsistente Terminologie.

## Priorisierte Probleme

| Prio | Bereich | Beobachtung | Impact | Empfehlung | Aufwand |
|---|---|---|---|---|---|
| P1 | Projekte (Datenqualität) | `node_modules` erscheint als Projektkarte; `skills` doppelt (zwei Pfade); 27 Einträge, davon Müll | Vertrauen und Liste verschmutzen; Doppelungen verwirren | Projekt-Scanner: `node_modules`, versteckte Ordner und Nicht-Projekte ausschließen; Duplikate (Symlink/Ordnername) zusammenführen | M |
| P1 | Projekte (Informationsarchitektur) | 27 fast identische Karten ohne Suche, Filter oder Sortierung; „T3 öffnen“ visuell dominant, obwohl „Weitere Werkzeuge“ der häufigere Einstieg ist | Findbarkeit und Scanbarkeit sinken mit der Projektanzahl | Suche ergänzen, kompaktere Zeilendarstellung, Werkzeug-Hierarchie überdenken | M |
| P2 | Einstellungen (Navigation) | Elf Sektionen als eine lange Scroll-Seite, keine Sprungmarken, kein Suchfeld | „Wo war nochmal …?“-Problem, besonders mobil | Segmentierte In-Page-Navigation oder Suchfeld | S |
| P2 | Accessibility | Switch-Zeilen mit doppelten Namen: „Dashboard Dashboard“, „Codex Codex“ (Button-Text plus `aria-label` auf innerem `role=switch`) | Screenreader lesen jeden Schalter zweimal | `aria-labelledby` auf den Button-Text, Switch ohne eigenes Label | S |
| P2 | Orbit-Sidebar (Datenqualität) | „skills“ auch hier doppelt | Gleiche Ursache wie P1 | Scanner-Fix abwarten | S |
| P3 | Benachrichtigungen | WebSocket `notifications/ws` meldet bei jedem Seitenwechsel eine Verbindungs-Warnung | Konsolen-Rauschen, unnötige Verbindungsaufbauten | WebSocket sauber schließen beziehungsweise Reconnect drosseln | S |
| P3 | PWA | „App installieren“ ist nur Text, kein Install-Button trotz vorhandenem Manifest und Service Worker | Höhere Installationshürde, besonders auf iOS | `beforeinstallprompt`-Handler und Button ergänzen | S |
| P3 | Orbit-Previews | Umbenennen, Duplizieren, Löschen nur per Rechtsklick-Kontextmenü, keine Touch-Alternative | Funktionen auf Tablet/Phone unauffindbar | Touch-Long-Press oder sichtbare Aktionen | S |
| P3 | Konsole | Eingebettete T3-Bridge erzeugt Clerk-400er gegen `t3.codes` (externes Verhalten des T3-Pakets) | Nur Rauschen, nicht selbst behebbar | Beobachten, ggf. in Troubleshooting dokumentieren | – |

## Strukturelle Empfehlungen

- **Projekt-Scanner:** Auschlusslisten für `node_modules`, versteckte Verzeichnisse und typische Nicht-Projektordner; Deduplizierung über aufgelöste Pfade; Kennzeichnung von Symlink-Projekten statt eigener Karte.
- **Projektliste:** Suche nach Name/Pfad, kompakte Zeilen mit Status-Badges statt Karten, primäre Aktion nach Nutzungshäufigkeit (Weitere Werkzeuge vor T3 öffnen).
- **Einstellungen:** Sprung-Navigation (Segmente oder Ankerliste) mit Scroll-Spy; Suche über Sektions- und Titeltexte.
- **Switch-Komponente:** Ein gemeinsames Muster: Zeilen-Button mit `aria-labelledby` auf Titel, `role=switch` ohne eigenen Namen; zentral in `primitives.tsx` statt drei Kopien (Settings, Dashboard, Orbit-Sidebar, Seiten-Sichtbarkeit).
- **Orbit-Preview-Menü:** Kontextmenü zusätzlich per sichtbarem „…“-Button oder Long-Press zugänglich machen.

## Visuelle Empfehlungen

- Kein grundsätzlicher Umbau nötig; das Design ist stimmig und charakterstark.
- Dashboard-Dichte ist für den Einzelnutzer angemessen; bei wachsender Projektzahl die Projektliste vor dem Dashboard entlasten.
- „App installieren“ als echte Install-Aktion statt Text-Paragraph ergänzen.

## Accessibility und Resilienz

- Doppelte Switch-Namen korrigieren (siehe P2).
- Focus-Management der Dialoge funktioniert grundsätzlich; Modal ohne expliziten Focus-Trap prüfen (Tab kann aktuell den Dialog verlassen).
- WebSocket-Warnung bei Seitenwechsel beseitigen.
- Keine Lokalisierungsprobleme erkennbar (deutsch durchgehend, lange Strings in Layouts getestet).

## Empfohlene Umsetzungsreihenfolge

1. Scanner-Fix (behebt P1 und die Orbit-Sidebar-Duplikate zugleich)
2. Projektliste: Suche und kompaktere Darstellung
3. Einstellungen: In-Page-Navigation
4. Switch-A11y-Fix
5. P3-Punkte: WS-Rauschen, PWA-Install-Button, Touch-Menü für Orbit-Previews

## Validierungsplan

- Scanner-Fix: Projektliste und Orbit-Sidebar nach dem Fix prüfen; `node_modules` darf nicht mehr auftauchen, Duplikate sind zusammengeführt.
- Projektliste: Suche mit bekannten Projekten testen; Darstellung bei 27+ Einträgen und auf Mobile prüfen.
- Einstellungen: Sprungnavigation auf Desktop und Mobile testen; aktive Sektion beim Scrollen.
- A11y: Switch-Zeilen mit Screenreader einmal durchhören; doppelte Namen müssen weg sein.
