#!/usr/bin/env bash
# Baut nur das Web-Frontend neu. Der laufende Server liefert die neuen Dateien sofort aus —
# ein Dienst-Neustart ist dafür nicht nötig. Lade die Seite danach neu (die UI macht das selbst).
set -euo pipefail
# shellcheck source=scripts/lib-restart.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-restart.sh"
restart_begin frontend

build_contracts
build_frontend
verify_frontend_marker
log "Frontend neu gebaut. Lade die Seite neu, um die Änderungen zu sehen."
