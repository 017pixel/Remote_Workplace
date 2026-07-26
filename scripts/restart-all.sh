#!/usr/bin/env bash
# Baut Frontend und Backend neu und startet anschließend den Workbench-Dienst neu.
set -euo pipefail
# shellcheck source=scripts/lib-restart.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib-restart.sh"
restart_begin both

build_contracts
build_frontend
build_backend
sync_t3_channel
schedule_service_restart
