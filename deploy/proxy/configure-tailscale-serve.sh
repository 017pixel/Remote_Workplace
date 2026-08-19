#!/usr/bin/env bash
# Veröffentlicht Wrapt privat im Tailnet über einen eigenen HTTPS-Port.
# Hostname und Port stammen aus config/wrapt.local.json (tailscale.*).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
backup_directory="$repo_root/deploy/backups"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_config="$backup_directory/tailscale-serve.$timestamp.json"

# Tailscale-Hostname, Workbench-Port und Preview-Slot-Paare aus der zentralen Config lesen.
mapfile -t serve_config < <(node -e '
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const dir = join(process.argv[1], "config");
  for (const name of ["wrapt.local.json", "wrapt.example.json", "workbench.local.json"]) {
    try {
      const c = JSON.parse(readFileSync(join(dir, name), "utf8"));
      const internal = c.previews?.slotPorts ?? [3901,3902,3903,3904,3905,3906,3907,3908,3909,3910,3911,3912];
      const publicPorts = c.previews?.publicPorts ?? [8451,8452,8453,8454,8455,8456,8457,8458,8459,8460,8461,8462];
      if (internal.length !== publicPorts.length) throw new Error("Preview-Portlisten haben unterschiedliche Längen.");
      console.log(`${c.tailscale.hostname} ${c.tailscale.httpsPort ?? 8443}`);
      internal.forEach((port, index) => console.log(`${publicPorts[index]} ${port}`));
      process.exit(0);
    } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  throw new Error("config/wrapt.local.json oder config/wrapt.example.json fehlt.");
' "$repo_root")
read -r tailscale_host https_port <<<"${serve_config[0]}"

wrapt_url="https://${tailscale_host}:${https_port}/api/v1/health"

mkdir -p "$backup_directory"
# Der aktuelle Tailscale-CLI-Zweig trennt Service- und Node-Konfigurationen.
# Die Statuskopie dient der Nachvollziehbarkeit; ein Rollback entfernt nur den
# vom Skript angelegten Endpunkt und lässt Port 443 unangetastet.
sudo tailscale serve status --json > "$backup_config"

rollback() {
  restore_port() {
    local port="$1"
    local key="${tailscale_host}:${port}"
    local old_proxy
    old_proxy="$(jq -r --arg key "$key" '.Web[$key].Handlers["/"].Proxy // empty' "$backup_config")"
    if [[ -n "$old_proxy" ]]; then
      sudo tailscale serve --bg --https="$port" "$old_proxy" || true
    else
      sudo tailscale serve --https="$port" off || true
    fi
  }
  restore_port "$https_port"
  for mapping in "${serve_config[@]:1}"; do
    read -r public_port _ <<<"$mapping"
    restore_port "$public_port"
  done
}
trap rollback ERR

# Port 443 bleibt unverändert. Die Workbench erhält einen eigenen HTTPS-Port.
sudo tailscale serve --bg --https="$https_port" http://127.0.0.1:3010
for mapping in "${serve_config[@]:1}"; do
  read -r public_port internal_port <<<"$mapping"
  sudo tailscale serve --bg --https="$public_port" "http://127.0.0.1:${internal_port}"
done
curl --fail --silent --show-error --max-time 15 "$wrapt_url" >/dev/null
trap - ERR

echo "Wrapt ist privat über Port ${https_port} erreichbar (${tailscale_host})."
slot_count=$((${#serve_config[@]} - 1))
echo "Preview-Slots wurden auf ${slot_count} getrennten HTTPS-Ports eingerichtet."
