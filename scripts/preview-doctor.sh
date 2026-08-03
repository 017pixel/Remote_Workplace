#!/usr/bin/env bash
# Preview-Doctor: liest Slot-, Routing- und Diagnosezustand über die lokale
# Loopback-Schnittstelle. Er verändert keinen Projektcode, schließt keine fremde
# Session und braucht kein sudo.
#
#   bash scripts/preview-doctor.sh --all
#   bash scripts/preview-doctor.sh --status
#   bash scripts/preview-doctor.sh --probe
#   bash scripts/preview-doctor.sh --logs --since 24h [--preview <id>] [--severity warn]
set -euo pipefail

BASE_URL="${WORKBENCH_BASE_URL:-http://127.0.0.1:3010}"
DATA_DIR="${WORKBENCH_DATA_DIR:-$HOME/.local/share/remote-workplace}"
TOKEN_FILE="$DATA_DIR/preview-agent-capability"

MODE=""
SINCE="1h"
PREVIEW=""
SEVERITY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) MODE="all"; shift ;;
    --status) MODE="status"; shift ;;
    --probe) MODE="probe"; shift ;;
    --logs) MODE="logs"; shift ;;
    --since) SINCE="${2:-1h}"; shift 2 ;;
    --preview) PREVIEW="${2:-}"; shift 2 ;;
    --severity) SEVERITY="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done
MODE="${MODE:-status}"

if [[ ! -r "$TOKEN_FILE" ]]; then
  echo "Capability-Token nicht gefunden: $TOKEN_FILE" >&2
  echo "Es wird beim ersten Start der Preview-Funktionen mit Modus 0600 angelegt." >&2
  exit 1
fi
TOKEN="$(tr -d '\n' < "$TOKEN_FILE")"

# Basis64url-kodiertes Rohmaterial in der Datei entspricht dem Bearer-Token.
call() {
  curl -sS --fail-with-body -H "Authorization: Bearer $TOKEN" "$BASE_URL$1"
}

# Maximal sieben Tage; ohne Angabe gilt eine Stunde.
since_iso() {
  case "$1" in
    1h) date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ ;;
    24h) date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ ;;
    7d) date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ ;;
    *) echo "Erlaubt sind 1h, 24h oder 7d." >&2; exit 2 ;;
  esac
}

status() {
  echo "== Slots und Routing =="
  call "/api/v1/previews/doctor/status"
  echo
}

probe() {
  echo "== Dienste erneut prüfen (nur Vorschläge, keine Verbindung) =="
  curl -sS --fail-with-body -X POST -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/v1/previews/doctor/probe"
  echo
}

logs() {
  local query="since=$(since_iso "$SINCE")"
  [[ -n "$PREVIEW" ]] && query+="&previewNodeId=$PREVIEW"
  [[ -n "$SEVERITY" ]] && query+="&severity=$SEVERITY"
  echo "== Redigierte Preview-Logs ($SINCE) =="
  call "/api/v1/previews/doctor/logs?$query"
  echo
}

case "$MODE" in
  status) status ;;
  probe) probe ;;
  logs) logs ;;
  all) status; probe; SINCE="${SINCE}"; logs ;;
esac
