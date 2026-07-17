# Security Audit

**Datum:** 12.07.2026  
**Scope:** Workbench-Quellcode, API, lokale Deployment-Vorlagen und die für Phase 0 sichtbare Serveroberfläche.  
**Status:** Keine Critical-Funde. Ein High-Infrastruktur-Fund liegt außerhalb der Workbench und muss vor Live-Abnahme manuell geprüft werden.

## High: Auf allen Interfaces gebundene Daten-/Gateway-Ports

1. **Severity:** High
2. **Location:** Serverlistener `0.0.0.0:54321` und `0.0.0.0:54322`; Docker-Container `supabase_kong_tg-vereinsapp` und `supabase_db_tg-vereinsapp`.
3. **Description:** Supabase Gateway und PostgreSQL sind auf allen IPv4-/IPv6-Interfaces veröffentlicht. Ob eine externe Verbindung tatsächlich möglich ist, hängt von Firewall und Upstream-Netz ab; der Firewallstatus war nicht lesbar.
4. **Exploitation Scenario:** Ein Gerät im erreichbaren Netz verbindet sich direkt mit Datenbank oder Gateway und versucht schwache Credentials, Fehlkonfigurationen oder bekannte Dienstschwachstellen auszunutzen.
5. **Recommended Fix:** Docker-Portpublishing auf `127.0.0.1` begrenzen oder ganz entfernen. Zusätzlich UFW so konfigurieren, dass der Zugriff ausschließlich über Tailscale bzw. benötigte localhost-Proxys erfolgt.
6. **Example Secure Implementation:** In der betreffenden Compose-Konfiguration Host-Bindings nach dem Muster `127.0.0.1:54322:5432` verwenden und die Änderung separat testen. Diese Fremdprojekt-Konfiguration wurde von der Workbench nicht verändert.

## Medium: Firewallregeln konnten nicht verifiziert werden

1. **Severity:** Medium
2. **Location:** Ubuntu Host; `ufw status verbose` wurde durch die Ausführungsumgebung mit `no_new_privs` blockiert.
3. **Description:** Die ausschließlich private Erreichbarkeit kann ohne Firewall- und Routerprüfung nicht vollständig bestätigt werden.
4. **Exploitation Scenario:** Ein auf `0.0.0.0` gebundener Dienst ist entgegen der Annahme aus LAN oder Internet erreichbar.
5. **Recommended Fix:** Vor Aktivierung als Administrator UFW, Router-Portweiterleitungen und Cloud-/Host-Firewall prüfen. Nur SSH nach bewusster Regel sowie Tailscale-Verkehr erlauben; keine Workbench-, Editor-, Preview- oder Datenbankports öffentlich freigeben.
6. **Example Secure Implementation:** Erwarteter Zielzustand ist eine standardmäßig eingehend blockierende Firewall und Zugriff auf Workbench/T3/code-server ausschließlich über private Tailscale-HTTPS-Endpunkte. Konkrete Regeln müssen an den bestehenden SSH-Zugriff angepasst werden, damit keine Aussperrung entsteht.

## Medium: Tailscale ACL ist die einzige Workbench-Zugriffskontrolle

1. **Severity:** Medium
2. **Location:** Gesamte GET-API unter `/api/v1`; Architekturentscheidung laut MVP.
3. **Description:** Die Workbench besitzt absichtlich keine eigene Anmeldung. Jeder Tailnet-Teilnehmer mit Netzwerkzugriff auf den Workbench-Port kann Serverstatus, Projektnamen und absolute Projektpfade lesen.
4. **Exploitation Scenario:** Ein kompromittiertes oder zu breit freigegebenes Tailnet-Gerät ruft die API ab und gewinnt interne Strukturinformationen.
5. **Recommended Fix:** Tailscale ACLs auf Benjamins Geräte/Identität und den konkreten Workbench-Endpunkt begrenzen. Bei späterer Mehrbenutzernutzung muss eine zusätzliche Authentifizierung vor den Proxy.
6. **Example Secure Implementation:** Eine Tailnet-Policy sollte ausschließlich die definierte Benutzer-/Gerätegruppe als Source und den Workbench-HTTPS-Port als Destination erlauben. Keine Wildcard-Gruppe für alle Tailnet-Nutzer verwenden.

