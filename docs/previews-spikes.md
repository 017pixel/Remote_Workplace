# Phase 0 — Machbarkeitsspitzen der Preview-Überarbeitung

Grundlage: [`plans/02_previews-iframe-komplett-optimierung.md`](../plans/02_previews-iframe-komplett-optimierung.md), Abschnitt 9.
Stand: 29.07.2026. Alle vier Spitzen sind abgeschlossen; die Ergebnisse sind unten als
Go/No-Go festgehalten. Erst danach wurden die produktiven Migrationen umgesetzt.

## Spike A — Slot-Reset

**Aufbau.** Die Slot-Origin liefert unter `/__workbench/preview-reset` eine minimale
Seite, die ausschließlich die Bridge lädt. Die Workbench öffnet sie in einem
unsichtbaren iframe, lässt Service Worker, Cache Storage, localStorage,
sessionStorage und die per `indexedDB.databases()` sichtbaren Datenbanken löschen
und fordert danach eine erneute Inventur an. Zusätzlich setzt die Route
`Clear-Site-Data: "cache", "storage", "executionContexts"` — bewusst ohne
`"cookies"`, weil Cookies hostweit auch andere Slots träfen.

**Ergebnis: Go.** Der Reset ist verifizierbar, solange der Browser
`indexedDB.databases()` unterstützt. Fehlt die Inventur oder bleibt ein Eintrag
übrig, meldet die Bridge `verifiable: false` beziehungsweise Restbestände.

**Fail-closed-Folge.** Genau dann wechselt der Slot nach `quarantined`, wird nicht
mehr vergeben und liefert keine Inhalte aus. Ein fremdes Storage-Profil bekommt
den Slot erst nach einem erfolgreich verifizierten Reset und einer erhöhten
`slotGeneration`.

Belegt durch `apps/server/src/previews/slots.test.ts` („hält eine fremde
Storage-Affinität ohne verifizierten Reset zurück").

## Spike B — HTML-Injektion

**Aufbau.** `parse5` statt Regex; die Bridge wird als **externes** Script unter
`/__workbench/preview-bridge.v1.js` eingebunden, damit kein `unsafe-inline`
nötig wird. Die Route erreicht den Devserver nie.

**Ergebnis: Go.** Verifiziert sind: genau eine Injektion in `head`, Dokumente ohne
`head`, korrekte UTF-8-Ausgabe inklusive Umlauten, Erkennung einer bereits
vorhandenen Bridge über den Marker `data-workbench-preview-bridge` sowie
unveränderte Weiterleitung bei zu großen (> `previews.maxInjectableHtmlBytes`),
nicht UTF-8-kodierten oder nicht parsebaren Antworten. Solche Antworten werden als
`bridgeUnavailable` diagnostiziert statt beschädigt.

Belegt durch `apps/server/src/previews/bridge.test.ts`.

## Spike C — Diagnosekorrelation

**Aufbau.** Die Elternseite kennt das iframe-Element und die erwartete
Slot-Origin. Sie akzeptiert nur Nachrichten von exakt `iframe.contentWindow` mit
passender Origin, vergibt `bridgeSessionId` und eine Navigationsepoche und
vergleicht Sequenzen ausschließlich innerhalb derselben Epoche. Beide Seiten
senden mit exaktem `targetOrigin`.

**Ergebnis: Go.** Vorschauinhalt kann keine Repair-, Datei- oder Shell-Aktion
auslösen: Das Bridge-Protokoll kennt nur Diagnose-, Navigations-, Storage- und
Reset-Nachrichten, und die Reparatur-API verlangt Tailscale-Identität,
Same-Origin und eine sichtbare Bestätigung. Gatewayereignisse werden Slot und
Routing-Revision zugeordnet, eine Session nur bei Eindeutigkeit (`sessionId`
bleibt sonst `null`).

Belegt durch `apps/server/src/previews/routes.test.ts` und
`apps/web/src/lib/previewBridgeClient.ts`.

## Spike D — localStorage-Snapshot

**Aufbau.** Die Bridge liest ausschließlich Schlüssel und Stringwerte, sortiert
deterministisch und meldet sie an die Workbench. Der Hash entsteht aus derselben
kanonischen Form auf beiden Seiten (`sha256` in reinem JavaScript, weil
`crypto.subtle` in unsicheren Kontexten fehlt).

**Ergebnis: Go.** Verifiziert sind: Limits von 1.000 Schlüsseln und 256 KiB,
deterministische Sortierung mit identischem Hash auf Client und Server,
`409` samt Serverstand bei zwei konkurrierenden Clients, manueller Restore als
ausdrückliche Benutzeraktion und Fehler, die niemals das iframe deaktivieren —
Größenüberschreitungen erzeugen eine Diagnose.

Belegt durch `apps/server/src/previews/storage.test.ts` und
`apps/web/src/lib/previewStorageSnapshot.test.ts`.

## Exit-Gate

- Alle vier Spitzen dokumentiert: **ja**.
- No-Go-Entscheidungen: **keine**; Spike A gilt nur unter der oben genannten
  Fail-closed-Bedingung als bestanden.
- Produktive Migration erst nach bestandenem Reset-Spike: **eingehalten**
  (Migration 3 in `apps/server/src/previews/database.ts`).
