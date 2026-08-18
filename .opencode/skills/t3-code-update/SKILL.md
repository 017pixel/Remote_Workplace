---
name: t3-code-update
description: Aktualisiert die T3-Code-Instanz (Remote_Workplace, Port 3773) auf die neueste Stable- oder Nightly-Version, ohne Pairing-Codes, Anmeldungen oder Credentials zu verlieren. Verwendet diesen Skill, wenn T3 Code aktualisiert werden soll, ein Update angefordert wird ("t3 updaten", "t3 code auf neueste version"), der T3-Kanal gewechselt wird oder nach einem Update die Anmeldung auf allen Geräten erhalten bleiben muss. Behandelt Backup, npm-Install mit node-pty, Dienst-Neustart und Verifikation.
---

# T3 Code aktualisieren (ohne Neuanmeldung)

Dieser Skill beschreibt den sicheren Weg, T3 Code in der Remote-Workbench zu
aktualisieren. Ziel: Die Anmeldung auf allen Geräten (Windows, macOS, Android,
iOS, iPad, Laptop) bleibt nach dem Update erhalten, ohne neue Pairing-Codes.

## Warum Anmeldungen ohne Neuanmeldung überleben

- Alle Auth-Sessions liegen in `~/.t3/userdata/state.sqlite` (Tabelle
  `auth_sessions`, aktuell 67 aktive Sessions von allen Geräten).
- Der Session-Signing-Key liegt in `~/.t3/userdata/secrets/server-signing-key.bin`.
  Er signiert die Session-Cookies der Geräte. Solange diese Datei und die
  Datenbank unverändert bleiben, bleiben alle Geräte angemeldet.
- Weitere Secrets, die NIEMALS angefasst werden dürfen:
  `asset-access-signing-key.bin`, `cloud-link-ed25519-key-pair.bin`.
- Ein Update tauscht nur das npm-Paket und startet den Dienst neu.
  `~/.t3/userdata/` wird nicht berührt.

## Ablauf

### 1. Konfiguration prüfen

```bash
python3 -c "
import json
c = json.load(open('config/workbench.local.json'))
print(json.dumps(c.get('t3', {}), indent=2))
"
```

- `channel`: `nightly` oder `stable` (Festlegung, welcher npm-Tag installiert wird).
- `npmPackage`: meist `t3`.
- `cliPath`: meist `$HOME/.npm-global/bin/t3`.
- `port`: 3773, `host`: 127.0.0.1, `serviceUnit`: `t3-code.service`.

### 2. Aktuelle und neueste Version ermitteln

```bash
t3 --version
npm view t3 version            # neueste Stable
npm view t3@nightly version    # neueste Nightly
```

Nur aktualisieren, wenn eine neuere Version existiert. Auf den konfigurierten
Kanal achten: Nightly-Installationen enthalten `-nightly` in der Version.

### 3. Backup der Datenbank

Die state.sqlite kann mehrere GB groß sein. Immer vorher sichern:

```bash
cp ~/.t3/userdata/state.sqlite ~/.t3/backups/state.sqlite.before-update-$(date +%Y%m%d).sqlite
```

Vorher Anzahl der Sessions notieren (Erwartungswert für die Verifikation):

```bash
sqlite3 "file:$HOME/.t3/userdata/state.sqlite?mode=ro" "SELECT count(*) FROM auth_sessions;"
```

### 4. npm-Install (wichtig: node-pty)

