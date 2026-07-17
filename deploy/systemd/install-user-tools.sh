#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/bbecker/projects/Remote_Workplace"
runtime_directory="/run/user/$(id -u)"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-$runtime_directory}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$runtime_directory/bus}"

for unit in code-server.service tg-vereinsapp-preview.service benjamin-dev-workbench.service; do
  systemctl --user link "$repo_root/deploy/systemd/user/$unit" >/dev/null 2>&1 || true
done

systemctl --user daemon-reload
systemctl --user enable --now code-server.service tg-vereinsapp-preview.service benjamin-dev-workbench.service

wait_for_url() {
  local url="$1"
  for _ in {1..20}; do
    if curl --fail --silent --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "Dienst wurde nicht rechtzeitig erreichbar: $url" >&2
  return 1
}

wait_for_url http://127.0.0.1:8080/healthz
wait_for_url http://127.0.0.1:1234/
wait_for_url http://127.0.0.1:3010/api/v1/health

echo "Workbench, code-server und Preview laufen als dauerhafte Benutzer-Dienste."
