#!/usr/bin/env bash
# Beendet eine noch laufende, außerhalb von systemd gestartete Wrapt-Instanz
# (z. B. ein manuelles `pnpm start`), bevor der systemd-Dienst übernimmt.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
main_pid="$(systemctl show -p MainPID --value wrapt.service 2>/dev/null || true)"

if [[ ! "$main_pid" =~ ^[0-9]+$ ]] || [[ "$main_pid" -le 1 ]] || [[ ! -d "/proc/$main_pid" ]]; then
  exit 0
fi

process_owner="$(stat -c %u "/proc/$main_pid")"
process_cwd="$(readlink -f "/proc/$main_pid/cwd" || true)"
if [[ "$process_owner" != "$(id -u)" ]] || [[ "$process_cwd" != "$repo_root" ]]; then
  echo "Der gefundene Systemprozess gehört nicht zur Wrapt; er wird nicht beendet." >&2
  exit 1
fi

kill -TERM "$main_pid"
for _ in {1..50}; do
  [[ ! -d "/proc/$main_pid" ]] && exit 0
  sleep 0.1
done

echo "Der veraltete Wrapt-Systemprozess wurde nicht rechtzeitig beendet." >&2
exit 1
