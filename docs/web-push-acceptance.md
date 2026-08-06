# Web-Push-Abnahme

Diese Checkliste prüft die reale Zustellung auf Android und iPadOS. Sie ergänzt die automatisierten
Server-, Browserclient- und Build-Tests. Ein Entwicklungsrechner ohne die beiden Geräte kann diese
Abnahme nicht ersetzen.

## Voraussetzungen

- Workbench über den produktiven privaten HTTPS-Origin öffnen.
- Globalen Server-Push und die betroffenen Quellen in den Einstellungen aktivieren.
- `<paths.dataDir>/notifications/vapid.json` und die Workbench-SQLite-Datenbank sichern.
- Sicherstellen, dass der Server ausgehendes HTTPS zu den Push-Endpoints und für Apple zu
  `*.push.apple.com` erreicht.

## Geräteübergreifender Ablauf

1. PWA auf Android installieren.
2. Push auf Android aktivieren. Der Status muss „Aktiv“ zeigen.
3. PWA vollständig schließen und den serverseitigen Testpush auslösen. Genau eine sichtbare
   Systembenachrichtigung muss eintreffen.
4. Push anklicken. Die vorhandene PWA muss fokussiert oder neu geöffnet und der sichere Deep Link
   geladen werden.
5. PWA auf dem iPad über „Teilen → Zum Home-Bildschirm“ installieren.
6. Die PWA vom Home-Bildschirm starten. In einem normalen Safari-Tab muss stattdessen die
   Installationsanleitung erscheinen.
7. Push auf dem iPad aktivieren. Die Gerätezahl muss jetzt mindestens zwei anzeigen, ohne das
   Android-Abo zu verändern.
8. iPad-PWA vollständig schließen und den serverseitigen Testpush auslösen. Genau eine sichtbare
   Systembenachrichtigung muss eintreffen.
9. Einen echten relevanten Agentenabschluss oder eine Rückfrage erzeugen.
10. Genau eine Benachrichtigung auf Android und genau eine auf dem iPad empfangen.
11. Push nur auf Android deaktivieren.
12. Einen weiteren relevanten Push erzeugen. Für einen gezielten Kettentest den iPad-Testknopf
    verwenden; für den Mehrgerätetest ein echtes relevantes Inbox-Ereignis verwenden.
13. Das iPad muss weiterhin empfangen, Android nicht.
14. Android erneut aktivieren. Beide Endpoints müssen wieder getrennt vorhanden sein.
15. Den Workbench-Server neu starten, ohne die VAPID-Datei zu verändern.
16. Auf beiden Geräten einen neuen Push empfangen. Es darf keine neue Permission-Abfrage geben.
17. Die Notification-Berechtigung eines Geräts in den Systemeinstellungen blockieren. Die
    Einstellungen müssen danach „Blockiert“ anzeigen und weiterhin das lokale Gerät einzeln
    deaktivieren können.
18. PWA aktualisieren, vollständig schließen und erneut öffnen. Der neue Service Worker und die
    neue Cache-Version müssen aktiv sein; ein weiterer Testpush muss sichtbar eintreffen.

## Service-Worker-Sicherheitscheck

Diese Fälle lassen sich in den DevTools des installierten Browsers oder mit einem lokalen
Service-Worker-Testwerkzeug prüfen:

- Gültige Payload mit `version: 1` zeigt Titel, Text, Icon, Badge und stabilen Tag.
- Kaputtes JSON und eine unbekannte Payload-Version erzeugen trotzdem eine sichtbare generische
  Workbench-Benachrichtigung.
- Ein Link außerhalb von `/workbench` oder `/t3`, ein Protokoll-Link und `//fremder-host` öffnen
  ausschließlich `/workbench/inbox`.
- Der Klick fokussiert einen bestehenden Workbench-Client, navigiert ihn und markiert eine gültige
  Notification-ID bestmöglich als gelesen. Ohne Client öffnet er eine neue PWA-Ansicht.
- Zwei Zustellungen mit derselben Notification-ID ersetzen sich über denselben Tag und erscheinen
  nicht doppelt.

## In der Entwicklungsumgebung geprüft

- Automatisierte Backend-, API- und Browserclient-Tests decken Mehrgerätebetrieb, Ownership,
  Policy, Fehlerisolation, Endpoint-Bereinigung, VAPID-Stabilität und lokale Gerätezustände ab.
- Produktionsbuild, Serverneustart, Health- und API-Smoke-Test wurden mit Version 0.40.0 geprüft.
- Die Einstellungsoberfläche wurde im Desktop- und 390-Pixel-Viewport sowie mit emuliertem iPadOS
  außerhalb des Standalone-Modus geprüft. Alle Aktionen sind mindestens 44 Pixel hoch.
- DNS und ausgehendes HTTPS zu `web.push.apple.com` funktionieren; HTTP 405 bestätigt, dass der
  Apple-Endpunkt erreicht wurde.
- Reale Push-Zustellung bei geschlossener PWA bleibt eine Geräteabnahme. Ohne physisches Android-
  und iPadOS-Gerät werden die Punkte 1 bis 18 oben nicht als bestanden markiert.
