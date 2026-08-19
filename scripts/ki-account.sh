#!/usr/bin/env bash
# Schaltet den serverweit aktiven Account von Codex, Claude Code oder OpenCode um.
#
# Umgeschaltet wird ausschliesslich die Anmeldedatei im gemeinsamen Home des Werkzeugs
# (auth.json bzw. .credentials.json) — als Symlink in den Anmeldespeicher des gewaehlten
# Accounts. Konfiguration, Sessions und Verlauf bleiben gemeinsam, es gibt also weiterhin nur
# einen Projekt- und Sessionbestand. Jeder danach gestartete Prozess des Werkzeugs verwendet
# den neuen Account, ohne Abmeldung und ohne neue Anmeldung.
#
#   scripts/ki-account.sh                 # alle Accounts und die aktiven anzeigen
#   scripts/ki-account.sh use arbeit      # Account per Name, E-Mail oder Pfad aktivieren
#   scripts/ki-account.sh list claude     # nur die Accounts eines Werkzeugs anzeigen
set -euo pipefail

command -v python3 >/dev/null || { echo "Fehler: python3 wird benoetigt." >&2; exit 1; }

WRAPT_API="${WRAPT_API:-http://127.0.0.1:3010/api/v1}" \
CODEX_ACCOUNT_ARGS="$*" python3 - <<'PY'
import json
import os
import sys
import urllib.error
import urllib.request

api = os.environ["WRAPT_API"].rstrip("/")
args = os.environ["CODEX_ACCOUNT_ARGS"].split()
command = args[0] if args else "list"


def fail(message):
    print(f"Fehler: {message}", file=sys.stderr)
    raise SystemExit(1)


def call(path, method="GET"):
    request = urllib.request.Request(f"{api}{path}", method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            detail = json.load(error).get("message", "")
        except Exception:
            pass
        fail(detail or f"Die Workbench antwortete mit HTTP {error.code}.")
    except urllib.error.URLError as error:
        fail(f"Die Workbench ist unter {api} nicht erreichbar ({error.reason}). "
             "Laeuft der Dienst? systemctl --user status wrapt.service")


TOOLS = {"codex": "Codex", "claude": "Claude Code", "opencode": "OpenCode"}
# Kurzformen, damit "use claude" nicht mit einem Accountnamen kollidiert.
ALIASES = {"codex": "codex", "claude": "claude", "claudecode": "claude", "opencode": "opencode"}


def all_accounts(provider=None):
    accounts = call("/accounts")["accounts"]
    if provider:
        accounts = [a for a in accounts if a["provider"] == provider]
    if not accounts:
        fail("Es ist kein passender Account registriert. "
             "Lege in der Workbench unter Nutzung -> Accounts einen an.")
    return accounts


def fields(account):
    return [account["label"].lower(), (account["email"] or "").lower(), account["profilePath"].lower()]


if command in ("list", "ls", "status"):
    provider = ALIASES.get(args[1].lower()) if len(args) > 1 else None
    accounts = all_accounts(provider)
    width = max(len(a["label"]) for a in accounts)
    for tool in TOOLS:
        group = [a for a in accounts if a["provider"] == tool]
        if not group:
            continue
        print(f"{TOOLS[tool]}:")
        for account in sorted(group, key=lambda a: (not a["active"], a["label"])):
            mark = "*" if account["active"] else " "
            email = account["email"] or "-"
            plan = account["plan"] or "-"
            print(f"  {mark} {account['label']:<{width}}  {email:<32} {plan:<12} {account['profilePath']}")
        print()
    print("* = serverweit aktiv")

elif command in ("use", "switch", "activate"):
    if len(args) < 2:
        fail('Bitte einen Account angeben, z. B. "ki-account.sh use arbeit".')
    # Ein fuehrendes Werkzeug grenzt die Suche ein: "use claude privat".
    rest = args[1:]
    provider = ALIASES.get(rest[0].lower()) if len(rest) > 1 else None
    if provider:
        rest = rest[1:]
    needle = " ".join(rest).strip().lower()
    accounts = all_accounts(provider)

    # Erst exakt, dann als Teilstring — so gewinnt ein genauer Name immer gegen eine Teiluebereinstimmung.
    matches = [a for a in accounts if needle in fields(a)]
    matches = matches or [a for a in accounts if any(needle in field for field in fields(a))]
    if not matches:
        fail(f'Kein Account passt zu "{needle}". "ki-account.sh list" zeigt alle an.')
    if len(matches) > 1:
        names = "\n  ".join(f'{a["label"]} ({TOOLS[a["provider"]]})' for a in matches)
        fail(f'"{needle}" passt auf mehrere Accounts:\n  {names}')

    account = matches[0]
    tool = TOOLS[account["provider"]]
    if account["active"]:
        print(f"{account['label']} ist bereits der aktive {tool}-Account.")
        raise SystemExit(0)

    result = call(f"/accounts/{account['id']}/activate", method="POST")
    print(f"{result['account']['label']} ist jetzt der aktive {tool}-Account.")
    if result.get("migratedTo"):
        print(f"Der Account hat dafuer einen eigenen Anmeldespeicher unter {result['migratedTo']} bekommen.")
    elif result.get("adoptedInto"):
        print(f"Die zuvor direkt hinterlegten Zugangsdaten wurden nach {result['adoptedInto']} uebernommen.")
    elif result.get("backupPath"):
        print(f"Die zuvor direkt hinterlegten Zugangsdaten liegen als Sicherung unter {result['backupPath']}.")
    print(f"Alle ab jetzt gestarteten {tool}-Prozesse nutzen diesen Account.")

elif command in ("-h", "--help", "help"):
    print("ki-account.sh                     alle Accounts und die aktiven anzeigen")
    print("ki-account.sh list <werkzeug>     nur codex, claude oder opencode anzeigen")
    print("ki-account.sh use <name>          Account per Name, E-Mail oder Pfad aktivieren")
    print("ki-account.sh use <werkzeug> <name>  bei mehrdeutigen Namen das Werkzeug voranstellen")
    print()
    print("Umgeschaltet wird nur die Anmeldung. Projekte, Sessions und Konfiguration")
    print("bleiben gemeinsam; eine erneute Anmeldung ist nie noetig.")

else:
    fail(f'Unbekannter Befehl "{command}". Erlaubt sind: list, use, help.')
PY
