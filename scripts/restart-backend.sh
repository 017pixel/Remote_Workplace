#!/usr/bin/env bash
# Baut das Backend neu und startet den Workbench-Dienst neu. Der Build läuft sichtbar,
# der eigentliche Neustart wird losgelöst eingeplant, damit er den aktuellen Prozess überlebt.
set -euo pipefail
# shellcheck source=scripts/lib-restart.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-restart.sh"
restart_begin backend

build_contracts
build_backend
sync_t3_channel
sync_opencode_web
schedule_service_restart
