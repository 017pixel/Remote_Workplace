#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/bbecker/projects/Remote_Workplace"
backup_directory="$repo_root/deploy/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_config="$backup_directory/tailscale-serve.$timestamp.json"
workbench_url="https://benjaminsserver.tail6494b7.ts.net:8443/api/v1/health"

mkdir -p "$backup_directory"
# Der aktuelle Tailscale-CLI-Zweig trennt Service- und Node-Konfigurationen.
# Die Statuskopie dient der Nachvollziehbarkeit; ein Rollback entfernt nur den
# vom Skript angelegten 8443-Endpunkt und lässt Port 443 unangetastet.
sudo tailscale serve status --json > "$backup_config"

rollback() {
  sudo tailscale serve --https=8443 off || true
}
trap rollback ERR

# Port 443 bleibt unverändert bei T3 Code. Die Workbench erhält einen eigenen HTTPS-Port.
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3010
curl --fail --silent --show-error --max-time 15 "$workbench_url" >/dev/null
trap - ERR

echo "Workbench, code-server und Preview-Proxy sind privat über Port 8443 erreichbar."
