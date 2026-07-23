# Einbettungstest

**Datum:** 12.07.2026 (UTC)  
**Harness:** `tools/embedding-harness`, temporär auf Port 4179. Das Harness verändert keine Security-Header der Zielsysteme.

## T3 Code

- Direkter Aufruf lokal und über die private Tailscale-HTTPS-URL liefert die T3-Code-Pairing-Seite.
- Die private HTTPS-URL rendert sichtbar in einem cross-origin iframe. Es wurden keine `X-Frame-Options`- oder `frame-ancestors`-Blockaden beobachtet.
- Die Pairing-Ansicht funktioniert im schmalen Smartphone-Viewport und im breiteren Desktop-/Tablet-Viewport.
- Ohne Pairing-Credential antwortet `/ws` lokal und durch Tailscale identisch mit HTTP 401. Das belegt, dass der Pfad durch den Proxy am richtigen authentifizierten Backend ankommt; ein erfolgreicher authentifizierter Upgrade wurde ohne Secret bewusst nicht erzwungen.
- Fester MVP-Modus: `hybrid`. Eingebettet als Standard, externe Öffnungsaktion immer verfügbar. Bei Pairing-/Cookie-Problemen ist der externe Tab der sichere Fallback.

## code-server

- Zwei sichere Suchpfade wurden geprüft: Installation/Executable/Paket sowie systemd/Container/Listener.
- Ergebnis: Dienst nicht installiert, kein Port und keine öffentliche URL vorhanden.
- Ordner-URL und WebSockets können deshalb noch nicht praktisch geprüft werden.
- Fester MVP-Modus bis zur Installation und Wiederholung dieses Tests: `external`.
- Nach Installation muss mindestens `?folder=<URL-encodierter konfigurierter Pfad>`, Login-Cookie und Terminal-WebSocket durch den privaten Proxy getestet werden. Erst danach darf auf `hybrid` umgestellt werden.

## Projekt-Preview

- Getestet wurde die aktive Vite-App aus `/home/your-user/projects/demo-app` auf Port 1234.
- Die App rendert sichtbar im iframe.
- Der Vite-Client meldet eine erfolgreiche Verbindung; damit funktioniert der HMR-WebSocket im geprüften direkten Tailscale-HTTP-Zugriff.
- Die Produktions-Workbench wird über HTTPS ausgeliefert. Die aktuelle HTTP-Preview wäre dort Mixed Content.
- Fester aktueller Modus: `external`. Nach privater HTTPS-Terminierung, beispielsweise auf Tailscale Serve Port 8445, darf die Preview nach erneutem Test `hybrid` werden.

## Geräteabdeckung

Das technische Harness wurde in Viewports von 437 CSS-Pixeln sowie 1034 CSS-Pixeln geprüft. Das deckt Breakpoint- und iframe-Grundverhalten ab, ersetzt aber keinen physischen Test auf iPad und Android. Die abschließenden Touch-, Tastatur-, Safe-Area- und Split-View-Tests gehören nach Umsetzung des visuellen Frontends in die Geräteabnahme.

## Sicherheitsentscheidung

Es wurden keine Header entfernt, keine Pairing-Tokens gelesen und keine Same-Origin-Sperren umgangen. Ein `load`-Event allein wird in der späteren UI nicht als Healthcheck missverstanden; der Frontend-Agent muss zusätzlich Dienststatus und einen zeitbasierten Lade-/Fehlerfallback anzeigen.

