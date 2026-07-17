#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/bbecker/projects/Remote_Workplace"
main_pid="$(systemctl show -p MainPID --value benjamin-dev-workbench.service 2>/dev/null || true)"

if [[ ! "$main_pid" =~ ^[0-9]+$ ]] || [[ "$main_pid" -le 1 ]] || [[ ! -d "/proc/$main_pid" ]]; then
  exit 0
fi

process_owner="$(stat -c %u "/proc/$main_pid")"
process_cwd="$(readlink -f "/proc/$main_pid/cwd" || true)"
if [[ "$process_owner" != "$(id -u)" ]] || [[ "$process_cwd" != "$repo_root" ]]; then
  echo "Der gefundene Systemprozess gehört nicht zur Workbench; er wird nicht beendet." >&2
  exit 1
fi

kill -TERM "$main_pid"
for _ in {1..50}; do
  [[ ! -d "/proc/$main_pid" ]] && exit 0
  sleep 0.1
done

echo "Der veraltete Workbench-Systemprozess wurde nicht rechtzeitig beendet." >&2
exit 1