Der globale npm-Install läuft mit `node-pty` und `msgpackr-extract`, deren
Postinstall-Skripte native Module bauen. Wird das blockiert, ist das Terminal
der Workbench nach dem Update kaputt (Fehler: "Failed to load native module:
pty.node").

Stelle sicher, dass die allow-scripts-Config gesetzt ist:

```bash
npm config set allow-scripts=node-pty,msgpackr-extract --location=user
```

Dann installieren (Kanal aus der Config, meist `nightly`):

```bash
npm install -g --allow-scripts=node-pty,msgpackr-extract t3@nightly
```

Hinweis: `scripts/sync-t3-channel.sh` installiert bei einem reinen Neustart
nur neu, wenn sich der Kanal geändert hat. Für ein echtes Update den Install
wie oben direkt ausführen oder den Kanal in der Config wechseln.

Verifikation des nativen Moduls:

```bash
node -e "
const pty = require(process.env.HOME + '/.npm-global/lib/node_modules/t3/node_modules/node-pty');
const p = pty.spawn('echo', ['ok'], {name: 'xterm', cols: 80, rows: 24});
p.onData(d => { console.log('PTY-DATA:', JSON.stringify(d)); p.kill(); });
"
```

Erwartet: `PTY-DATA: "ok\r\n"`. Ein Fehler wie "Failed to load native module"
bedeutet: Install-Skripte wurden blockiert, Prozess hier NICHT neu starten,
sondern Installation reparieren.

### 5. Dienst neu starten

```bash
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user restart t3-code.service
systemctl --user is-active t3-code.service
```

Der Dienst ist eine User-Unit (`~/.config/systemd/user/t3-code.service`).
Kein sudo verwenden.

### 6. Verifikation

```bash
# T3 antwortet
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3773/
# neue Version
t3 --version
# Sessions unverändert (Wert muss Schritt 3 entsprechen)
sqlite3 "file:$HOME/.t3/userdata/state.sqlite?mode=ro" "SELECT count(*) FROM auth_sessions;"
# Signing-Key unverändert (Datum vor dem Update notieren)
ls -la ~/.t3/userdata/secrets/server-signing-key.bin
# Migrationen sauber gelaufen (kein Fehler)
journalctl --user -u t3-code.service --since "10 minutes ago" --no-pager | grep -iE "migration|error" | head
# Open-in-Editor-Shim vorhanden und ausführbar
ls -la ~/.t3/bin/code
# PATH der laufenden Unit enthält das Shim-Verzeichnis
tr '\0' '\n' < /proc/$(pgrep -f "t3 serve" | head -1)/environ | grep "^PATH=" | grep -q "$HOME/.t3/bin" && echo "PATH ok"
```

`auth_sessions` zählt weiterhin gleich, `server-signing-key.bin` hat dasselbe
Datum, der Signing-Key signiert die Cookies der Geräte weiterhin korrekt.
Erst dann ist das Update erfolgreich abgeschlossen.

## Rollback

Wenn etwas schiefgeht (Dienst startet nicht, Migration schlägt fehl):

```bash
# alte Version erneut installieren (Version anpassen)
npm install -g t3@0.0.32-nightly.VERSION
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user restart t3-code.service
```

Die gesicherte `state.sqlite` nur zurückspielen, wenn wirklich nötig:

```bash
systemctl --user stop t3-code.service
cp ~/.t3/backups/state.sqlite.before-update-YYYYMMDD.sqlite ~/.t3/userdata/state.sqlite
systemctl --user start t3-code.service
```

## Fehler und ihre Bedeutung

| Symptom | Ursache | Lösung |
| --- | --- | --- |
| `Failed to load native module: pty.node` | node-pty-Install-Skript blockiert | allow-scripts setzen, Install mit `--allow-scripts` wiederholen |
| `Migrations ran successfully` mit neuer Migration | Normal, kein Fehler | Sessions vorher und nachher zählen |
| Auth-Sessions sind 0 | Signing-Key oder DB wurde ersetzt | Aus Backup wiederherstellen |
| Port 3773 belegt | Alter Prozess hängt | `ss -ltnp` prüfen, Prozess beenden, Neustart |

## Wichtige Dateien (nicht löschen, nicht verändern)

- `~/.t3/userdata/state.sqlite` — Sessions, Threads, alle Daten
- `~/.t3/userdata/secrets/server-signing-key.bin` — signiert Session-Cookies
- `~/.t3/userdata/secrets/asset-access-signing-key.bin`
- `~/.t3/userdata/secrets/cloud-link-ed25519-key-pair.bin`
- `~/.npmrc` — enthält `allow-scripts=node-pty,msgpackr-extract` (notwendig für Terminal)
- `~/.t3/bin/code` — Open-in-Editor-Shim der Workbench („Command O" in T3 Code).
  Es wird von `scripts/install-t3-unit.sh` installiert und überlebt npm-Updates,
  weil es außerhalb des npm-Pakets liegt. Nicht manuell löschen oder überschreiben;
  nach einem Update bei Bedarf mit `bash scripts/install-t3-unit.sh` wiederherstellen.
