#!/usr/bin/env bash
# Veröffentlicht die Workbench privat im Tailnet über einen eigenen HTTPS-Port.
# Hostname und Port stammen aus config/workbench.local.json (tailscale.*).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_directory="$repo_root/deploy/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_config="$backup_directory/tailscale-serve.$timestamp.json"

# Tailscale-Hostname und HTTPS-Port aus der zentralen Config lesen.
read -r tailscale_host https_port < <(node -e '
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const dir = join(process.argv[1], "config");
  for (const name of ["workbench.local.json", "workbench.example.json"]) {
    try {
      const c = JSON.parse(readFileSync(join(dir, name), "utf8"));
      process.stdout.write(`${c.tailscale.hostname} ${c.tailscale.httpsPort ?? 8443}`);
      process.exit(0);
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  throw new Error("config/workbench.local.json oder .example.json fehlt.");
' "$repo_root")

workbench_url="https://${tailscale_host}:${https_port}/api/v1/health"

mkdir -p "$backup_directory"
# Der aktuelle Tailscale-CLI-Zweig trennt Service- und Node-Konfigurationen.
# Die Statuskopie dient der Nachvollziehbarkeit; ein Rollback entfernt nur den
# vom Skript angelegten Endpunkt und lässt Port 443 unangetastet.
sudo tailscale serve status --json > "$backup_config"

rollback() {
  sudo tailscale serve --https="$https_port" off || true
}
trap rollback ERR

# Port 443 bleibt unverändert. Die Workbench erhält einen eigenen HTTPS-Port.
sudo tailscale serve --bg --https="$https_port" http://127.0.0.1:3010
curl --fail --silent --show-error --max-time 15 "$workbench_url" >/dev/null
trap - ERR

echo "Remote Workplace ist privat über Port ${https_port} erreichbar (${tailscale_host})."