## Medium: Aktive Preview ist HTTP und auf allen Interfaces gebunden

1. **Severity:** Medium
2. **Location:** TG-VereinsApp Vite Preview auf `0.0.0.0:1234`; `config/projects.local.json` markiert sie als `external`.
3. **Description:** Der Traffic ist außerhalb der Tailscale-HTTPS-Terminierung unverschlüsselt; direkte Bindung vergrößert die Angriffsfläche. Einbetten in die HTTPS-Workbench wäre außerdem Mixed Content.
4. **Exploitation Scenario:** Ein erreichbarer Netzteilnehmer liest oder manipuliert Preview-Traffic oder greift den Dev-Server direkt an.
5. **Recommended Fix:** Preview an `127.0.0.1` binden und per privatem Tailscale Serve HTTPS veröffentlichen. Erst nach erneutem iframe-/WebSocket-Test den Modus auf `hybrid` stellen.
6. **Example Secure Implementation:** Dev-Server mit localhost-Host starten und einen separaten privaten HTTPS-Port auf diesen localhost-Port proxien; die Browser-URL anschließend in der lokalen Projektkonfiguration hinterlegen.

## Low: Absolute Projektpfade werden absichtlich ausgeliefert

1. **Severity:** Low
2. **Location:** `GET /api/v1/projects`, `GET /api/v1/projects/:projectId`, Schema `projectSchema`.
3. **Description:** Absolute Pfade sind für Projektanzeige und code-server-Verkabelung vorgesehen, stellen aber interne Systeminformationen dar.
4. **Exploitation Scenario:** Ein bereits autorisierter Tailnet-Nutzer erfährt Benutzername und Ordnerstruktur und kann diese Informationen für weitere Angriffe verwenden.
5. **Recommended Fix:** Für das persönliche MVP akzeptiert, solange ACLs streng sind. Bei Mehrbenutzerbetrieb Pfade aus Listenantworten entfernen und Editor-Links ausschließlich serverseitig als opaque URL ausliefern.
6. **Example Secure Implementation:** Eine spätere öffentliche/Mehrbenutzer-DTO-Variante enthält nur Projekt-ID, Anzeigename, Verfügbarkeit und fertige erlaubte Aktionen, nicht den absoluten Pfad.

## Verifizierte Kontrollen

- Keine Secret-/Credential-Muster im Quellcode gefunden; `.env` und `*.local.json` sind ignoriert.
- Kein Git-Remote konfiguriert; daher keine öffentliche GitHub-Leak-Prüfung erforderlich.
- `pnpm audit --prod`: keine bekannten Schwachstellen.
- Keine Datenbank, Uploads, Auth-Tokens, JWTs, Agent-Tools oder Mutationsendpunkte in der Workbench.
- Keine gefährliche HTML-Injektion, `eval`, dynamische Shell oder dateischreibende Backend-Funktion gefunden.
- Alle Browser-IDs werden mit Zod validiert; Projektpfade und URLs stammen ausschließlich aus serverseitiger Konfiguration.
- `execa` verwendet feste Executables, Argumentarrays, Timeout und `shell: false`.
- CSP, HSTS, Referrer Policy, MIME-Schutz und Clickjacking-Schutz sind aktiv.
- Produktions-Sourcemaps des Web-Frontends sind deaktiviert.
- Globale Rate-Grenze: 180 Requests pro Minute und vertrauenswürdige Proxy-Adressen nur localhost.
- Fehlerantworten folgen einer festen Hülle und enthalten keine Stacktraces.
- systemd-Vorlage nutzt localhost-Bindung, `NoNewPrivileges`, read-only Home/System-Schutz und eingeschränkte Address Families.
- Deployment-Backups werden ignoriert und Proxy-/Unit-Skripte enthalten Healthcheck und Rollback.

## Freigabeentscheidung

Der Workbench-Code ist für den privaten MVP sicher vorbereitet. Eine Live-Freigabe darf erst erfolgen, nachdem Firewall/Tailscale-ACL manuell bestätigt, die offenen Fremdprojekt-Ports eingegrenzt und code-server separat sicher installiert wurde. Der High-Fund betrifft nicht von der Workbench erzeugte Container und wurde deshalb nicht automatisch verändert.
